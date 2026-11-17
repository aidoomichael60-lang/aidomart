import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { sanitizeText } from '../security.ts';
import { getPlatformSetting, requireAuth } from '../middleware.ts';

export const promosRouter = Router();

promosRouter.use(requireAuth);

function computeEffectiveStatus(row: {
  starts_at: string;
  expires_at: string;
  manually_ended: number;
}): 'Active' | 'Scheduled' | 'Expired' | 'Ended' {
  if (row.manually_ended) return 'Ended';
  const now = Date.now();
  const starts = new Date(row.starts_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  if (now < starts) return 'Scheduled';
  if (now >= expires) return 'Expired';
  return 'Active';
}

function canUserManagePromos(role: string): boolean {
  if (role === 'admin') return true;
  const policy = getPlatformSetting('promo_creator_policy', 'buyer');
  if (policy === 'both') return role === 'buyer' || role === 'seller';
  return role === policy;
}

promosRouter.get('/', (req: Request, res: Response) => {
  const user = req.authUser!;
  const policy = getPlatformSetting('promo_creator_policy', 'buyer');
  const allowed = canUserManagePromos(user.role);

  const rows =
    user.role === 'admin'
      ? (db
          .prepare(
            `SELECT pc.*, u.full_name AS created_by_name, u.role AS created_by_role
             FROM promo_codes pc JOIN users u ON u.id = pc.created_by_user_id
             ORDER BY pc.created_at DESC`
          )
          .all() as Record<string, any>[])
      : (db
          .prepare(
            `SELECT pc.*, u.full_name AS created_by_name, u.role AS created_by_role
             FROM promo_codes pc JOIN users u ON u.id = pc.created_by_user_id
             WHERE pc.created_by_user_id = ?
             ORDER BY pc.created_at DESC`
          )
          .all(user.id) as Record<string, any>[]);

  const promos = rows.map((r) => ({
    id: r.id,
    code: r.code,
    discountPercent: Number(r.discount_percent),
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    manuallyEnded: Boolean(r.manually_ended),
    effectiveStatus: computeEffectiveStatus({
      starts_at: r.starts_at,
      expires_at: r.expires_at,
      manually_ended: r.manually_ended,
    }),
    createdByUserId: r.created_by_user_id,
    createdByName: r.created_by_name,
    createdByRole: r.created_by_role,
    extensionCount: Number(r.extension_count || 0),
    createdAt: r.created_at,
  }));

  return res.json({ promos, policy, allowed });
});

promosRouter.post('/', (req: Request, res: Response) => {
  const user = req.authUser!;
  if (!canUserManagePromos(user.role)) {
    return res.status(403).json({
      error: `Promotional code creation is currently configured for ${getPlatformSetting('promo_creator_policy', 'buyer')} accounts.`,
    });
  }

  const code = sanitizeText(req.body?.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const discountPercent = Number(req.body?.discountPercent);
  const startsAtRaw = sanitizeText(req.body?.startsAt, 40);
  const expiresAtRaw = sanitizeText(req.body?.expiresAt, 40);

  if (!code || code.length < 3) {
    return res.status(400).json({ error: 'Promo code must be at least 3 alphanumeric characters.' });
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

  try {
    const resIns = db
      .prepare(
        `INSERT INTO promo_codes (code, discount_percent, starts_at, expires_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(code, Number(discountPercent.toFixed(2)), startsAt.toISOString(), expiresAt.toISOString(), user.id);

    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Created Promo Code', NULL, ?)`
    ).run(Number(resIns.lastInsertRowid), user.id, expiresAt.toISOString());

    return res.status(201).json({ message: `Promo code ${code} created (${discountPercent}% off).` });
  } catch {
    return res.status(409).json({ error: `Promo code "${code}" already exists.` });
  }
});

promosRouter.patch('/:id/extend', (req: Request, res: Response) => {
  const user = req.authUser!;
  const id = Number(req.params.id);
  const newExpiresRaw = sanitizeText(req.body?.expiresAt, 40);
  const newExpires = new Date(newExpiresRaw);

  if (Number.isNaN(newExpires.getTime()) || newExpires.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'New expiry date and time must be in the future.' });
  }

  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promo code not found.' });
  if (user.role !== 'admin' && promo.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to extend this promo code.' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE promo_codes SET expires_at = ?, manually_ended = 0, extension_count = extension_count + 1 WHERE id = ?`
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
  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE id = ?`).get(id) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promo code not found.' });
  if (user.role !== 'admin' && promo.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'You do not have permission to end this promo code.' });
  }

  db.transaction(() => {
    db.prepare(`UPDATE promo_codes SET manually_ended = 1 WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO promo_audit_logs (promo_code_id, actor_user_id, action, old_expires_at, new_expires_at)
       VALUES (?, ?, 'Manually Ended', ?, ?)`
    ).run(id, user.id, promo.expires_at, new Date().toISOString());
  })();

  return res.json({ message: `Promo code ${promo.code} has been ended.` });
});
