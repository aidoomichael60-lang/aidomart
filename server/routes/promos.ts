import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, recordActivityLog } from '../db.ts';
import { sanitizeText } from '../security.ts';
import { requireAuth } from '../middleware.ts';
import { computePromotionStatus } from '../promoEngine.ts';

export const promosRouter = Router();

promosRouter.use(requireAuth);

const ALLOWED_CAMPAIGN_TYPES = new Set([
  'General Promotion',
  'Special Occasion',
  'Anniversary',
  'Seasonal Sale',
  'Celebration',
  'First-Time Customers',
]);

function normalizeCampaignType(raw: unknown, firstTimeOnly: boolean): string {
  const cleaned = sanitizeText(raw, 50);
  if (cleaned && ALLOWED_CAMPAIGN_TYPES.has(cleaned)) {
    return cleaned;
  }
  return firstTimeOnly ? 'First-Time Customers' : 'General Promotion';
}

function validateAndResolveSellerProducts(
  sellerId: number,
  appliesTo: 'all' | 'selected',
  rawProductIds: unknown
): number[] {
  if (appliesTo === 'all') return [];
  if (!Array.isArray(rawProductIds)) {
    throw new Error('Please select at least one product for this promotion.');
  }
  const uniqueIds = Array.from(
    new Set(rawProductIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))
  );
  if (uniqueIds.length === 0) {
    throw new Error('Please select at least one product when targeting selected products.');
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const ownedRows = db
    .prepare(`SELECT id FROM products WHERE seller_id = ? AND id IN (${placeholders})`)
    .all(sellerId, ...uniqueIds) as Array<{ id: number }>;

  if (ownedRows.length !== uniqueIds.length) {
    throw new Error('You can only assign promotions to products in your own store.');
  }
  return ownedRows.map((r) => Number(r.id));
}

function formatPromoRow(r: Record<string, any>) {
  const targetProducts = db
    .prepare(
      `SELECT p.id, p.title, p.price, p.published
       FROM promo_code_products pcp
       JOIN products p ON p.id = pcp.product_id
       WHERE pcp.promo_code_id = ?
       ORDER BY p.title ASC`
    )
    .all(r.id) as Array<{ id: number; title: string; price: number; published: number }>;

  const usageStats = db
    .prepare(
      `SELECT COUNT(*) AS usageCount,
              COALESCE(SUM(pr.discount_amount), 0) AS totalDiscountGranted
       FROM promo_redemptions pr
       JOIN orders o ON o.id = pr.order_id
       WHERE pr.promo_code_id = ? AND o.order_status != 'Cancelled'`
    )
    .get(r.id) as { usageCount: number; totalDiscountGranted: number } | undefined;

  const appliesTo: 'all' | 'selected' = r.applies_to === 'selected' ? 'selected' : 'all';

  return {
    id: Number(r.id),
    code: String(r.code),
    title: String(r.title || r.code),
    campaignType: String(r.campaign_type || 'General Promotion'),
    discountPercent: Number(r.discount_percent),
    appliesTo,
    firstTimeOnly: Boolean(r.first_time_only),
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    manuallyEnded: Boolean(r.manually_ended),
    effectiveStatus: computePromotionStatus({
      starts_at: r.starts_at,
      expires_at: r.expires_at,
      manually_ended: Number(r.manually_ended || 0),
    }),
    sellerId: Number(r.seller_id || r.created_by_user_id),
    sellerBusinessName: r.seller_business_name || r.created_by_name || '',
    createdByUserId: Number(r.created_by_user_id),
    createdByName: r.created_by_name,
    createdByRole: r.created_by_role,
    extensionCount: Number(r.extension_count || 0),
    productIds: targetProducts.map((p) => Number(p.id)),
    products: targetProducts.map((p) => ({
      id: Number(p.id),
      title: p.title,
      price: Number(p.price),
      published: Boolean(p.published),
    })),
    usageCount: Number(usageStats?.usageCount || 0),
    totalDiscountGranted: Number(Number(usageStats?.totalDiscountGranted || 0).toFixed(2)),
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

promosRouter.get('/', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller' && user.role !== 'admin') {
    return res.status(403).json({
      error: 'Promotional codes and discounts are controlled exclusively by sellers.',
    });
  }

  const rows =
    user.role === 'admin'
      ? (db
          .prepare(
            `SELECT pc.*, u.full_name AS created_by_name, u.role AS created_by_role,
                    sp.business_name AS seller_business_name
             FROM promo_codes pc
             JOIN users u ON u.id = pc.created_by_user_id
             LEFT JOIN seller_profiles sp ON sp.user_id = COALESCE(pc.seller_id, pc.created_by_user_id)
             ORDER BY pc.created_at DESC, pc.id DESC`
          )
          .all() as Record<string, any>[])
      : (db
          .prepare(
            `SELECT pc.*, u.full_name AS created_by_name, u.role AS created_by_role,
                    sp.business_name AS seller_business_name
             FROM promo_codes pc
             JOIN users u ON u.id = pc.created_by_user_id
             LEFT JOIN seller_profiles sp ON sp.user_id = COALESCE(pc.seller_id, pc.created_by_user_id)
             WHERE COALESCE(pc.seller_id, pc.created_by_user_id) = ?
             ORDER BY pc.created_at DESC, pc.id DESC`
          )
          .all(user.id) as Record<string, any>[]);

  return res.json({
    promos: rows.map(formatPromoRow),
    policy: 'seller',
    allowed: true,
  });
});

