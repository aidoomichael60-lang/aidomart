import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, createNotification, recordActivityLog } from '../db.ts';
import { escapeHtml, sanitizeText } from '../security.ts';
import { sendAdminAlertEmail, sendTransactionalEmail } from '../email.ts';
import {
  getAppBaseUrl,
  maybeMultipart,
  PRIVATE_UPLOAD_DIR,
  privateDocUpload,
  PUBLIC_UPLOAD_DIR,
  publicImageUpload,
  requireAuth,
  requireRole,
  saveBase64Files,
} from '../middleware.ts';

export const sellerRouter = Router();

sellerRouter.use(requireAuth, requireRole('seller'));

function getSellerProfileRow(userId: number) {
  return db
    .prepare(
      `SELECT sp.*, u2.full_name AS reviewed_by_name
       FROM seller_profiles sp
       LEFT JOIN users u2 ON u2.id = sp.reviewed_by_id
       WHERE sp.user_id = ?`
    )
    .get(userId) as Record<string, any> | undefined;
}

function formatSellerProfile(profile: Record<string, any>) {
  return {
    id: profile.id,
    userId: profile.user_id,
    legalName: profile.legal_name,
    businessName: profile.business_name,
    email: profile.email,
    phone: profile.phone,
    description: profile.description,
    categories: JSON.parse(profile.categories_json || '[]'),
    physicalAddress: profile.physical_address,
    locationCity: profile.location_city,
    deliveryPickupNotes: profile.delivery_pickup_notes,
    storefrontImage: profile.storefront_image,
    businessPhotos: JSON.parse(profile.business_photos_json || '[]'),
    applicationStatus: profile.application_status,
    verifiedBadge: Boolean(profile.verified_badge),
    adminFeedback: profile.admin_feedback,
    physicalInspectionConducted: Boolean(profile.physical_inspection_conducted),
    physicalInspectionDate: profile.physical_inspection_date,
    physicalInspectionNotes: profile.physical_inspection_notes,
    reviewedByName: profile.reviewed_by_name,
    reviewedAt: profile.reviewed_at,
    paymentSettings: {
      momoEnabled: Boolean(profile.momo_enabled),
      momoProvider: profile.momo_provider || '',
      momoAccountName: profile.momo_account_name || '',
      momoNumber: profile.momo_number || '',
      momoInstructions: profile.momo_instructions || '',
      bankEnabled: Boolean(profile.bank_enabled),
      bankName: profile.bank_name || '',
      bankAccountName: profile.bank_account_name || '',
      bankAccountNumber: profile.bank_account_number || '',
      bankBranch: profile.bank_branch || '',
      bankInstructions: profile.bank_instructions || '',
    },
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

sellerRouter.get('/dashboard', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile) {
    return res.status(404).json({ error: 'Seller profile not found.' });
  }

  const auditLogs = db
    .prepare(
      `SELECT sal.id, sal.action, sal.previous_status AS previousStatus, sal.new_status AS newStatus,
              sal.verified_badge_state AS verifiedBadgeState,
              sal.physical_inspection_conducted AS physicalInspectionConducted,
              sal.notes, sal.created_at AS createdAt, u.full_name AS actorName
       FROM seller_audit_logs sal
       JOIN users u ON u.id = sal.actor_user_id
       WHERE sal.seller_profile_id = ?
       ORDER BY sal.created_at DESC, sal.id DESC`
    )
    .all(profile.id);

  const documents = db
    .prepare(
      `SELECT id, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes,
              doc_type AS docType, uploaded_at AS uploadedAt
       FROM seller_documents WHERE seller_profile_id = ? ORDER BY uploaded_at DESC`
    )
    .all(profile.id);

  // Genuine database analytics (never fabricated!)
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = ?) AS totalProducts,
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND published = 1 AND moderated_reason IS NULL) AS publishedProducts,
        (SELECT COUNT(*) FROM orders WHERE seller_id = ?) AS totalOrders,
        (SELECT COUNT(*) FROM orders WHERE seller_id = ? AND order_status = 'Pending Seller Confirmation') AS pendingOrders,
        (SELECT COUNT(*) FROM payments WHERE seller_id = ? AND status = 'Payment Reported — Awaiting Seller Verification') AS pendingPaymentVerifications,
        (SELECT COALESCE(SUM(amount_confirmed), 0) FROM payments WHERE seller_id = ? AND status = 'Payment Confirmed') AS confirmedSalesTotal`
    )
    .get(sellerId, sellerId, sellerId, sellerId, sellerId, sellerId) as Record<string, number>;

  const ordersByStatus = db
    .prepare(
      `SELECT order_status AS status, COUNT(*) AS count
       FROM orders WHERE seller_id = ?
       GROUP BY order_status`
    )
    .all(sellerId);

  return res.json({
    profile: {
      id: profile.id,
      userId: profile.user_id,
      legalName: profile.legal_name,
      businessName: profile.business_name,
      email: profile.email,
      phone: profile.phone,
      description: profile.description,
      categories: JSON.parse(profile.categories_json || '[]'),
      physicalAddress: profile.physical_address,
      locationCity: profile.location_city,
      deliveryPickupNotes: profile.delivery_pickup_notes,
      storefrontImage: profile.storefront_image,
      businessPhotos: JSON.parse(profile.business_photos_json || '[]'),
      applicationStatus: profile.application_status,
      verifiedBadge: Boolean(profile.verified_badge),
      adminFeedback: profile.admin_feedback,
      physicalInspectionConducted: Boolean(profile.physical_inspection_conducted),
      physicalInspectionDate: profile.physical_inspection_date,
      physicalInspectionNotes: profile.physical_inspection_notes,
      reviewedByName: profile.reviewed_by_name,
      reviewedAt: profile.reviewed_at,
      paymentSettings: {
        momoEnabled: Boolean(profile.momo_enabled),
        momoProvider: profile.momo_provider || '',
        momoAccountName: profile.momo_account_name || '',
        momoNumber: profile.momo_number || '',
        momoInstructions: profile.momo_instructions || '',
        bankEnabled: Boolean(profile.bank_enabled),
        bankName: profile.bank_name || '',
        bankAccountName: profile.bank_account_name || '',
        bankAccountNumber: profile.bank_account_number || '',
        bankBranch: profile.bank_branch || '',
        bankInstructions: profile.bank_instructions || '',
      },
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    documents,
    auditLogs,
    analytics: {
      ...stats,
      ordersByStatus,
    },
  });
});

sellerRouter.put('/application', async (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile) {
    return res.status(404).json({ error: 'Seller profile not found.' });
  }

  const legalName = sanitizeText(req.body?.legalName, 120) || profile.legal_name;
  const businessName = sanitizeText(req.body?.businessName, 140) || profile.business_name;
  const phone = sanitizeText(req.body?.phone, 40) || profile.phone;
  const description = sanitizeText(req.body?.description, 1200);
  const physicalAddress = sanitizeText(req.body?.physicalAddress, 250);
  const locationCity = sanitizeText(req.body?.locationCity, 100);
  const deliveryPickupNotes = sanitizeText(req.body?.deliveryPickupNotes, 500);
  const categories = Array.isArray(req.body?.categories)
    ? req.body.categories.map((c: unknown) => sanitizeText(c, 60)).filter(Boolean)
    : JSON.parse(profile.categories_json || '[]');
  const submitForReview = Boolean(req.body?.submitForReview);

  let newStatus = profile.application_status;
  if (submitForReview) {
    const missing: string[] = [];
    if (!legalName) missing.push('Legal Name');
    if (!businessName) missing.push('Business Name');
    if (!phone) missing.push('Telephone Number');
    if (!physicalAddress) missing.push('Physical Business Address');
    if (!locationCity) missing.push('City / Region');
    if (!description) missing.push('Business Description');
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Please complete these required fields before submitting for approval: ${missing.join(', ')}.`,
      });
    }
    if (['Draft', 'Additional Information Required', 'Rejected'].includes(profile.application_status)) {
      newStatus = 'Pending Review';
    }
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE seller_profiles
       SET legal_name = ?, business_name = ?, phone = ?, description = ?,
           categories_json = ?, physical_address = ?, location_city = ?,
           delivery_pickup_notes = ?, application_status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      legalName,
      businessName,
      phone,
      description,
      JSON.stringify(categories),
      physicalAddress,
      locationCity,
      deliveryPickupNotes,
      newStatus,
      profile.id
    );

    db.prepare(`UPDATE users SET full_name = ?, phone = ? WHERE id = ?`).run(
      legalName,
      phone || null,
      sellerId
    );

    if (newStatus !== profile.application_status) {
      db.prepare(
        `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
         VALUES (?, ?, 'Seller Application Submitted', ?, ?, ?, ?, 'Seller submitted updated application details for admin review.')`
      ).run(
        profile.id,
        sellerId,
        profile.application_status,
        newStatus,
        profile.verified_badge,
        profile.physical_inspection_conducted
      );
    } else {
      db.prepare(
        `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
         VALUES (?, ?, 'Seller Application Updated', ?, ?, ?, ?, 'Seller updated business profile & verification details.')`
      ).run(
        profile.id,
        sellerId,
        profile.application_status,
        newStatus,
        profile.verified_badge,
        profile.physical_inspection_conducted
      );
    }
  })();

  recordActivityLog({
    actorUserId: sellerId,
    actorEmail: profile.email,
    actorRole: 'seller',
    eventType: submitForReview ? 'seller_application_submitted' : 'seller_application_saved',
    summary: submitForReview
      ? `${businessName} submitted their seller application for Admin approval`
      : `${businessName} saved business profile changes`,
    details: `Status: ${newStatus}`,
  });

  if (submitForReview && newStatus === 'Pending Review') {
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        title: 'Seller Application Submitted for Review',
        message: `${businessName} (${legalName}) submitted their seller application for approval.`,
        link: '/admin?tab=sellers',
        type: 'seller_application',
      });
    }

    const baseUrl = getAppBaseUrl(req);
    await sendTransactionalEmail({
      toEmail: profile.email,
      toName: businessName,
      subject: 'AIDOMART Seller Application Received',
      eventType: 'seller_application_submitted',
      headline: 'Seller Application Submitted for Review',
      bodyHtml: `<p>Your seller application for <strong>${escapeHtml(businessName)}</strong> is now marked <strong>Pending Review</strong>. An AIDOMART administrator will review your business information and supporting documents.</p>`,
    }).catch(() => {});

    await sendAdminAlertEmail({
      subject: `AIDOMART Admin Alert: Seller Ready for Approval — ${businessName}`,
      eventType: 'admin_seller_submitted_review',
      headline: 'Seller Application Submitted for Review',
      bodyHtml: `
        <p>A seller has submitted or updated their application and is waiting for your approval:</p>
        <div style="margin:16px 0;padding:14px 16px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;color:#1E293B;line-height:1.7;">
          <strong>Business Name:</strong> ${escapeHtml(businessName)}<br/>
          <strong>Legal Name:</strong> ${escapeHtml(legalName)}<br/>
          <strong>Email:</strong> ${escapeHtml(profile.email)}<br/>
          <strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}<br/>
          <strong>Address:</strong> ${escapeHtml([physicalAddress, locationCity].filter(Boolean).join(', ') || 'Not provided')}
        </div>
      `,
      ctaLabel: 'Review & Approve Seller',
      ctaUrl: `${baseUrl}/admin?tab=sellers`,
    });
  }

  const refreshed = getSellerProfileRow(sellerId);
  return res.json({
    message: submitForReview
      ? 'Application saved and submitted for Administrator approval.'
      : 'Seller draft saved.',
    applicationStatus: newStatus,
    profile: refreshed ? formatSellerProfile(refreshed) : null,
  });
});

