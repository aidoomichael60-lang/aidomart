import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, createNotification, recordActivityLog } from '../db.ts';
import { escapeHtml, sanitizeText } from '../security.ts';
import { sendTransactionalEmail } from '../email.ts';
import {
  getAppBaseUrl,
  getPlatformSetting,
  PRIVATE_UPLOAD_DIR,
  requireAuth,
  requireRole,
} from '../middleware.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

function buildOverviewData() {
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS totalBuyers,
        (SELECT COUNT(*) FROM users WHERE role = 'seller') AS totalSellers,
        (SELECT COUNT(*) FROM seller_profiles WHERE application_status IN ('Pending Review', 'Additional Information Required', 'Draft')) AS pendingSellers,
        (SELECT COUNT(*) FROM seller_profiles WHERE application_status = 'Draft') AS draftSellers,
        (SELECT COUNT(*) FROM seller_profiles WHERE application_status = 'Approved') AS approvedSellers,
        (SELECT COUNT(*) FROM seller_profiles WHERE verified_badge = 1) AS verifiedSellers,
        (SELECT COUNT(*) FROM products WHERE published = 1 AND moderated_reason IS NULL) AS publishedProducts,
        (SELECT COUNT(*) FROM orders) AS totalOrders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_status != 'Cancelled') AS totalOrderVolume,
        (SELECT COALESCE(SUM(amount_confirmed), 0) FROM payments WHERE status = 'Payment Confirmed') AS confirmedPaymentVolume,
        (SELECT COUNT(*) FROM complaints WHERE status IN ('Open', 'Under Review')) AS openComplaints`
    )
    .get() as Record<string, number>;

  const emailLogs = db
    .prepare(
      `SELECT id, recipient_email AS recipientEmail, subject, event_type AS eventType,
              status, brevo_message_id AS brevoMessageId, error_message AS errorMessage,
              attempts, created_at AS createdAt
       FROM email_logs
       ORDER BY id DESC
       LIMIT 30`
    )
    .all();

  const activityLogs = db
    .prepare(
      `SELECT id, actor_user_id AS actorUserId, actor_email AS actorEmail, actor_role AS actorRole,
              event_type AS eventType, summary, details, created_at AS createdAt
       FROM activity_logs
       ORDER BY id DESC
       LIMIT 50`
    )
    .all();

  const brevoConfigured = Boolean(process.env.BREVO_API_KEY?.trim());
  const promoCreatorPolicy = getPlatformSetting('promo_creator_policy', 'buyer');
  const requireLoginEmailOtp = getPlatformSetting('require_login_email_otp', 'true') === 'true';

  return {
    counts,
    emailLogs,
    activityLogs,
    settings: {
      brevoConfigured,
      promoCreatorPolicy,
      requireLoginEmailOtp,
    },
  };
}

function buildSellersData() {
  // Ensure any seller user missing a profile row still appears for admin verification
  const orphanSellers = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'seller' AND sp.id IS NULL`
    )
    .all() as Array<{ id: number; full_name: string; email: string; phone: string | null }>;

  if (orphanSellers.length > 0) {
    const insertMissingProfile = db.prepare(
      `INSERT OR IGNORE INTO seller_profiles (
        user_id, legal_name, business_name, email, phone, description,
        categories_json, physical_address, location_city, delivery_pickup_notes,
        application_status, verified_badge
      ) VALUES (?, ?, ?, ?, ?, '', '[]', '', '', '', 'Pending Review', 0)`
    );
    for (const u of orphanSellers) {
      const fallbackBiz = `${(u.full_name || 'Seller').split(/\s+/)[0]}'s Store`;
      insertMissingProfile.run(u.id, u.full_name, fallbackBiz, u.email, u.phone || '');
    }
  }

  const rows = db
    .prepare(
      `SELECT sp.*, u.email_verified, u.account_status, u2.full_name AS reviewed_by_name
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN users u2 ON u2.id = sp.reviewed_by_id
       ORDER BY
         CASE sp.application_status
           WHEN 'Pending Review' THEN 1
           WHEN 'Additional Information Required' THEN 2
           WHEN 'Draft' THEN 3
           WHEN 'Approved' THEN 4
           ELSE 5
         END,
         sp.updated_at DESC`
    )
    .all() as Record<string, any>[];

  return rows.map((row) => {
    const documents = db
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes,
                doc_type AS docType, uploaded_at AS uploadedAt
         FROM seller_documents WHERE seller_profile_id = ? ORDER BY uploaded_at DESC`
      )
      .all(row.id);

    const auditLogs = db
      .prepare(
        `SELECT sal.id, sal.action, sal.previous_status AS previousStatus, sal.new_status AS newStatus,
                sal.verified_badge_state AS verifiedBadgeState,
                sal.physical_inspection_conducted AS physicalInspectionConducted,
                sal.notes, sal.created_at AS createdAt, COALESCE(u.full_name, 'System') AS actorName
         FROM seller_audit_logs sal
         LEFT JOIN users u ON u.id = sal.actor_user_id
         WHERE sal.seller_profile_id = ?
         ORDER BY sal.created_at DESC, sal.id DESC`
      )
      .all(row.id);

    return {
      id: row.id,
      userId: row.user_id,
      legalName: row.legal_name,
      businessName: row.business_name,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      accountStatus: row.account_status,
      phone: row.phone,
      description: row.description,
      categories: JSON.parse(row.categories_json || '[]'),
      physicalAddress: row.physical_address,
      locationCity: row.location_city,
      deliveryPickupNotes: row.delivery_pickup_notes,
      storefrontImage: row.storefront_image,
      businessPhotos: JSON.parse(row.business_photos_json || '[]'),
      applicationStatus: row.application_status,
      verifiedBadge: Boolean(row.verified_badge),
      adminFeedback: row.admin_feedback,
      physicalInspectionConducted: Boolean(row.physical_inspection_conducted),
      physicalInspectionDate: row.physical_inspection_date,
      physicalInspectionNotes: row.physical_inspection_notes,
      reviewedByName: row.reviewed_by_name,
      reviewedAt: row.reviewed_at,
      documents,
      auditLogs,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

adminRouter.get('/bootstrap', (req: Request, res: Response) => {
  const ref = sanitizeText(req.query.ref, 60);
  const overview = buildOverviewData();
  const sellers = buildSellersData();

  const users = db
    .prepare(
      `SELECT u.id, u.email, u.full_name AS fullName, u.phone, u.role,
              u.email_verified AS emailVerified, u.account_status AS accountStatus, u.created_at AS createdAt,
              sp.business_name AS businessName
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all()
    .map((u: any) => ({ ...u, emailVerified: Boolean(u.emailVerified) }));

  const products = db
    .prepare(
      `SELECT p.id, p.title, p.price, p.stock, p.published, p.moderated_reason AS moderatedReason,
              p.created_at AS createdAt, c.name AS categoryName, sp.business_name AS sellerBusinessName
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN seller_profiles sp ON sp.user_id = p.seller_id
       ORDER BY p.created_at DESC`
    )
    .all()
    .map((p: any) => ({ ...p, published: Boolean(p.published) }));

  const categories = db.prepare(`SELECT * FROM categories ORDER BY id ASC`).all();

  const promotions = db
    .prepare(
      `SELECT pr.*, sp.business_name AS sellerBusinessName, p.title AS productTitle
       FROM seller_promotions pr
       JOIN seller_profiles sp ON sp.user_id = pr.seller_id
       LEFT JOIN products p ON p.id = pr.product_id
       ORDER BY pr.created_at DESC`
    )
    .all();

  let orderSql = `
    SELECT o.id, o.order_reference AS orderReference, o.buyer_name AS buyerName, o.buyer_email AS buyerEmail,
           o.total_amount AS totalAmount, o.order_status AS orderStatus, o.fulfillment_method AS fulfillmentMethod,
           o.created_at AS createdAt, sp.business_name AS sellerBusinessName,
           p.status AS paymentStatus, p.amount_reported AS amountReported, p.amount_confirmed AS amountConfirmed,
           p.transaction_reference AS transactionReference
    FROM orders o
    JOIN seller_profiles sp ON sp.user_id = o.seller_id
    LEFT JOIN payments p ON p.order_id = o.id
  `;
  const orderParams: any[] = [];
  if (ref) {
    orderSql += ` WHERE o.order_reference LIKE ?`;
    orderParams.push(`%${ref}%`);
  }
  orderSql += ` ORDER BY o.created_at DESC LIMIT 100`;
  const orders = db.prepare(orderSql).all(...orderParams);

  const complaints = db
    .prepare(
      `SELECT c.id, c.order_id AS orderId, o.order_reference AS orderReference,
              c.reporter_id AS reporterId, u.full_name AS reporterName, u.role AS reporterRole,
              sp_rep.business_name AS reporterBusinessName,
              c.target_seller_id AS targetSellerId, sp.business_name AS targetSellerName,
              c.subject, c.message, c.status, c.seller_response AS sellerResponse,
              c.admin_notes AS adminNotes, c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM complaints c
       JOIN users u ON u.id = c.reporter_id
       LEFT JOIN seller_profiles sp_rep ON sp_rep.user_id = c.reporter_id
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN seller_profiles sp ON sp.user_id = c.target_seller_id
       ORDER BY c.created_at DESC`
    )
    .all();

  return res.json({
    overview,
    sellers,
    users,
    products,
    categories,
    promotions,
    orders,
    complaints,
  });
});

