import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { sanitizeText } from '../security.ts';

export const marketplaceRouter = Router();

function formatProductRow(row: Record<string, any>) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    stock: Number(row.stock),
    variations: JSON.parse(row.variations_json || '[]'),
    images: JSON.parse(row.images_json || '[]'),
    published: Boolean(row.published),
    moderatedReason: row.moderated_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ratingAvg: row.rating_avg !== null && row.rating_avg !== undefined ? Number(Number(row.rating_avg).toFixed(1)) : null,
    reviewCount: Number(row.review_count || 0),
    seller: {
      id: row.seller_profile_id,
      userId: row.seller_id,
      businessName: row.business_name,
      description: row.seller_description || '',
      storefrontImage: row.storefront_image || null,
      verifiedBadge: Boolean(row.verified_badge),
      locationCity: row.location_city || '',
      deliveryPickupNotes: row.delivery_pickup_notes || '',
      phone: row.seller_phone || '',
    },
  };
}

const PRODUCT_BASE_SELECT = `
  SELECT p.*,
         c.name AS category_name,
         c.slug AS category_slug,
         sp.id AS seller_profile_id,
         sp.business_name,
         sp.description AS seller_description,
         sp.storefront_image,
         sp.verified_badge,
         sp.location_city,
         sp.delivery_pickup_notes,
         sp.phone AS seller_phone,
         (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id) AS rating_avg,
         (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN seller_profiles sp ON sp.user_id = p.seller_id
  JOIN users u ON u.id = p.seller_id
  WHERE p.published = 1
    AND p.moderated_reason IS NULL
    AND c.active = 1
    AND sp.application_status = 'Approved'
    AND u.account_status = 'Active'
`;

marketplaceRouter.get('/home', (_req: Request, res: Response) => {
  const categories = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*)
               FROM products p
               JOIN seller_profiles sp ON sp.user_id = p.seller_id
               JOIN users u ON u.id = p.seller_id
               WHERE p.category_id = c.id
                 AND p.published = 1
                 AND p.moderated_reason IS NULL
                 AND sp.application_status = 'Approved'
                 AND u.account_status = 'Active') AS productCount
       FROM categories c
       WHERE c.active = 1
       ORDER BY c.id ASC`
    )
    .all();

  const featuredProducts = (
    db.prepare(`${PRODUCT_BASE_SELECT} ORDER BY p.created_at DESC LIMIT 12`).all() as Record<string, any>[]
  ).map(formatProductRow);

  const approvedSellers = db
    .prepare(
      `SELECT sp.id, sp.user_id AS userId, sp.business_name AS businessName,
              sp.description, sp.storefront_image AS storefrontImage,
              sp.verified_badge AS verifiedBadge, sp.location_city AS locationCity,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = sp.user_id AND p.published = 1 AND p.moderated_reason IS NULL) AS productCount
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.application_status = 'Approved' AND u.account_status = 'Active'
       ORDER BY sp.verified_badge DESC, sp.created_at DESC
       LIMIT 8`
    )
    .all()
    .map((s: any) => ({ ...s, verifiedBadge: Boolean(s.verifiedBadge) }));

  const promotions = db
    .prepare(
      `SELECT pr.*, sp.business_name AS sellerBusinessName, p.title AS productTitle
       FROM seller_promotions pr
       JOIN seller_profiles sp ON sp.user_id = pr.seller_id
       LEFT JOIN products p ON p.id = pr.product_id
       WHERE pr.status = 'Published'
         AND sp.application_status = 'Approved'
         AND (pr.expires_at IS NULL OR pr.expires_at > datetime('now'))
       ORDER BY pr.created_at DESC
       LIMIT 6`
    )
    .all();

  return res.json({
    categories,
    featuredProducts,
    approvedSellers,
    promotions,
  });
});

marketplaceRouter.get('/categories', (_req: Request, res: Response) => {
  const categories = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*)
               FROM products p
               JOIN seller_profiles sp ON sp.user_id = p.seller_id
               WHERE p.category_id = c.id
                 AND p.published = 1
                 AND p.moderated_reason IS NULL
                 AND sp.application_status = 'Approved') AS productCount
       FROM categories c
       WHERE c.active = 1
       ORDER BY c.id ASC`
    )
    .all();
  return res.json({ categories });
});