sellerRouter.post(
  '/application/documents',
  maybeMultipart(privateDocUpload.array('documents', 6)),
  (req: Request, res: Response) => {
    const sellerId = req.authUser!.id;
    const profile = getSellerProfileRow(sellerId);
    if (!profile) return res.status(404).json({ error: 'Seller profile not found.' });

    const multipartFiles = (req.files as Express.Multer.File[]) || [];
    const savedList =
      multipartFiles.length > 0
        ? multipartFiles.map((f) => ({
            filename: f.filename,
            originalName: f.originalname.slice(0, 180),
            mimeType: f.mimetype,
            sizeBytes: f.size,
          }))
        : saveBase64Files(req.body?.files, {
            kind: 'document',
            destDir: PRIVATE_UPLOAD_DIR,
            maxFiles: 6,
            maxFileBytes: 8 * 1024 * 1024,
          });

    if (savedList.length === 0) {
      return res.status(400).json({ error: 'Please select at least one valid JPG, PNG, WebP, or PDF file.' });
    }

    const docType = sanitizeText(req.body?.docType, 60) || 'supporting_document';
    const insertDoc = db.prepare(
      `INSERT INTO seller_documents (seller_profile_id, original_name, stored_path, mime_type, size_bytes, doc_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const file of savedList) {
      insertDoc.run(profile.id, file.originalName, file.filename, file.mimeType, file.sizeBytes, docType);
    }

    db.prepare(
      `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
       VALUES (?, ?, 'Verification Documents Uploaded', ?, ?, ?, ?, ?)`
    ).run(
      profile.id,
      sellerId,
      profile.application_status,
      profile.application_status,
      profile.verified_badge,
      profile.physical_inspection_conducted,
      `Uploaded ${savedList.length} verification document(s): ${savedList.map((f) => f.originalName).join(', ').slice(0, 200)}`
    );

    recordActivityLog({
      actorUserId: sellerId,
      actorEmail: profile.email,
      actorRole: 'seller',
      eventType: 'seller_docs_uploaded',
      summary: `${profile.business_name} uploaded ${savedList.length} verification document(s)`,
    });

    return res.status(201).json({
      message: `${savedList.length} verification document(s) uploaded for administrator review.`,
    });
  }
);

sellerRouter.post(
  '/profile/photos',
  maybeMultipart(publicImageUpload.array('photos', 5)),
  (req: Request, res: Response) => {
    const sellerId = req.authUser!.id;
    const profile = getSellerProfileRow(sellerId);
    if (!profile) return res.status(404).json({ error: 'Seller profile not found.' });

    const kind = req.body?.kind === 'storefront' ? 'storefront' : 'business';
    const existingUrl = sanitizeText(req.body?.existingUrl, 300);

    if (kind === 'storefront' && existingUrl && existingUrl.startsWith('/uploads/public/')) {
      db.prepare(`UPDATE seller_profiles SET storefront_image = ?, updated_at = datetime('now') WHERE id = ?`).run(
        existingUrl,
        profile.id
      );
      recordActivityLog({
        actorUserId: sellerId,
        actorEmail: profile.email,
        actorRole: 'seller',
        eventType: 'seller_photo_updated',
        summary: `${profile.business_name} set a new storefront profile picture`,
      });
      const refreshed = getSellerProfileRow(sellerId);
      return res.json({
        message: 'Storefront profile picture updated.',
        storefrontImage: existingUrl,
        profile: refreshed ? formatSellerProfile(refreshed) : null,
      });
    }

    const multipartFiles = (req.files as Express.Multer.File[]) || [];
    const savedList =
      multipartFiles.length > 0
        ? multipartFiles.map((f) => ({ filename: f.filename }))
        : saveBase64Files(req.body?.files, {
            kind: 'image',
            destDir: PUBLIC_UPLOAD_DIR,
            maxFiles: 5,
            maxFileBytes: 10 * 1024 * 1024,
          });

    if (savedList.length === 0) {
      return res.status(400).json({ error: 'Please choose at least one JPG, PNG, WebP, or GIF image.' });
    }

    const urls = savedList.map((f) => `/uploads/public/${f.filename}`);

    if (kind === 'storefront') {
      db.prepare(`UPDATE seller_profiles SET storefront_image = ?, updated_at = datetime('now') WHERE id = ?`).run(
        urls[0],
        profile.id
      );
      db.prepare(
        `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
         VALUES (?, ?, 'Storefront Picture Updated', ?, ?, ?, ?, 'Seller uploaded a new storefront profile picture.')`
      ).run(
        profile.id,
        sellerId,
        profile.application_status,
        profile.application_status,
        profile.verified_badge,
        profile.physical_inspection_conducted
      );
      recordActivityLog({
        actorUserId: sellerId,
        actorEmail: profile.email,
        actorRole: 'seller',
        eventType: 'seller_photo_updated',
        summary: `${profile.business_name} updated their storefront profile picture`,
      });
      const refreshed = getSellerProfileRow(sellerId);
      return res.json({
        message: 'Profile picture updated successfully.',
        storefrontImage: urls[0],
        profile: refreshed ? formatSellerProfile(refreshed) : null,
      });
    }

    const existing = JSON.parse(profile.business_photos_json || '[]') as string[];
    const merged = [...existing, ...urls].slice(-8);
    db.prepare(`UPDATE seller_profiles SET business_photos_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
      JSON.stringify(merged),
      profile.id
    );
    recordActivityLog({
      actorUserId: sellerId,
      actorEmail: profile.email,
      actorRole: 'seller',
      eventType: 'seller_gallery_updated',
      summary: `${profile.business_name} added ${savedList.length} business gallery photo(s)`,
    });
    const refreshed = getSellerProfileRow(sellerId);
    return res.json({
      message: 'Business gallery photos uploaded.',
      businessPhotos: merged,
      profile: refreshed ? formatSellerProfile(refreshed) : null,
    });
  }
);