adminRouter.get('/overview', (_req: Request, res: Response) => {
  return res.json(buildOverviewData());
});

adminRouter.put('/settings', (req: Request, res: Response) => {
  const promoCreatorPolicy = sanitizeText(req.body?.promoCreatorPolicy, 20);
  const requireLoginEmailOtp = req.body?.requireLoginEmailOtp;

  if (promoCreatorPolicy && ['buyer', 'seller', 'both'].includes(promoCreatorPolicy)) {
    db.prepare(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('promo_creator_policy', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(promoCreatorPolicy);
  }
  if (typeof requireLoginEmailOtp === 'boolean') {
    db.prepare(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('require_login_email_otp', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(requireLoginEmailOtp ? 'true' : 'false');
  }

  return res.json({ message: 'Platform settings updated.' });
});

adminRouter.get('/sellers', (_req: Request, res: Response) => {
  return res.json({ sellers: buildSellersData() });
});

adminRouter.get('/documents/:docId', (req: Request, res: Response) => {
  const docId = Number(req.params.docId);
  if (!Number.isFinite(docId)) return res.status(400).json({ error: 'Invalid document ID.' });

  const doc = db
    .prepare(`SELECT original_name, stored_path, mime_type FROM seller_documents WHERE id = ?`)
    .get(docId) as { original_name: string; stored_path: string; mime_type: string } | undefined;

  if (!doc) return res.status(404).json({ error: 'Document not found.' });

  const safeName = path.basename(doc.stored_path);
  const fullPath = path.join(PRIVATE_UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Stored file missing on disk.' });
  }

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  return res.sendFile(fullPath);
});

adminRouter.post('/sellers/:profileId/review', async (req: Request, res: Response) => {
  const admin = req.authUser!;
  const profileId = Number(req.params.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return res.status(400).json({ error: 'Invalid seller profile ID.' });
  }

  const profile = db.prepare(`SELECT * FROM seller_profiles WHERE id = ?`).get(profileId) as
    | Record<string, any>
    | undefined;
  if (!profile) {
    return res.status(404).json({ error: 'Seller application not found.' });
  }

  const allowedStatuses = new Set([
    'Draft',
    'Pending Review',
    'Additional Information Required',
    'Approved',
    'Rejected',
    'Suspended',
  ]);

  const newStatus = sanitizeText(req.body?.applicationStatus, 60);
  if (!allowedStatuses.has(newStatus)) {
    return res.status(400).json({ error: 'Invalid seller application status.' });
  }

  const grantVerifiedBadge =
    newStatus === 'Approved' ? (req.body?.verifiedBadge ? 1 : 0) : 0;

  const physicalInspectionConducted = req.body?.physicalInspectionConducted ? 1 : 0;
  const physicalInspectionDate = physicalInspectionConducted
    ? sanitizeText(req.body?.physicalInspectionDate, 40) || new Date().toISOString().slice(0, 10)
    : null;
  const physicalInspectionNotes = physicalInspectionConducted
    ? sanitizeText(req.body?.physicalInspectionNotes, 600)
    : null;
  const adminFeedback = sanitizeText(req.body?.adminFeedback, 1000);

  db.transaction(() => {
    db.prepare(
      `UPDATE seller_profiles
       SET application_status = ?, verified_badge = ?, admin_feedback = ?,
           physical_inspection_conducted = ?, physical_inspection_date = ?, physical_inspection_notes = ?,
           reviewed_by_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      newStatus,
      grantVerifiedBadge,
      adminFeedback || null,
      physicalInspectionConducted,
      physicalInspectionDate,
      physicalInspectionNotes,
      admin.id,
      profileId
    );

    db.prepare(
      `INSERT INTO seller_audit_logs (
        seller_profile_id, actor_user_id, action, previous_status, new_status,
        verified_badge_state, physical_inspection_conducted, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      profileId,
      admin.id,
      `Admin Review: ${newStatus}`,
      profile.application_status,
      newStatus,
      grantVerifiedBadge,
      physicalInspectionConducted,
      adminFeedback || `Status updated to ${newStatus}. Verified Badge: ${grantVerifiedBadge ? 'Granted' : 'Not Granted'}.`
    );

    createNotification({
      userId: profile.user_id,
      title: `Seller Application: ${newStatus}`,
      message:
        adminFeedback ||
        `Your AIDOMART seller application status is now ${newStatus}.`,
      link: '/seller-dashboard',
      type: 'seller_review',
    });
  })();

  recordActivityLog({
    actorUserId: admin.id,
    actorEmail: admin.email,
    actorRole: 'admin',
    eventType: 'admin_seller_review',
    summary: `Admin set ${profile.business_name} to ${newStatus}${grantVerifiedBadge ? ' (Verified Badge)' : ''}`,
    details: adminFeedback || profile.email,
  });

  const baseUrl = getAppBaseUrl(req);
  const emailRes = await sendTransactionalEmail({
    toEmail: profile.email,
    toName: profile.business_name,
    subject: `AIDOMART Seller Application Update — ${newStatus}`,
    eventType: `seller_review_${newStatus.toLowerCase().replace(/\s+/g, '_')}`,
    headline: `Seller Application: ${newStatus}`,
    bodyHtml: `
      <p>Hello ${escapeHtml(profile.legal_name)},</p>
      <p>An AIDOMART administrator has reviewed your seller application for <strong>${escapeHtml(profile.business_name)}</strong>.</p>
      <p><strong>Updated Status:</strong> ${escapeHtml(newStatus)}<br/>
         <strong>Verified Seller Badge:</strong> ${grantVerifiedBadge ? 'Granted' : 'Not Granted'}</p>
      ${adminFeedback ? `<p><strong>Administrator Notes:</strong> ${escapeHtml(adminFeedback)}</p>` : ''}
    `,
    ctaLabel: 'Open Seller Dashboard',
    ctaUrl: `${baseUrl}/seller-dashboard`,
  }).catch(() => ({ delivered: false, status: 'failed' as const }));

  return res.json({
    message: `Seller status updated to ${newStatus}.`,
    applicationStatus: newStatus,
    verifiedBadge: Boolean(grantVerifiedBadge),
    emailDelivered: emailRes.delivered,
  });
});

adminRouter.get('/users', (_req: Request, res: Response) => {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.full_name AS fullName, u.phone, u.role,
              u.email_verified AS emailVerified, u.account_status AS accountStatus, u.created_at AS createdAt,
              sp.business_name AS businessName
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all()
    .map((u: any) => ({ ...u, emailVerified: Boolean(u.emailVerified) }));

  return res.json({ users });
});

adminRouter.patch('/users/:id/status', (req: Request, res: Response) => {
  const targetId = Number(req.params.id);
  const accountStatus = sanitizeText(req.body?.accountStatus, 30);
  if (!['Active', 'Restricted', 'Suspended'].includes(accountStatus)) {
    return res.status(400).json({ error: 'Invalid account status.' });
  }
  if (targetId === req.authUser!.id) {
    return res.status(400).json({ error: 'You cannot restrict or suspend your own administrator account.' });
  }

  db.prepare(`UPDATE users SET account_status = ? WHERE id = ?`).run(accountStatus, targetId);
  if (accountStatus === 'Suspended') {
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(targetId);
  }
  return res.json({ message: `Account status updated to ${accountStatus}.` });
});

adminRouter.get('/products', (_req: Request, res: Response) => {
  const products = db
    .prepare(
      `SELECT p.id, p.title, p.price, p.stock, p.published, p.moderated_reason AS moderatedReason,
              p.created_at AS createdAt, c.name AS categoryName, sp.business_name AS sellerBusinessName
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN seller_profiles sp ON sp.user_id = p.seller_id
       ORDER BY p.created_at DESC`
    )
    .all()
    .map((p: any) => ({ ...p, published: Boolean(p.published) }));
  return res.json({ products });
});

adminRouter.patch('/products/:id/moderate', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const moderatedReason = sanitizeText(req.body?.moderatedReason, 300);
  const clearModeration = Boolean(req.body?.clearModeration);

  if (clearModeration) {
    db.prepare(`UPDATE products SET moderated_reason = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
    return res.json({ message: 'Product moderation cleared.' });
  }
  db.prepare(`UPDATE products SET moderated_reason = ?, updated_at = datetime('now') WHERE id = ?`).run(
    moderatedReason || 'Removed by administrator moderation.',
    id
  );
  return res.json({ message: 'Product hidden from public marketplace.' });
});

adminRouter.get('/categories', (_req: Request, res: Response) => {
  const categories = db.prepare(`SELECT * FROM categories ORDER BY id ASC`).all();
  return res.json({ categories });
});

adminRouter.post('/categories', (req: Request, res: Response) => {
  const name = sanitizeText(req.body?.name, 80);
  const description = sanitizeText(req.body?.description, 300);
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    db.prepare(`INSERT INTO categories (name, slug, description, active) VALUES (?, ?, ?, 1)`).run(
      name,
      slug,
      description
    );
    return res.status(201).json({ message: 'Category added.' });
  } catch {
    return res.status(409).json({ error: 'Category already exists.' });
  }
});

adminRouter.patch('/categories/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const active = req.body?.active ? 1 : 0;
  db.prepare(`UPDATE categories SET active = ? WHERE id = ?`).run(active, id);
  return res.json({ message: 'Category updated.' });
});

adminRouter.get('/promotions', (_req: Request, res: Response) => {
  const promotions = db
    .prepare(
      `SELECT pr.*, sp.business_name AS sellerBusinessName, p.title AS productTitle
       FROM seller_promotions pr
       JOIN seller_profiles sp ON sp.user_id = pr.seller_id
       LEFT JOIN products p ON p.id = pr.product_id
       ORDER BY pr.created_at DESC`
    )
    .all();
  return res.json({ promotions });
});

adminRouter.patch('/promotions/:id/review', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const status = sanitizeText(req.body?.status, 30);
  const adminNote = sanitizeText(req.body?.adminNote, 400);
  if (!['Published', 'Rejected', 'Unpublished'].includes(status)) {
    return res.status(400).json({ error: 'Invalid promotion status.' });
  }
  db.prepare(
    `UPDATE seller_promotions SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, adminNote || null, id);
  return res.json({ message: `Promotion updated to ${status}.` });
});

adminRouter.get('/orders', (req: Request, res: Response) => {
  const ref = sanitizeText(req.query.ref, 60);
  let sql = `
    SELECT o.id, o.order_reference AS orderReference, o.buyer_name AS buyerName, o.buyer_email AS buyerEmail,
           o.total_amount AS totalAmount, o.order_status AS orderStatus, o.fulfillment_method AS fulfillmentMethod,
           o.created_at AS createdAt, sp.business_name AS sellerBusinessName,
           p.status AS paymentStatus, p.amount_reported AS amountReported, p.amount_confirmed AS amountConfirmed,
           p.transaction_reference AS transactionReference
    FROM orders o
    JOIN seller_profiles sp ON sp.user_id = o.seller_id
    LEFT JOIN payments p ON p.order_id = o.id
  `;
  const params: any[] = [];
  if (ref) {
    sql += ` WHERE o.order_reference LIKE ?`;
    params.push(`%${ref}%`);
  }
  sql += ` ORDER BY o.created_at DESC LIMIT 100`;
  const orders = db.prepare(sql).all(...params);
  return res.json({ orders });
});

adminRouter.get('/complaints', (_req: Request, res: Response) => {
  const complaints = db
    .prepare(
      `SELECT c.id, c.order_id AS orderId, o.order_reference AS orderReference,
              c.reporter_id AS reporterId, u.full_name AS reporterName, u.role AS reporterRole,
              sp_rep.business_name AS reporterBusinessName,
              c.target_seller_id AS targetSellerId, sp.business_name AS targetSellerName,
              c.subject, c.message, c.status, c.seller_response AS sellerResponse,
              c.admin_notes AS adminNotes, c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM complaints c
       JOIN users u ON u.id = c.reporter_id
       LEFT JOIN seller_profiles sp_rep ON sp_rep.user_id = c.reporter_id
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN seller_profiles sp ON sp.user_id = c.target_seller_id
       ORDER BY c.created_at DESC`
    )
    .all();
  return res.json({ complaints });
});

adminRouter.patch('/complaints/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const status = sanitizeText(req.body?.status, 30);
  const adminNotes = sanitizeText(req.body?.adminNotes, 1000);
  if (!['Open', 'Under Review', 'Resolved', 'Closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid complaint status.' });
  }
  db.prepare(
    `UPDATE complaints SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, adminNotes || null, id);
  return res.json({ message: 'Complaint record updated.' });
});