promosRouter.post('/', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller') {
    return res.status(403).json({
      error: 'Only approved seller accounts can create store promotional codes.',
    });
  }

  const title = sanitizeText(req.body?.title, 120);
  const code = sanitizeText(req.body?.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const discountPercent = Number(req.body?.discountPercent);
  const appliesTo: 'all' | 'selected' = req.body?.appliesTo === 'selected' ? 'selected' : 'all';
  const firstTimeOnly = Boolean(req.body?.firstTimeOnly || req.body?.campaignType === 'First-Time Customers');
  const campaignType = normalizeCampaignType(req.body?.campaignType, firstTimeOnly);
  const startsAtRaw = sanitizeText(req.body?.startsAt, 40);
  const expiresAtRaw = sanitizeText(req.body?.expiresAt, 40);

  if (!title || title.length < 2) {
    return res.status(400).json({ error: 'Please enter a promotion name or campaign title.' });
  }
  if (!code || code.length < 3) {
    return res.status(400).json({ error: 'Promo code must be at least 3 letters/numbers.' });
  }
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
    return res.status(400).json({ error: 'Discount percentage must be between 1% and 90%.' });
  }

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: 'Please provide valid start and expiry dates/times.' });
  }
  if (expiresAt.getTime() <= startsAt.getTime()) {
    return res.status(400).json({ error: 'Expiry date and time must be later than the start date and time.' });
  }

  let selectedProductIds: number[] = [];
  try {
    selectedProductIds = validateAndResolveSellerProducts(user.id, appliesTo, req.body?.productIds);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const existingCode = db
    .prepare(`SELECT id FROM promo_codes WHERE UPPER(code) = ?`)
    .get(code);
  if (existingCode) {
    return res.status(409).json({ error: `Promo code "${code}" is already in use. Choose another unique code.` });
  }

  let newPromoId = 0;
  db.transaction(() => {
    const resIns = db
      .prepare(
        `INSERT INTO promo_codes (
          code, title, campaign_type, discount_percent, applies_to, first_time_only,
          starts_at, expires_at, seller_id, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        title,
        campaignType,
        Number(discountPercent.toFixed(2)),
        appliesTo,
        firstTimeOnly ? 1 : 0,
        startsAt.toISOString(),
        expiresAt.toISOString(),
        user.id,
        user.id
      );

    newPromoId = Number(resIns.lastInsertRowid);

    if (appliesTo === 'selected') {
      const insertTarget = db.prepare(
        `INSERT OR IGNORE INTO promo_code_products (promo_code_id, product_id) VALUES (?, ?)`
      );
      for (const pid of selectedProductIds) {
        insertTarget.run(newPromoId, pid);
      }
    }

    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Created Promotion', NULL, ?)`
    ).run(newPromoId, user.id, expiresAt.toISOString());
  })();

  recordActivityLog({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    eventType: 'seller_promo_created',
    summary: `Created promotion "${title}" (${code}, ${discountPercent}% off)`,
    details: `${appliesTo === 'all' ? 'All products' : `${selectedProductIds.length} selected product(s)`}${firstTimeOnly ? ' · First-time customers' : ''}`,
  });

  return res.status(201).json({
    id: newPromoId,
    message: `Promotion "${title}" (${code} — ${discountPercent}% off) created.`,
  });
});