sellerRouter.delete('/profile/photos', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile) return res.status(404).json({ error: 'Seller profile not found.' });

  const targetUrl = sanitizeText(req.body?.url, 300);
  if (!targetUrl) return res.status(400).json({ error: 'Photo URL is required.' });

  const existing = JSON.parse(profile.business_photos_json || '[]') as string[];
  const nextPhotos = existing.filter((u) => u !== targetUrl);
  db.prepare(`UPDATE seller_profiles SET business_photos_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(nextPhotos),
    profile.id
  );
  const refreshed = getSellerProfileRow(sellerId);
  return res.json({
    message: 'Business photo removed.',
    businessPhotos: nextPhotos,
    profile: refreshed ? formatSellerProfile(refreshed) : null,
  });
});

sellerRouter.put('/profile', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile) return res.status(404).json({ error: 'Seller profile not found.' });

  const legalName =
    req.body?.legalName !== undefined ? sanitizeText(req.body.legalName, 120) : profile.legal_name;
  const businessName =
    req.body?.businessName !== undefined ? sanitizeText(req.body.businessName, 140) : profile.business_name;
  const description =
    req.body?.description !== undefined ? sanitizeText(req.body.description, 1200) : profile.description;
  const phone =
    req.body?.phone !== undefined ? sanitizeText(req.body.phone, 40) : profile.phone;
  const physicalAddress =
    req.body?.physicalAddress !== undefined
      ? sanitizeText(req.body.physicalAddress, 250)
      : profile.physical_address;
  const locationCity =
    req.body?.locationCity !== undefined ? sanitizeText(req.body.locationCity, 100) : profile.location_city;
  const deliveryPickupNotes =
    req.body?.deliveryPickupNotes !== undefined
      ? sanitizeText(req.body.deliveryPickupNotes, 500)
      : profile.delivery_pickup_notes;
  const categories = Array.isArray(req.body?.categories)
    ? req.body.categories.map((c: unknown) => sanitizeText(c, 60)).filter(Boolean)
    : JSON.parse(profile.categories_json || '[]');

  if (!businessName) {
    return res.status(400).json({ error: 'Business Name cannot be empty.' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Contact telephone number cannot be empty.' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE seller_profiles
       SET legal_name = ?, business_name = ?, description = ?, phone = ?, physical_address = ?,
           location_city = ?, delivery_pickup_notes = ?, categories_json = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      legalName || profile.legal_name,
      businessName,
      description,
      phone,
      physicalAddress,
      locationCity,
      deliveryPickupNotes,
      JSON.stringify(categories),
      profile.id
    );

    db.prepare(`UPDATE users SET full_name = ?, phone = ? WHERE id = ?`).run(
      legalName || profile.legal_name,
      phone || null,
      sellerId
    );

    db.prepare(
      `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
       VALUES (?, ?, 'Profile Updated', ?, ?, ?, ?, ?)`
    ).run(
      profile.id,
      sellerId,
      profile.application_status,
      profile.application_status,
      profile.verified_badge,
      profile.physical_inspection_conducted,
      `Updated business profile (${businessName}, ${locationCity || 'no city set'}).`
    );
  })();

  recordActivityLog({
    actorUserId: sellerId,
    actorEmail: profile.email,
    actorRole: 'seller',
    eventType: 'seller_profile_updated',
    summary: `${businessName} updated their storefront & business profile`,
    details: locationCity || physicalAddress || '',
  });

  const refreshed = getSellerProfileRow(sellerId);
  return res.json({
    message: 'Business profile updated successfully.',
    profile: refreshed ? formatSellerProfile(refreshed) : null,
  });
});

sellerRouter.put('/payment-settings', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile) return res.status(404).json({ error: 'Seller profile not found.' });

  const momoEnabled = req.body?.momoEnabled ? 1 : 0;
  const momoProvider = sanitizeText(req.body?.momoProvider, 80);
  const momoAccountName = sanitizeText(req.body?.momoAccountName, 120);
  const momoNumber = sanitizeText(req.body?.momoNumber, 40);
  const momoInstructions = sanitizeText(req.body?.momoInstructions, 500);

  const bankEnabled = req.body?.bankEnabled ? 1 : 0;
  const bankName = sanitizeText(req.body?.bankName, 120);
  const bankAccountName = sanitizeText(req.body?.bankAccountName, 120);
  const bankAccountNumber = sanitizeText(req.body?.bankAccountNumber, 60);
  const bankBranch = sanitizeText(req.body?.bankBranch, 120);
  const bankInstructions = sanitizeText(req.body?.bankInstructions, 500);

  if (momoEnabled && (!momoProvider || !momoAccountName || !momoNumber)) {
    return res.status(400).json({ error: 'Please complete all Mobile Money provider, account name, and number fields.' });
  }
  if (bankEnabled && (!bankName || !bankAccountName || !bankAccountNumber)) {
    return res.status(400).json({ error: 'Please complete all Bank Name, Account Holder Name, and Account Number fields.' });
  }

  db.prepare(
    `UPDATE seller_profiles
     SET momo_enabled = ?, momo_provider = ?, momo_account_name = ?, momo_number = ?, momo_instructions = ?,
         bank_enabled = ?, bank_name = ?, bank_account_name = ?, bank_account_number = ?, bank_branch = ?, bank_instructions = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    momoEnabled,
    momoProvider,
    momoAccountName,
    momoNumber,
    momoInstructions,
    bankEnabled,
    bankName,
    bankAccountName,
    bankAccountNumber,
    bankBranch,
    bankInstructions,
    profile.id
  );

  recordActivityLog({
    actorUserId: sellerId,
    actorEmail: profile.email,
    actorRole: 'seller',
    eventType: 'seller_payment_settings_updated',
    summary: `${profile.business_name} updated payment receiving settings`,
    details: [momoEnabled ? `MoMo: ${momoProvider}` : '', bankEnabled ? `Bank: ${bankName}` : '']
      .filter(Boolean)
      .join(' · '),
  });

  const refreshed = getSellerProfileRow(sellerId);
  return res.json({
    message: 'Payment receiving details saved successfully.',
    profile: refreshed ? formatSellerProfile(refreshed) : null,
  });
});

