import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { sanitizeText } from '../security.ts';
import { evaluateCartPromotions, normalizePromoCodesInput } from '../promoEngine.ts';

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
    sizes: JSON.parse(row.sizes_json || '[]'),
    colors: JSON.parse(row.colors_json || '[]'),
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
              sp.description, sp.categories_json AS categoriesJson,
              sp.storefront_image AS storefrontImage,
              sp.verified_badge AS verifiedBadge, sp.location_city AS locationCity,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = sp.user_id AND p.published = 1 AND p.moderated_reason IS NULL) AS productCount
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.application_status = 'Approved' AND u.account_status = 'Active'
       ORDER BY sp.verified_badge DESC, sp.updated_at DESC, sp.created_at DESC
       LIMIT 12`
    )
    .all()
    .map((s: any) => ({
      id: s.id,
      userId: s.userId,
      businessName: s.businessName,
      description: s.description,
      categories: JSON.parse(s.categoriesJson || '[]'),
      storefrontImage: s.storefrontImage,
      verifiedBadge: Boolean(s.verifiedBadge),
      locationCity: s.locationCity,
      productCount: Number(s.productCount || 0),
    }));

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

const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const KEYWORD_CATEGORY_HINTS: Array<{ keywords: string[]; slugs: string[] }> = [
  {
    keywords: [
      'iphone',
      'ipad',
      'samsung',
      'galaxy',
      'pixel',
      'tecno',
      'infinix',
      'redmi',
      'xiaomi',
      'huawei',
      'nokia',
      'oppo',
      'vivo',
      'oneplus',
      'smartphone',
      'phone',
      'tablet',
      'charger',
      'powerbank',
      'earbud',
      'airpod',
      'headphone',
      'speaker',
      'bluetooth',
      'tv',
      'camera',
      'console',
      'playstation',
      'xbox',
    ],
    slugs: ['phones-tablets', 'electronics'],
  },
  {
    keywords: ['laptop', 'macbook', 'notebook', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'monitor', 'keyboard', 'mouse', 'desktop', 'computer', 'pc', 'ssd'],
    slugs: ['computers-laptops', 'electronics'],
  },
  {
    keywords: ['watch', 'smartwatch', 'rolex', 'casio', 'seiko', 'omega', 'chronograph', 'timepiece', 'wrist'],
    slugs: ['watches'],
  },
  {
    keywords: ['sneaker', 'trainer', 'jordan', 'nike', 'adidas', 'yeezy', 'puma', 'converse', 'vans', 'runner', 'kicks'],
    slugs: ['sneakers', 'shoes'],
  },
  {
    keywords: ['shoe', 'loafer', 'sandal', 'boot', 'heel', 'slipper', 'slide', 'footwear', 'oxford'],
    slugs: ['shoes', 'sneakers'],
  },
  {
    keywords: ['shirt', 'tshirt', 'tee', 'polo', 'hoodie', 'sweater', 'jacket', 'coat', 'blazer', 'suit', 'dress', 'skirt', 'jean', 'trouser', 'pant', 'short', 'top', 'cloth', 'apparel', 'outfit', 'wear'],
    slugs: ['clothing'],
  },
  {
    keywords: ['bag', 'backpack', 'handbag', 'tote', 'purse', 'clutch', 'suitcase', 'luggage', 'wallet', 'belt', 'eyewear', 'sunglass', 'glasses', 'cap', 'hat'],
    slugs: ['bags-luggage', 'accessories'],
  },
  {
    keywords: ['ring', 'necklace', 'bracelet', 'earring', 'chain', 'pendant', 'anklet', 'gold', 'silver', 'jewelry', 'jewellery'],
    slugs: ['jewelry', 'accessories'],
  },
  {
    keywords: ['perfume', 'cologne', 'fragrance', 'skincare', 'cream', 'lotion', 'serum', 'makeup', 'lipstick', 'foundation', 'cosmetic', 'wig', 'hair'],
    slugs: ['beauty-cosmetics', 'health-wellness'],
  },
  {
    keywords: ['blender', 'kettle', 'microwave', 'cooker', 'pot', 'pan', 'kitchen', 'bedding', 'sheet', 'pillow', 'lamp', 'decor', 'sofa', 'chair', 'table', 'desk', 'furniture'],
    slugs: ['home-kitchen', 'furniture'],
  },
  {
    keywords: ['gym', 'dumbbell', 'yoga', 'bicycle', 'bike', 'fitness', 'sport', 'jersey', 'football', 'vitamin', 'supplement', 'wellness'],
    slugs: ['sports-outdoors', 'health-wellness'],
  },
];

function extractSearchTerms(rawQuery: string): string[] {
  const parts = rawQuery
    .toLowerCase()
    .split(/[\s,+/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.includes(part)) {
      unique.push(part);
    }
    if (unique.length >= 6) break;
  }
  return unique;
}

function buildStemmedTermVariants(term: string): string[] {
  const variants = [term];
  if (term.length > 4 && term.endsWith('ies')) {
    variants.push(`${term.slice(0, -3)}y`);
  } else if (term.length > 4 && term.endsWith('es')) {
    variants.push(term.slice(0, -2));
  } else if (term.length > 3 && term.endsWith('s')) {
    variants.push(term.slice(0, -1));
  }
  return variants;
}

function findRelevantAlternatives(
  rawQuery: string,
  categoryFilter: string,
  sellerId: number | null,
  maxSuggestions: number
): { suggestions: ReturnType<typeof formatProductRow>[]; suggestionBasis: 'related_terms' | 'related_category' | null } {
  const rawTerms = extractSearchTerms(rawQuery);
  const meaningfulTerms = rawTerms.filter((t) => t.length >= 2 && !SEARCH_STOP_WORDS.has(t));
  const candidateRows: Array<{ row: Record<string, any>; score: number }> = [];
  const usedIds = new Set<number>();

  // Tier 1: Genuine published inventory matching at least one meaningful search term (or stemmed variant)
  if (meaningfulTerms.length > 0) {
    const tokenVariants = Array.from(new Set(meaningfulTerms.flatMap(buildStemmedTermVariants)));
    const likeClauses: string[] = [];
    const likeParams: any[] = [];
    for (const token of tokenVariants) {
      const pattern = `%${token}%`;
      likeClauses.push(
        `(LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(p.variations_json) LIKE ? OR LOWER(p.colors_json) LIKE ? OR LOWER(p.sizes_json) LIKE ?)`
      );
      likeParams.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    let tier1Sql = `${PRODUCT_BASE_SELECT} AND p.stock > 0`;
    const tier1Params: any[] = [];
    if (sellerId && Number.isFinite(sellerId)) {
      tier1Sql += ` AND p.seller_id = ?`;
      tier1Params.push(sellerId);
    }
    tier1Sql += ` AND (${likeClauses.join(' OR ')}) ORDER BY p.created_at DESC LIMIT 40`;
    const matchedRows = db.prepare(tier1Sql).all(...tier1Params, ...likeParams) as Record<string, any>[];

    for (const row of matchedRows) {
      const titleLower = String(row.title || '').toLowerCase();
      const descLower = String(row.description || '').toLowerCase();
      const catLower = String(row.category_name || '').toLowerCase();
      const extraLower = `${row.variations_json || ''} ${row.colors_json || ''} ${row.sizes_json || ''}`.toLowerCase();

      let score = 0;
      for (const token of tokenVariants) {
        if (titleLower.includes(token)) score += 10;
        if (catLower.includes(token)) score += 5;
        if (descLower.includes(token) || extraLower.includes(token)) score += 3;
      }
      if (categoryFilter && row.category_slug === categoryFilter) {
        score += 4;
      }
      if (score > 0) {
        candidateRows.push({ row, score });
      }
    }

    candidateRows.sort((a, b) => b.score - a.score || Number(b.row.id) - Number(a.row.id));
  }

  const suggestions: ReturnType<typeof formatProductRow>[] = [];
  for (const item of candidateRows.slice(0, maxSuggestions)) {
    usedIds.add(Number(item.row.id));
    suggestions.push(formatProductRow(item.row));
  }

  const hasTier1 = suggestions.length > 0;

  // Tier 2: Fill remaining slots from genuinely relevant categories only (no unrelated filler)
  if (suggestions.length < maxSuggestions) {
    const matchedSlugs = new Set<string>();
    if (categoryFilter) {
      matchedSlugs.add(categoryFilter);
    }

    const qLower = rawQuery.toLowerCase();
    for (const hint of KEYWORD_CATEGORY_HINTS) {
      if (
        hint.keywords.some(
          (kw) => qLower.includes(kw) || meaningfulTerms.some((t) => kw.includes(t) && t.length >= 3)
        )
      ) {
        for (const slug of hint.slugs) {
          matchedSlugs.add(slug);
        }
      }
    }

    if (meaningfulTerms.length > 0) {
      const activeCats = db
        .prepare(`SELECT slug, name, description FROM categories WHERE active = 1`)
        .all() as Array<{ slug: string; name: string; description: string }>;
      for (const cat of activeCats) {
        const hay = `${cat.name} ${cat.description}`.toLowerCase();
        if (meaningfulTerms.some((t) => hay.includes(t))) {
          matchedSlugs.add(cat.slug);
        }
      }
    }

    if (matchedSlugs.size > 0) {
      const slugList = Array.from(matchedSlugs);
      const placeholders = slugList.map(() => '?').join(',');
      let tier2Sql = `${PRODUCT_BASE_SELECT} AND p.stock > 0 AND c.slug IN (${placeholders})`;
      const tier2Params: any[] = [...slugList];
      if (sellerId && Number.isFinite(sellerId)) {
        tier2Sql += ` AND p.seller_id = ?`;
        tier2Params.push(sellerId);
      }
      tier2Sql += ` ORDER BY p.created_at DESC LIMIT 24`;

      const catRows = db.prepare(tier2Sql).all(...tier2Params) as Record<string, any>[];
      for (const row of catRows) {
        if (suggestions.length >= maxSuggestions) break;
        const id = Number(row.id);
        if (!usedIds.has(id)) {
          usedIds.add(id);
          suggestions.push(formatProductRow(row));
        }
      }
    }
  }

  return {
    suggestions,
    suggestionBasis: suggestions.length === 0 ? null : hasTier1 ? 'related_terms' : 'related_category',
  };
}

marketplaceRouter.get('/products', (req: Request, res: Response) => {
  const q = sanitizeText(req.query.q, 120);
  const category = sanitizeText(req.query.category, 80);
  const sellerId = req.query.sellerId ? Number(req.query.sellerId) : null;
  const sort = sanitizeText(req.query.sort, 30);
  const rawLimit = req.query.limit ? Number(req.query.limit) : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 60) : 0;

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

  const searchTerms = q ? extractSearchTerms(q).slice(0, 5) : [];
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      sql += ` AND (LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(sp.business_name) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(p.sizes_json) LIKE ? OR LOWER(p.colors_json) LIKE ? OR LOWER(p.variations_json) LIKE ? OR LOWER(sp.location_city) LIKE ?)`;
      const pattern = `%${term}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
  }

  if (sort === 'price_asc') {
    sql += ` ORDER BY p.price ASC`;
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY p.price DESC`;
  } else if (q && searchTerms.length > 0) {
    const titleAllTermsSql = searchTerms.map(() => `LOWER(p.title) LIKE ?`).join(' AND ');
    sql += ` ORDER BY CASE WHEN LOWER(p.title) LIKE ? THEN 0 WHEN (${titleAllTermsSql}) THEN 1 ELSE 2 END, CASE WHEN p.stock > 0 THEN 0 ELSE 1 END, p.created_at DESC`;
    params.push(`%${q.toLowerCase()}%`, ...searchTerms.map((t) => `%${t}%`));
  } else {
    sql += ` ORDER BY p.created_at DESC`;
  }

  if (limit > 0) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  const rows = db.prepare(sql).all(...params) as Record<string, any>[];
  const products = rows.map(formatProductRow);

  if (q && products.length === 0) {
    const altLimit = limit > 0 ? Math.min(limit, 8) : 8;
    const { suggestions, suggestionBasis } = findRelevantAlternatives(q, category, sellerId, altLimit);
    return res.json({ products, suggestions, suggestionBasis });
  }

  return res.json({ products, suggestions: [], suggestionBasis: null });
});

marketplaceRouter.post('/cart-check', (req: Request, res: Response) => {
  const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
  const uniqueIds: number[] = Array.from(
    new Set<number>(rawIds.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0))
  ).slice(0, 100);

  if (uniqueIds.length === 0) {
    return res.json({ items: [] });
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.price, p.stock, p.published, p.moderated_reason, p.images_json,
              c.active AS category_active,
              sp.application_status AS seller_status,
              u.account_status AS seller_account_status
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN seller_profiles sp ON sp.user_id = p.seller_id
       JOIN users u ON u.id = p.seller_id
       WHERE p.id IN (${placeholders})`
    )
    .all(...uniqueIds) as Record<string, any>[];

  const rowMap = new Map<number, Record<string, any>>();
  for (const r of rows) {
    rowMap.set(Number(r.id), r);
  }

  const items = uniqueIds.map((id) => {
    const r = rowMap.get(id);
    if (!r) {
      return {
        id,
        exists: false,
        available: false,
        published: false,
        stock: 0,
        price: 0,
        title: '',
        image: '',
        reason: 'This item has been removed and is no longer available.',
      };
    }

    const sellerActive =
      r.seller_status === 'Approved' &&
      r.seller_account_status === 'Active' &&
      Boolean(r.category_active);
    const isPublished = Boolean(r.published) && !r.moderated_reason;
    const stock = Math.max(0, Number(r.stock || 0));
    const available = sellerActive && isPublished && stock > 0;
    const images = JSON.parse(r.images_json || '[]') as string[];

    let reason = '';
    if (!sellerActive || !isPublished) {
      reason = 'This item is no longer available for purchase.';
    } else if (stock <= 0) {
      reason = 'Sold out — this item is no longer available.';
    }

    return {
      id,
      exists: true,
      available,
      published: isPublished,
      stock,
      price: Number(r.price),
      title: r.title,
      image: images[0] || '',
      reason,
    };
  });

  return res.json({ items });
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