marketplaceRouter.get('/products', (req: Request, res: Response) => {
  const q = sanitizeText(req.query.q, 120);
  const category = sanitizeText(req.query.category, 80);
  const sellerId = req.query.sellerId ? Number(req.query.sellerId) : null;
  const sort = sanitizeText(req.query.sort, 30);

  const params: any[] = [];
  let sql = `${PRODUCT_BASE_SELECT}`;

  if (category) {
    sql += ` AND c.slug = ?`;
    params.push(category);
  }
  if (sellerId && Number.isFinite(sellerId)) {
    sql += ` AND p.seller_id = ?`;
    params.push(sellerId);
  }
  if (q) {
    sql += ` AND (p.title LIKE ? OR p.description LIKE ? OR sp.business_name LIKE ? OR c.name LIKE ?)`;
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (sort === 'price_asc') {
    sql += ` ORDER BY p.price ASC`;
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY p.price DESC`;
  } else {
    sql += ` ORDER BY p.created_at DESC`;
  }

  const rows = db.prepare(sql).all(...params) as Record<string, any>[];
  return res.json({ products: rows.map(formatProductRow) });
});

marketplaceRouter.get('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const row = db.prepare(`${PRODUCT_BASE_SELECT} AND p.id = ?`).get(id) as Record<string, any> | undefined;
  if (!row) {
    return res.status(404).json({ error: 'Product not found or currently unavailable.' });
  }

  const reviews = db
    .prepare(
      `SELECT r.id, r.product_id AS productId, r.order_id AS orderId, r.buyer_id AS buyerId,
              u.full_name AS buyerName, r.rating, r.comment, r.seller_response AS sellerResponse, r.created_at AS createdAt
       FROM reviews r
       JOIN users u ON u.id = r.buyer_id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(id);

  let eligibleOrderId: number | null = null;
  if (req.authUser && req.authUser.role === 'buyer') {
    const eligible = db
      .prepare(
        `SELECT o.id
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN reviews r ON r.order_id = o.id AND r.product_id = oi.product_id AND r.buyer_id = o.buyer_id
         WHERE o.buyer_id = ?
           AND oi.product_id = ?
           AND o.order_status = 'Completed'
           AND r.id IS NULL
         ORDER BY o.created_at DESC
         LIMIT 1`
      )
      .get(req.authUser.id, id) as { id: number } | undefined;
    eligibleOrderId = eligible?.id ?? null;
  }

  return res.json({
    product: formatProductRow(row),
    reviews,
    eligibleOrderId,
  });
});

marketplaceRouter.get('/sellers/:sellerUserId', (req: Request, res: Response) => {
  const sellerUserId = Number(req.params.sellerUserId);
  if (!Number.isFinite(sellerUserId)) {
    return res.status(400).json({ error: 'Invalid seller ID.' });
  }

  const sp = db
    .prepare(
      `SELECT sp.id, sp.user_id, sp.business_name, sp.email, sp.phone, sp.description,
              sp.categories_json, sp.location_city, sp.delivery_pickup_notes,
              sp.storefront_image, sp.business_photos_json, sp.verified_badge,
              sp.momo_enabled, sp.bank_enabled, sp.created_at
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = ? AND sp.application_status = 'Approved' AND u.account_status = 'Active'`
    )
    .get(sellerUserId) as Record<string, any> | undefined;

  if (!sp) {
    return res.status(404).json({ error: 'Seller storefront not found or not currently active.' });
  }

  const products = (
    db.prepare(`${PRODUCT_BASE_SELECT} AND p.seller_id = ? ORDER BY p.created_at DESC`).all(sellerUserId) as Record<
      string,
      any
    >[]
  ).map(formatProductRow);

  return res.json({
    seller: {
      id: sp.id,
      userId: sp.user_id,
      businessName: sp.business_name,
      email: sp.email,
      phone: sp.phone,
      description: sp.description,
      categories: JSON.parse(sp.categories_json || '[]'),
      locationCity: sp.location_city,
      deliveryPickupNotes: sp.delivery_pickup_notes,
      storefrontImage: sp.storefront_image,
      businessPhotos: JSON.parse(sp.business_photos_json || '[]'),
      verifiedBadge: Boolean(sp.verified_badge),
      momoEnabled: Boolean(sp.momo_enabled),
      bankEnabled: Boolean(sp.bank_enabled),
      createdAt: sp.created_at,
    },
    products,
  });
});

marketplaceRouter.post('/promo/validate', (req: Request, res: Response) => {
  const code = sanitizeText(req.body?.code, 40).toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Please enter a promotional code.' });
  }

  const promo = db.prepare(`SELECT * FROM promo_codes WHERE UPPER(code) = ?`).get(code) as
    | {
        id: number;
        code: string;
        discount_percent: number;
        starts_at: string;
        expires_at: string;
        manually_ended: number;
      }
    | undefined;

  if (!promo) {
    return res.status(404).json({ error: 'Promotional code not found.' });
  }

  const now = Date.now();
  const startsAt = new Date(promo.starts_at).getTime();
  const expiresAt = new Date(promo.expires_at).getTime();

  if (promo.manually_ended) {
    return res.status(400).json({ error: 'This promotional code has been ended.' });
  }
  if (now < startsAt) {
    return res.status(400).json({ error: 'This promotional code is not active yet.' });
  }
  if (now >= expiresAt) {
    return res.status(400).json({ error: 'This promotional code has expired.' });
  }

  return res.json({
    valid: true,
    code: promo.code,
    discountPercent: Number(promo.discount_percent),
    expiresAt: promo.expires_at,
  });
});

marketplaceRouter.get('/track/:reference', (req: Request, res: Response) => {
  const ref = sanitizeText(req.params.reference, 40).toUpperCase();
  if (!ref) {
    return res.status(400).json({ error: 'Please enter a valid order tracking code.' });
  }

  const order = db
    .prepare(
      `SELECT o.id, o.order_reference, o.fulfillment_method, o.order_status,
              o.tracking_stage, o.tracking_location, o.tracking_note,
              o.estimated_delivery, o.courier_contact,
              o.created_at, o.updated_at,
              sp.user_id AS seller_user_id, sp.business_name AS seller_business_name,
              sp.verified_badge AS seller_verified_badge, sp.location_city AS seller_location_city,
              sp.phone AS seller_phone,
              p.status AS payment_status
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE UPPER(o.order_reference) = ?`
    )
    .get(ref) as Record<string, any> | undefined;

  if (!order) {
    return res.status(404).json({
      error: `No order found matching code "${ref}". Check your order reference and try again.`,
    });
  }

  const items = db
    .prepare(
      `SELECT product_title AS productTitle, selected_variation AS selectedVariation,
              quantity, product_image AS productImage
       FROM order_items WHERE order_id = ?`
    )
    .all(order.id);

  const trackingEvents = db
    .prepare(
      `SELECT ote.id, ote.stage, ote.location, ote.note, u.role AS actorRole, ote.created_at AS createdAt
       FROM order_tracking_events ote
       JOIN users u ON u.id = ote.actor_user_id
       WHERE ote.order_id = ?
       ORDER BY ote.created_at DESC, ote.id DESC`
    )
    .all(order.id);

  return res.json({
    tracking: {
      orderReference: order.order_reference,
      fulfillmentMethod: order.fulfillment_method,
      orderStatus: order.order_status,
      paymentStatus: order.payment_status || 'Not Reported',
      trackingStage: order.tracking_stage || 'Order Placed',
      trackingLocation: order.tracking_location || '',
      trackingNote: order.tracking_note || '',
      estimatedDelivery: order.estimated_delivery || '',
      courierContact: order.courier_contact || '',
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      seller: {
        userId: order.seller_user_id,
        businessName: order.seller_business_name,
        verifiedBadge: Boolean(order.seller_verified_badge),
        locationCity: order.seller_location_city || '',
        phone: order.seller_phone || '',
      },
      items,
      trackingEvents,
    },
  });
});