sellerRouter.get('/products', (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.seller_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.authUser!.id) as Record<string, any>[];

  return res.json({
    products: rows.map((r) => ({
      id: r.id,
      sellerId: r.seller_id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      categorySlug: r.category_slug,
      title: r.title,
      description: r.description,
      price: Number(r.price),
      stock: Number(r.stock),
      sizes: JSON.parse(r.sizes_json || '[]'),
      colors: JSON.parse(r.colors_json || '[]'),
      variations: JSON.parse(r.variations_json || '[]'),
      images: JSON.parse(r.images_json || '[]'),
      published: Boolean(r.published),
      moderatedReason: r.moderated_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

sellerRouter.post(
  '/products/upload-images',
  maybeMultipart(publicImageUpload.array('images', 5)),
  (req: Request, res: Response) => {
    const profile = getSellerProfileRow(req.authUser!.id);
    if (!profile || profile.application_status !== 'Approved') {
      return res.status(403).json({ error: 'Only approved sellers can upload product images.' });
    }
    const multipartFiles = (req.files as Express.Multer.File[]) || [];
    const savedList =
      multipartFiles.length > 0
        ? multipartFiles.map((f) => ({ filename: f.filename }))
        : saveBase64Files(req.body?.files, {
            kind: 'image',
            destDir: PUBLIC_UPLOAD_DIR,
            maxFiles: 5,
            maxFileBytes: 10 * 1024 * 1024,
          });

    if (savedList.length === 0) {
      return res.status(400).json({ error: 'Please select valid JPG, PNG, or WebP product images.' });
    }
    return res.status(201).json({ images: savedList.map((f) => `/uploads/public/${f.filename}`) });
  }
);

sellerRouter.post('/products', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile || profile.application_status !== 'Approved') {
    return res.status(403).json({
      error: 'Your seller application must be approved by an administrator before publishing products.',
    });
  }

  const title = sanitizeText(req.body?.title, 160);
  const description = sanitizeText(req.body?.description, 2000);
  const categoryId = Number(req.body?.categoryId);
  const price = Number(req.body?.price);
  const stock = Math.floor(Number(req.body?.stock));
  const published = req.body?.published === false ? 0 : 1;
  const sizes = Array.isArray(req.body?.sizes)
    ? req.body.sizes.map((v: unknown) => sanitizeText(v, 40)).filter(Boolean)
    : [];
  const colors = Array.isArray(req.body?.colors)
    ? req.body.colors.map((v: unknown) => sanitizeText(v, 40)).filter(Boolean)
    : [];
  const variations = Array.isArray(req.body?.variations)
    ? req.body.variations.map((v: unknown) => sanitizeText(v, 60)).filter(Boolean)
    : [];
  const images = Array.isArray(req.body?.images)
    ? req.body.images
        .map((img: unknown) => sanitizeText(img, 300))
        .filter((img: string) => img.startsWith('/uploads/public/'))
    : [];

  if (!title || !description) {
    return res.status(400).json({ error: 'Product name and description are required.' });
  }
  if (!Number.isFinite(categoryId)) {
    return res.status(400).json({ error: 'Please select a valid category.' });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Please enter a valid selling price greater than 0.' });
  }
  if (!Number.isFinite(stock) || stock < 0) {
    return res.status(400).json({ error: 'Stock quantity cannot be negative.' });
  }

  const cat = db.prepare(`SELECT id FROM categories WHERE id = ? AND active = 1`).get(categoryId);
  if (!cat) {
    return res.status(400).json({ error: 'Selected category does not exist.' });
  }

  const result = db
    .prepare(
      `INSERT INTO products (seller_id, category_id, title, description, price, stock, sizes_json, colors_json, variations_json, images_json, published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sellerId,
      categoryId,
      title,
      description,
      Number(price.toFixed(2)),
      stock,
      JSON.stringify(sizes),
      JSON.stringify(colors),
      JSON.stringify(variations),
      JSON.stringify(images),
      published
    );

  return res.status(201).json({ message: 'Product saved.', id: Number(result.lastInsertRowid) });
});

sellerRouter.put('/products/:id', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile || profile.application_status !== 'Approved') {
    return res.status(403).json({ error: 'Only approved sellers can update products.' });
  }

  const productId = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM products WHERE id = ? AND seller_id = ?`).get(productId, sellerId) as
    | Record<string, any>
    | undefined;
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const title = sanitizeText(req.body?.title, 160) || existing.title;
  const description = sanitizeText(req.body?.description, 2000) || existing.description;
  const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : existing.category_id;
  const price = req.body?.price !== undefined ? Number(req.body.price) : Number(existing.price);
  const stock = req.body?.stock !== undefined ? Math.floor(Number(req.body.stock)) : Number(existing.stock);
  const published =
    typeof req.body?.published === 'boolean' ? (req.body.published ? 1 : 0) : existing.published;
  const sizes = Array.isArray(req.body?.sizes)
    ? req.body.sizes.map((v: unknown) => sanitizeText(v, 40)).filter(Boolean)
    : JSON.parse(existing.sizes_json || '[]');
  const colors = Array.isArray(req.body?.colors)
    ? req.body.colors.map((v: unknown) => sanitizeText(v, 40)).filter(Boolean)
    : JSON.parse(existing.colors_json || '[]');
  const variations = Array.isArray(req.body?.variations)
    ? req.body.variations.map((v: unknown) => sanitizeText(v, 60)).filter(Boolean)
    : JSON.parse(existing.variations_json || '[]');
  const images = Array.isArray(req.body?.images)
    ? req.body.images
        .map((img: unknown) => sanitizeText(img, 300))
        .filter((img: string) => img.startsWith('/uploads/public/'))
    : JSON.parse(existing.images_json || '[]');

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock < 0) {
    return res.status(400).json({ error: 'Invalid price or stock value.' });
  }

  db.prepare(
    `UPDATE products
     SET category_id = ?, title = ?, description = ?, price = ?, stock = ?,
         sizes_json = ?, colors_json = ?, variations_json = ?, images_json = ?, published = ?, updated_at = datetime('now')
     WHERE id = ? AND seller_id = ?`
  ).run(
    categoryId,
    title,
    description,
    Number(price.toFixed(2)),
    stock,
    JSON.stringify(sizes),
    JSON.stringify(colors),
    JSON.stringify(variations),
    JSON.stringify(images),
    published,
    productId,
    sellerId
  );

  return res.json({ message: 'Product updated.' });
});

sellerRouter.delete('/products/:id', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const productId = Number(req.params.id);
  const hasOrders = db.prepare(`SELECT id FROM order_items WHERE product_id = ? LIMIT 1`).get(productId);
  if (hasOrders) {
    // Preserve order history integrity by unpublishing instead of breaking foreign keys
    const upd = db
      .prepare(`UPDATE products SET published = 0, updated_at = datetime('now') WHERE id = ? AND seller_id = ?`)
      .run(productId, sellerId);
    if (upd.changes === 0) return res.status(404).json({ error: 'Product not found.' });
    return res.json({ message: 'Product has existing order history, so it was unpublished instead of permanently deleted.' });
  }

  const del = db.prepare(`DELETE FROM products WHERE id = ? AND seller_id = ?`).run(productId, sellerId);
  if (del.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  return res.json({ message: 'Product deleted.' });
});

sellerRouter.get('/orders', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT o.*, sp.business_name AS seller_business_name, sp.verified_badge AS seller_verified_badge
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.seller_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(sellerId) as Record<string, any>[];

  const orders = rows.map((r) => {
    const items = db
      .prepare(
        `SELECT id, order_id AS orderId, product_id AS productId, product_title AS productTitle,
                product_image AS productImage, selected_variation AS selectedVariation,
                quantity, unit_price AS unitPrice, line_total AS lineTotal
         FROM order_items WHERE order_id = ?`
      )
      .all(r.id);

    const payment = db
      .prepare(
        `SELECT p.*, u.full_name AS verified_by_name
         FROM payments p LEFT JOIN users u ON u.id = p.verified_by_id
         WHERE p.order_id = ?`
      )
      .get(r.id) as Record<string, any> | undefined;

    const history = payment
      ? db
          .prepare(
            `SELECT ph.id, ph.action, ph.status, u.full_name AS actorName, u.role AS actorRole,
                    ph.notes, ph.created_at AS createdAt
             FROM payment_history ph
             JOIN users u ON u.id = ph.actor_user_id
             WHERE ph.payment_id = ?
             ORDER BY ph.created_at DESC, ph.id DESC`
          )
          .all(payment.id)
      : [];

    const trackingEvents = db
      .prepare(
        `SELECT ote.id, ote.stage, ote.location, ote.note, u.role AS actorRole, ote.created_at AS createdAt
         FROM order_tracking_events ote
         JOIN users u ON u.id = ote.actor_user_id
         WHERE ote.order_id = ?
         ORDER BY ote.created_at DESC, ote.id DESC`
      )
      .all(r.id);

    return {
      id: r.id,
      orderReference: r.order_reference,
      checkoutBatchRef: r.checkout_batch_ref,
      buyerId: r.buyer_id,
      buyerName: r.buyer_name,
      buyerEmail: r.buyer_email,
      buyerPhone: r.buyer_phone,
      sellerId: r.seller_id,
      sellerBusinessName: r.seller_business_name,
      sellerVerifiedBadge: Boolean(r.seller_verified_badge),
      fulfillmentMethod: r.fulfillment_method,
      deliveryAddress: r.delivery_address,
      deliveryNotes: r.delivery_notes,
      promoCodeUsed: r.promo_code_used,
      discountPercent: Number(r.discount_percent || 0),
      subtotalAmount: Number(r.subtotal_amount),
      discountAmount: Number(r.discount_amount),
      totalAmount: Number(r.total_amount),
      orderStatus: r.order_status,
      trackingStage: r.tracking_stage || 'Order Placed',
      trackingLocation: r.tracking_location || '',
      trackingNote: r.tracking_note || '',
      estimatedDelivery: r.estimated_delivery || '',
      courierContact: r.courier_contact || '',
      trackingEvents,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      items,
      payment: payment
        ? {
            id: payment.id,
            orderId: payment.order_id,
            orderReference: payment.order_reference,
            amountDue: Number(payment.amount_due),
            amountReported: payment.amount_reported !== null ? Number(payment.amount_reported) : null,
            amountConfirmed: payment.amount_confirmed !== null ? Number(payment.amount_confirmed) : null,
            paymentMethod: payment.payment_method,
            transactionReference: payment.transaction_reference,
            reportedPaidAt: payment.reported_paid_at,
            buyerNotes: payment.buyer_notes,
            status: payment.status,
            verifiedByName: payment.verified_by_name,
            verifiedAt: payment.verified_at,
            sellerNotes: payment.seller_notes,
            history,
          }
        : null,
    };
  });

  return res.json({ orders });
});

const ALLOWED_ORDER_STATUSES = new Set([
  'Pending Seller Confirmation',
  'Confirmed',
  'Processing',
  'Ready for Pickup / Dispatch',
  'Completed',
  'Cancelled',
]);

sellerRouter.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const orderId = Number(req.params.id);
  const nextStatus = sanitizeText(req.body?.orderStatus, 60);

  if (!ALLOWED_ORDER_STATUSES.has(nextStatus)) {
    return res.status(400).json({ error: 'Invalid order status.' });
  }

  const order = db
    .prepare(
      `SELECT o.*, sp.business_name
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = ? AND o.seller_id = ?`
    )
    .get(orderId, sellerId) as Record<string, any> | undefined;

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const statusToStage: Record<string, string> = {
    'Pending Seller Confirmation': 'Order Placed',
    Confirmed: 'Confirmed & Preparing',
    Processing: 'Packed & Preparing Dispatch',
    'Ready for Pickup / Dispatch': 'Dispatched / Ready for Pickup',
    Completed: 'Delivered / Completed',
    Cancelled: 'Cancelled',
  };
  const derivedStage = statusToStage[nextStatus] || nextStatus;

  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET order_status = ?, tracking_stage = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(nextStatus, derivedStage, orderId);

    db.prepare(
      `INSERT INTO order_tracking_events (order_id, stage, location, note, actor_user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      orderId,
      derivedStage,
      order.tracking_location || '',
      `Seller updated order workflow to "${nextStatus}".`,
      sellerId
    );
  })();

  createNotification({
    userId: order.buyer_id,
    title: `Order ${order.order_reference} Updated`,
    message: `${order.business_name} updated your order status to: ${nextStatus}.`,
    link: `/track-order?code=${order.order_reference}`,
    type: 'order_update',
  });

  const baseUrl = getAppBaseUrl(req);
  await sendTransactionalEmail({
    toEmail: order.buyer_email,
    toName: order.buyer_name,
    subject: `Order ${order.order_reference} — ${nextStatus}`,
    eventType: 'buyer_order_status_update',
    headline: `Order Update: ${order.order_reference}`,
    bodyHtml: `
      <p>Hello ${escapeHtml(order.buyer_name)},</p>
      <p>Seller <strong>${escapeHtml(order.business_name)}</strong> has updated order <strong>${escapeHtml(order.order_reference)}</strong> to:</p>
      <p style="font-size:16px;font-weight:700;color:#0B1F3A;">${escapeHtml(nextStatus)}</p>
    `,
    ctaLabel: 'Track Your Order',
    ctaUrl: `${baseUrl}/track-order?code=${encodeURIComponent(order.order_reference)}`,
  });

  return res.json({ message: `Order status updated to ${nextStatus}.`, orderStatus: nextStatus });
});

sellerRouter.post('/orders/:id/tracking', async (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const orderId = Number(req.params.id);
  const trackingStage = sanitizeText(req.body?.trackingStage, 80);
  const trackingLocation = sanitizeText(req.body?.trackingLocation, 140);
  const trackingNote = sanitizeText(req.body?.trackingNote, 400);
  const estimatedDelivery = sanitizeText(req.body?.estimatedDelivery, 100);
  const courierContact = sanitizeText(req.body?.courierContact, 100);
  const requestedStatus = sanitizeText(req.body?.orderStatus, 60);

  if (!trackingStage) {
    return res.status(400).json({ error: 'Please select or enter a tracking stage.' });
  }

  const order = db
    .prepare(
      `SELECT o.*, sp.business_name
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = ? AND o.seller_id = ?`
    )
    .get(orderId, sellerId) as Record<string, any> | undefined;

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const nextOrderStatus = ALLOWED_ORDER_STATUSES.has(requestedStatus)
    ? requestedStatus
    : order.order_status;

  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET order_status = ?, tracking_stage = ?, tracking_location = ?, tracking_note = ?,
           estimated_delivery = ?, courier_contact = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      nextOrderStatus,
      trackingStage,
      trackingLocation,
      trackingNote,
      estimatedDelivery,
      courierContact,
      orderId
    );

    db.prepare(
      `INSERT INTO order_tracking_events (order_id, stage, location, note, actor_user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      orderId,
      trackingStage,
      trackingLocation,
      trackingNote || `Order milestone updated to ${trackingStage}.`,
      sellerId
    );
  })();

  createNotification({
    userId: order.buyer_id,
    title: `Tracking Update: ${order.order_reference}`,
    message: `${order.business_name}: ${trackingStage}${trackingLocation ? ` (${trackingLocation})` : ''}${trackingNote ? ` — ${trackingNote}` : ''}`,
    link: `/track-order?code=${order.order_reference}`,
    type: 'tracking_update',
  });

  const baseUrl = getAppBaseUrl(req);
  await sendTransactionalEmail({
    toEmail: order.buyer_email,
    toName: order.buyer_name,
    subject: `Tracking Update for Order ${order.order_reference}: ${trackingStage}`,
    eventType: 'buyer_tracking_update',
    headline: `Order Tracking Update: ${order.order_reference}`,
    bodyHtml: `
      <p>Hello ${escapeHtml(order.buyer_name)},</p>
      <p><strong>${escapeHtml(order.business_name)}</strong> posted a tracking update for your order <strong>${escapeHtml(order.order_reference)}</strong>:</p>
      <div style="margin:16px 0;padding:14px 16px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
        <p style="margin:0 0 6px 0;"><strong>Stage:</strong> ${escapeHtml(trackingStage)}</p>
        ${trackingLocation ? `<p style="margin:0 0 6px 0;"><strong>Location:</strong> ${escapeHtml(trackingLocation)}</p>` : ''}
        ${estimatedDelivery ? `<p style="margin:0 0 6px 0;"><strong>Estimated Arrival:</strong> ${escapeHtml(estimatedDelivery)}</p>` : ''}
        ${courierContact ? `<p style="margin:0 0 6px 0;"><strong>Rider / Courier:</strong> ${escapeHtml(courierContact)}</p>` : ''}
        ${trackingNote ? `<p style="margin:0;"><strong>Note:</strong> ${escapeHtml(trackingNote)}</p>` : ''}
      </div>
    `,
    ctaLabel: 'Track Order Progress',
    ctaUrl: `${baseUrl}/track-order?code=${encodeURIComponent(order.order_reference)}`,
  });

  return res.json({
    message: `Tracking updated to "${trackingStage}". Buyer has been notified.`,
  });
});