marketplaceRouter.get('/sellers', (req: Request, res: Response) => {
  const q = sanitizeText(req.query.q, 120);
  const categoryFilter = sanitizeText(req.query.category, 80);

  let sql = `
    SELECT sp.id, sp.user_id AS userId, sp.business_name AS businessName,
           sp.description, sp.categories_json AS categoriesJson,
           sp.location_city AS locationCity, sp.storefront_image AS storefrontImage,
           sp.business_photos_json AS businessPhotosJson,
           sp.verified_badge AS verifiedBadge, sp.phone,
           sp.momo_enabled AS momoEnabled, sp.bank_enabled AS bankEnabled,
           (SELECT COUNT(*)
            FROM products p
            WHERE p.seller_id = sp.user_id
              AND p.published = 1
              AND p.moderated_reason IS NULL) AS productCount
    FROM seller_profiles sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.application_status = 'Approved' AND u.account_status = 'Active'
  `;
  const params: any[] = [];
  if (q) {
    sql += ` AND (sp.business_name LIKE ? OR sp.description LIKE ? OR sp.location_city LIKE ? OR sp.categories_json LIKE ?)`;
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  if (categoryFilter) {
    sql += ` AND LOWER(sp.categories_json) LIKE ?`;
    params.push(`%${categoryFilter.toLowerCase()}%`);
  }
  sql += ` ORDER BY sp.verified_badge DESC, productCount DESC, sp.updated_at DESC`;

  const previewStmt = db.prepare(
    `SELECT id, title, price, images_json AS imagesJson
     FROM products
     WHERE seller_id = ? AND published = 1 AND moderated_reason IS NULL
     ORDER BY created_at DESC
     LIMIT 3`
  );

  const sellers = (db.prepare(sql).all(...params) as Record<string, any>[]).map((s) => {
    const previewProducts = (previewStmt.all(s.userId) as Record<string, any>[]).map((p) => {
      const imgs = JSON.parse(p.imagesJson || '[]') as string[];
      return {
        id: p.id,
        title: p.title,
        price: Number(p.price),
        image: imgs[0] || '',
      };
    });
    return {
      id: s.id,
      userId: s.userId,
      businessName: s.businessName,
      description: s.description,
      categories: JSON.parse(s.categoriesJson || '[]'),
      locationCity: s.locationCity,
      storefrontImage: s.storefrontImage,
      businessPhotos: JSON.parse(s.businessPhotosJson || '[]'),
      verifiedBadge: Boolean(s.verifiedBadge),
      phone: s.phone,
      momoEnabled: Boolean(s.momoEnabled),
      bankEnabled: Boolean(s.bankEnabled),
      productCount: Number(s.productCount || 0),
      previewProducts,
    };
  });

  return res.json({ sellers });
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
  const codes = normalizePromoCodesInput(req.body?.codes, req.body?.code);
  if (codes.length === 0) {
    return res.status(400).json({ error: 'Please enter a promotional code.' });
  }

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) {
    return res.status(400).json({
      error: 'Add products to your cart before applying a promotional code.',
    });
  }

  try {
    const evaluation = evaluateCartPromotions({
      items: rawItems,
      promoCodes: codes,
      buyerId: req.authUser?.id ?? null,
      requireStock: false,
    });

    const primary = evaluation.appliedPromos[evaluation.appliedPromos.length - 1];
    return res.json({
      valid: true,
      code: primary?.code || codes[0],
      discountPercent: primary?.discountPercent || 0,
      appliedPromos: evaluation.appliedPromos,
      items: evaluation.items.map((it) => ({
        productId: it.productId,
        title: it.title,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        originalLineTotal: it.originalLineTotal,
        appliedPromoCode: it.appliedPromoCode,
        appliedPromoTitle: it.appliedPromoTitle,
        discountPercent: it.discountPercent,
        discountAmount: it.discountAmount,
        finalLineTotal: it.finalLineTotal,
      })),
      subtotalAmount: evaluation.subtotalAmount,
      discountAmount: evaluation.totalDiscountAmount,
      finalTotalAmount: evaluation.finalTotalAmount,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || 'This promotional code is invalid or does not apply to your cart.',
    });
  }
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