promosRouter.put('/:id', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only sellers can edit their promotions.' });
  }

  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promotion not found.' });

  const ownerId = Number(promo.seller_id || promo.created_by_user_id);
  if (user.role !== 'admin' && ownerId !== user.id) {
    return res.status(403).json({ error: 'You can only manage promotions for your own store.' });
  }

  const title = sanitizeText(req.body?.title, 120) || String(promo.title || promo.code);
  const discountPercent =
    req.body?.discountPercent !== undefined ? Number(req.body.discountPercent) : Number(promo.discount_percent);
  const appliesTo: 'all' | 'selected' =
    req.body?.appliesTo === 'selected' || (req.body?.appliesTo === undefined && promo.applies_to === 'selected')
      ? 'selected'
      : 'all';
  const firstTimeOnly =
    req.body?.firstTimeOnly !== undefined
      ? Boolean(req.body.firstTimeOnly)
      : Boolean(promo.first_time_only);
  const campaignType = normalizeCampaignType(req.body?.campaignType ?? promo.campaign_type, firstTimeOnly);

  const startsAt = req.body?.startsAt ? new Date(sanitizeText(req.body.startsAt, 40)) : new Date(promo.starts_at);
  const expiresAt = req.body?.expiresAt ? new Date(sanitizeText(req.body.expiresAt, 40)) : new Date(promo.expires_at);

  if (!title || title.length < 2) {
    return res.status(400).json({ error: 'Please enter a valid promotion title.' });
  }
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
    return res.status(400).json({ error: 'Discount percentage must be between 1% and 90%.' });
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: 'Please provide valid start and expiry dates/times.' });
  }
  if (expiresAt.getTime() <= startsAt.getTime()) {
    return res.status(400).json({ error: 'Expiry date and time must be later than the start date and time.' });
  }

  let selectedProductIds: number[] = [];
  if (appliesTo === 'selected') {
    const rawIds =
      req.body?.productIds !== undefined
        ? req.body.productIds
        : (
            db
              .prepare(`SELECT product_id FROM promo_code_products WHERE promo_code_id = ?`)
              .all(id) as Array<{ product_id: number }>
          ).map((r) => r.product_id);
    try {
      selectedProductIds = validateAndResolveSellerProducts(ownerId, 'selected', rawIds);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE promo_codes
       SET title = ?, campaign_type = ?, discount_percent = ?, applies_to = ?, first_time_only = ?,
           starts_at = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title,
      campaignType,
      Number(discountPercent.toFixed(2)),
      appliesTo,
      firstTimeOnly ? 1 : 0,
      startsAt.toISOString(),
      expiresAt.toISOString(),
      id
    );

    db.prepare(`DELETE FROM promo_code_products WHERE promo_code_id = ?`).run(id);
    if (appliesTo === 'selected') {
      const insertTarget = db.prepare(
        `INSERT OR IGNORE INTO promo_code_products (promo_code_id, product_id) VALUES (?, ?)`
      );
      for (const pid of selectedProductIds) {
        insertTarget.run(id, pid);
      }
    }

    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Updated Promotion', ?, ?)`
    ).run(id, user.id, promo.expires_at, expiresAt.toISOString());
  })();

  return res.json({ message: `Promotion "${title}" (${promo.code}) updated.` });
});

promosRouter.patch('/:id/extend', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only sellers can manage their promotions.' });
  }

  const id = Number(req.params.id);
  const newExpiresRaw = sanitizeText(req.body?.expiresAt, 40);
  const newExpires = new Date(newExpiresRaw);

  if (Number.isNaN(newExpires.getTime()) || newExpires.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'New expiry date and time must be in the future.' });
  }

  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promotion not found.' });

  const ownerId = Number(promo.seller_id || promo.created_by_user_id);
  if (user.role !== 'admin' && ownerId !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to extend this promotion.' });
  }
  if (newExpires.getTime() <= new Date(promo.starts_at).getTime()) {
    return res.status(400).json({ error: 'Expiry date must be later than the promotion start date.' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE promo_codes
       SET expires_at = ?, manually_ended = 0, extension_count = extension_count + 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newExpires.toISOString(), id);

    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Extended Expiry', ?, ?)`
    ).run(id, user.id, promo.expires_at, newExpires.toISOString());
  })();

  return res.json({ message: `Promo code ${promo.code} extended until ${newExpires.toLocaleString()}.` });
});

promosRouter.patch('/:id/end', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only sellers can manage their promotions.' });
  }

  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promotion not found.' });

  const ownerId = Number(promo.seller_id || promo.created_by_user_id);
  if (user.role !== 'admin' && ownerId !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to deactivate this promotion.' });
  }

  db.transaction(() => {
    db.prepare(`UPDATE promo_codes SET manually_ended = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Manually Deactivated', ?, ?)`
    ).run(id, user.id, promo.expires_at, new Date().toISOString());
  })();

  return res.json({ message: `Promo code ${promo.code} has been deactivated.` });
});

promosRouter.patch('/:id/reactivate', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (user.role !== 'seller' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only sellers can manage their promotions.' });
  }

  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promotion not found.' });

  const ownerId = Number(promo.seller_id || promo.created_by_user_id);
  if (user.role !== 'admin' && ownerId !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to reactivate this promotion.' });
  }

  if (Date.now() >= new Date(promo.expires_at).getTime()) {
    return res.status(400).json({
      error: 'This promotion has already reached its expiry date. Extend its expiry date to reactivate it.',
    });
  }

  db.transaction(() => {
    db.prepare(`UPDATE promo_codes SET manually_ended = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Reactivated', ?, ?)`
    ).run(id, user.id, promo.expires_at, promo.expires_at);
  })();

  return res.json({ message: `Promo code ${promo.code} has been reactivated.` });
});