sellerRouter.post('/payments/:orderId/verify', async (req: Request, res: Response) => {
  const seller = req.authUser!;
  const orderId = Number(req.params.orderId);
  const decision = sanitizeText(req.body?.decision, 60);
  const amountConfirmedRaw = req.body?.amountConfirmed !== undefined ? Number(req.body.amountConfirmed) : null;
  const sellerNotes = sanitizeText(req.body?.sellerNotes, 500);

  const decisionMap: Record<string, { status: string; action: string }> = {
    confirm: { status: 'Payment Confirmed', action: 'Seller Confirmed Payment Receipt' },
    not_received: { status: 'Payment Not Received', action: 'Seller Reported Payment Not Received' },
    amount_mismatch: { status: 'Payment Amount Mismatch', action: 'Seller Flagged Incorrect Amount' },
    under_review: { status: 'Payment Under Review', action: 'Seller Flagged Unmatched / Suspicious Report' },
    request_info: { status: 'Payment Under Review', action: 'Seller Requested Additional Payment Information' },
    refund_pending: { status: 'Refund Pending', action: 'Seller Marked Refund Pending' },
    refunded: { status: 'Refunded', action: 'Seller Marked Refund Completed' },
  };

  const mapped = decisionMap[decision];
  if (!mapped) {
    return res.status(400).json({ error: 'Invalid payment verification decision.' });
  }

  const row = db
    .prepare(
      `SELECT p.*, o.buyer_email, o.buyer_name, sp.business_name
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN seller_profiles sp ON sp.user_id = p.seller_id
       WHERE p.order_id = ? AND p.seller_id = ?`
    )
    .get(orderId, seller.id) as Record<string, any> | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  const confirmedAmt =
    decision === 'confirm'
      ? Number((amountConfirmedRaw && amountConfirmedRaw > 0 ? amountConfirmedRaw : row.amount_due).toFixed(2))
      : row.amount_confirmed;

  db.transaction(() => {
    db.prepare(
      `UPDATE payments
       SET status = ?, amount_confirmed = ?, verified_by_id = ?, verified_at = datetime('now'),
           seller_notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(mapped.status, confirmedAmt, seller.id, sellerNotes || null, row.id);

    db.prepare(
      `INSERT INTO payment_history (payment_id, action, status, actor_user_id, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      row.id,
      mapped.action,
      mapped.status,
      seller.id,
      sellerNotes || `${mapped.action}${confirmedAmt ? ` (GHS ${Number(confirmedAmt).toFixed(2)})` : ''}`
    );

    createNotification({
      userId: row.buyer_id,
      title: `Payment Status: ${row.order_reference}`,
      message: `${row.business_name} updated payment status to: ${mapped.status}.`,
      link: `/buyer-dashboard?order=${orderId}`,
      type: 'payment_update',
    });
  })();

  await sendTransactionalEmail({
    toEmail: row.buyer_email,
    toName: row.buyer_name,
    subject: `Payment Status Update for ${row.order_reference}`,
    eventType: 'buyer_payment_update',
    headline: `Payment Update: ${row.order_reference}`,
    bodyHtml: `
      <p>Hello ${escapeHtml(row.buyer_name)},</p>
      <p><strong>${escapeHtml(row.business_name)}</strong> updated the payment status for order <strong>${escapeHtml(row.order_reference)}</strong> to:</p>
      <p style="font-size:16px;font-weight:700;color:#0B1F3A;">${escapeHtml(mapped.status)}</p>
      ${sellerNotes ? `<p><strong>Seller Note:</strong> ${escapeHtml(sellerNotes)}</p>` : ''}
    `,
  });

  return res.json({ message: `Payment updated to ${mapped.status}.`, status: mapped.status });
});

// Homepage Marketing & Promotions for Approved Sellers
sellerRouter.get('/promotions', (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT pr.*, p.title AS productTitle
       FROM seller_promotions pr
       LEFT JOIN products p ON p.id = pr.product_id
       WHERE pr.seller_id = ?
       ORDER BY pr.created_at DESC`
    )
    .all(req.authUser!.id);
  return res.json({ promotions: rows });
});

sellerRouter.post('/promotions', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const profile = getSellerProfileRow(sellerId);
  if (!profile || profile.application_status !== 'Approved') {
    return res.status(403).json({ error: 'Only approved sellers can create homepage promotions.' });
  }

  const title = sanitizeText(req.body?.title, 120);
  const description = sanitizeText(req.body?.description, 400);
  const productId = req.body?.productId ? Number(req.body.productId) : null;
  const submit = Boolean(req.body?.submitForReview);
  const startsAt = sanitizeText(req.body?.startsAt, 40) || null;
  const expiresAt = sanitizeText(req.body?.expiresAt, 40) || null;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  let bannerImage: string | null = null;
  if (productId) {
    const prod = db
      .prepare(`SELECT id, images_json FROM products WHERE id = ? AND seller_id = ? AND published = 1`)
      .get(productId, sellerId) as { id: number; images_json: string } | undefined;
    if (!prod) {
      return res.status(400).json({ error: 'Selected featured product must belong to you and be published.' });
    }
    const imgs = JSON.parse(prod.images_json || '[]') as string[];
    bannerImage = imgs[0] || null;
  }

  const status = submit ? 'Pending Review' : 'Draft';
  db.prepare(
    `INSERT INTO seller_promotions (seller_id, product_id, title, description, banner_image, status, starts_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sellerId, productId, title, description, bannerImage, status, startsAt, expiresAt);

  return res.status(201).json({ message: submit ? 'Promotion submitted for admin approval.' : 'Promotion saved as Draft.' });
});

sellerRouter.patch('/promotions/:id', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const id = Number(req.params.id);
  const promo = db.prepare(`SELECT * FROM seller_promotions WHERE id = ? AND seller_id = ?`).get(id, sellerId) as
    | Record<string, any>
    | undefined;
  if (!promo) return res.status(404).json({ error: 'Promotion not found.' });

  const action = sanitizeText(req.body?.action, 30);
  if (action === 'unpublish') {
    db.prepare(`UPDATE seller_promotions SET status = 'Unpublished', updated_at = datetime('now') WHERE id = ?`).run(id);
    return res.json({ message: 'Promotion unpublished.' });
  }
  if (action === 'submit') {
    db.prepare(`UPDATE seller_promotions SET status = 'Pending Review', updated_at = datetime('now') WHERE id = ?`).run(id);
    return res.json({ message: 'Promotion submitted for admin review.' });
  }

  const title = sanitizeText(req.body?.title, 120) || promo.title;
  const description = sanitizeText(req.body?.description, 400) || promo.description;
  db.prepare(`UPDATE seller_promotions SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?`).run(
    title,
    description,
    id
  );
  return res.json({ message: 'Promotion updated.' });
});

sellerRouter.get('/complaints', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const complaints = db
    .prepare(
      `SELECT c.id, c.order_id AS orderId, o.order_reference AS orderReference,
              c.reporter_id AS reporterId, u.full_name AS reporterName, u.role AS reporterRole,
              c.subject, c.message, c.status, c.seller_response AS sellerResponse,
              c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM complaints c
       JOIN users u ON u.id = c.reporter_id
       LEFT JOIN orders o ON o.id = c.order_id
       WHERE c.target_seller_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(sellerId);

  const reviews = db
    .prepare(
      `SELECT r.id, r.product_id AS productId, p.title AS productTitle, u.full_name AS buyerName,
              r.rating, r.comment, r.seller_response AS sellerResponse, r.created_at AS createdAt
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       JOIN users u ON u.id = r.buyer_id
       WHERE p.seller_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(sellerId);

  return res.json({ complaints, reviews });
});

sellerRouter.post('/complaints/:id/respond', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const id = Number(req.params.id);
  const response = sanitizeText(req.body?.response, 1000);
  if (!response) return res.status(400).json({ error: 'Response text is required.' });

  const upd = db
    .prepare(
      `UPDATE complaints SET seller_response = ?, updated_at = datetime('now') WHERE id = ? AND target_seller_id = ?`
    )
    .run(response, id, sellerId);
  if (upd.changes === 0) return res.status(404).json({ error: 'Complaint not found.' });
  return res.json({ message: 'Response saved.' });
});

sellerRouter.post('/reviews/:id/respond', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const id = Number(req.params.id);
  const response = sanitizeText(req.body?.response, 800);
  if (!response) return res.status(400).json({ error: 'Reply text is required.' });

  const review = db
    .prepare(
      `SELECT r.id FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.id = ? AND p.seller_id = ?`
    )
    .get(id, sellerId);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  db.prepare(`UPDATE reviews SET seller_response = ? WHERE id = ?`).run(response, id);
  return res.json({ message: 'Reply published.' });
});

sellerRouter.get('/messages', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;

  const buyers = db
    .prepare(
      `SELECT DISTINCT u.id AS buyerId, u.full_name AS buyerName, u.phone AS buyerPhone
       FROM seller_messages sm
       JOIN users u ON u.id = sm.buyer_id
       WHERE sm.seller_id = ?`
    )
    .all(sellerId) as Array<{ buyerId: number; buyerName: string; buyerPhone: string | null }>;

  const msgStmt = db.prepare(
    `SELECT sm.id, sm.buyer_id AS buyerId, sm.seller_id AS sellerId, sm.sender_id AS senderId,
            sm.product_id AS productId, p.title AS productTitle,
            sm.order_id AS orderId, o.order_reference AS orderReference,
            sm.message, sm.is_read AS isRead, sm.created_at AS createdAt
     FROM seller_messages sm
     LEFT JOIN products p ON p.id = sm.product_id
     LEFT JOIN orders o ON o.id = sm.order_id
     WHERE sm.seller_id = ? AND sm.buyer_id = ?
     ORDER BY sm.created_at ASC, sm.id ASC`
  );

  const conversations = buyers.map((b) => {
    const messages = msgStmt.all(sellerId, b.buyerId) as Array<Record<string, any>>;
    const unreadCount = messages.filter((m) => m.senderId !== sellerId && !m.isRead).length;
    const last = messages[messages.length - 1];
    const buyerFirstName = b.buyerName.trim().split(/\s+/)[0] || b.buyerName;
    return {
      buyerId: b.buyerId,
      buyerName: buyerFirstName,
      buyerPhone: b.buyerPhone || '',
      unreadCount,
      lastMessage: last ? last.message : '',
      lastAt: last ? last.createdAt : null,
      messages: messages.map((m) => ({
        ...m,
        isRead: Boolean(m.isRead),
      })),
    };
  });

  conversations.sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  return res.json({ conversations });
});

sellerRouter.post('/messages/:buyerId', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const buyerId = Number(req.params.buyerId);
  const productId = req.body?.productId ? Number(req.body.productId) : null;
  const orderId = req.body?.orderId ? Number(req.body.orderId) : null;
  const message = sanitizeText(req.body?.message, 1200);

  if (!Number.isFinite(buyerId)) {
    return res.status(400).json({ error: 'Valid buyer is required.' });
  }
  if (!message) {
    return res.status(400).json({ error: 'Please write a reply message.' });
  }

  const profile = getSellerProfileRow(sellerId);
  const sellerDisplay = profile?.business_name || req.authUser!.fullName;

  const info = db
    .prepare(
      `INSERT INTO seller_messages (buyer_id, seller_id, sender_id, product_id, order_id, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(buyerId, sellerId, sellerId, productId, orderId, message);

  db.prepare(
    `UPDATE seller_messages SET is_read = 1
     WHERE buyer_id = ? AND seller_id = ? AND sender_id != ? AND is_read = 0`
  ).run(buyerId, sellerId, sellerId);

  createNotification({
    userId: buyerId,
    title: `Reply from ${sellerDisplay}`,
    message: message.slice(0, 140),
    link: `/buyer-dashboard?tab=messages&sellerId=${sellerId}`,
    type: 'seller_message',
  });

  return res.status(201).json({
    message: 'Reply sent to buyer.',
    id: Number(info.lastInsertRowid),
  });
});

sellerRouter.post('/messages/:buyerId/read', (req: Request, res: Response) => {
  const sellerId = req.authUser!.id;
  const buyerId = Number(req.params.buyerId);
  if (!Number.isFinite(buyerId)) {
    return res.status(400).json({ error: 'Invalid buyer.' });
  }
  db.prepare(
    `UPDATE seller_messages SET is_read = 1
     WHERE buyer_id = ? AND seller_id = ? AND sender_id != ? AND is_read = 0`
  ).run(buyerId, sellerId, sellerId);
  return res.json({ ok: true });
});
