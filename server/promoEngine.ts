import { db } from './db.ts';
import { sanitizeText } from './security.ts';

export type PromoEffectiveStatus = 'Scheduled' | 'Active' | 'Expired' | 'Deactivated';

export function computePromotionStatus(row: {
  starts_at: string;
  expires_at: string;
  manually_ended: number;
}): PromoEffectiveStatus {
  if (row.manually_ended) return 'Deactivated';
  const now = Date.now();
  const starts = new Date(row.starts_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  if (Number.isFinite(starts) && now < starts) return 'Scheduled';
  if (Number.isFinite(expires) && now >= expires) return 'Expired';
  return 'Active';
}

export interface CartItemInput {
  productId: number;
  quantity: number;
  selectedVariation?: string;
}

export interface EvaluatedCartItem {
  productId: number;
  sellerId: number;
  sellerEmail: string;
  sellerBusinessName: string;
  title: string;
  image: string | null;
  selectedVariation: string;
  quantity: number;
  unitPrice: number;
  originalLineTotal: number;
  promoCodeId: number | null;
  appliedPromoCode: string | null;
  appliedPromoTitle: string | null;
  discountPercent: number;
  discountAmount: number;
  finalLineTotal: number;
}

export interface AppliedPromoSummary {
  promoCodeId: number;
  code: string;
  title: string;
  campaignType: string;
  discountPercent: number;
  firstTimeOnly: boolean;
  appliesTo: 'all' | 'selected';
  sellerId: number;
  sellerBusinessName: string;
  affectedProductIds: number[];
  totalDiscount: number;
}

export interface CartPromoEvaluation {
  items: EvaluatedCartItem[];
  appliedPromos: AppliedPromoSummary[];
  subtotalAmount: number;
  totalDiscountAmount: number;
  finalTotalAmount: number;
}

export function normalizePromoCodesInput(rawCodes: unknown, singleCode?: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(rawCodes)) {
    for (const c of rawCodes) {
      const cleaned = sanitizeText(c, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (cleaned && !list.includes(cleaned)) {
        list.push(cleaned);
      }
    }
  }
  if (singleCode !== undefined) {
    const cleaned = sanitizeText(singleCode, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleaned && !list.includes(cleaned)) {
      list.push(cleaned);
    }
  }
  return list.slice(0, 10);
}

export function evaluateCartPromotions(params: {
  items: CartItemInput[];
  promoCodes: string[];
  buyerId: number | null;
  requireStock?: boolean;
}): CartPromoEvaluation {
  const { items: rawItems, promoCodes, buyerId, requireStock = false } = params;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Your shopping cart is empty.');
  }

  const evaluatedItems: EvaluatedCartItem[] = [];
  for (const entry of rawItems) {
    const productId = Number(entry?.productId);
    const quantity = Math.floor(Number(entry?.quantity));
    const selectedVariation = sanitizeText(entry?.selectedVariation, 160);

    if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Invalid product quantity in cart.');
    }

    const product = db
      .prepare(
        `SELECT p.*, sp.application_status, sp.business_name, u.email AS seller_email, u.account_status AS seller_account_status
         FROM products p
         JOIN seller_profiles sp ON sp.user_id = p.seller_id
         JOIN users u ON u.id = p.seller_id
         WHERE p.id = ?`
      )
      .get(productId) as Record<string, any> | undefined;

    if (!product || !product.published || product.moderated_reason) {
      throw new Error('A selected product is no longer available.');
    }
    if (product.application_status !== 'Approved' || product.seller_account_status !== 'Active') {
      throw new Error(`Seller for "${product.title}" is not currently active.`);
    }
    if (requireStock && Number(product.stock) < quantity) {
      throw new Error(`Insufficient stock for "${product.title}". Available: ${product.stock}.`);
    }

    const unitPrice = Number(product.price);
    const originalLineTotal = Number((unitPrice * quantity).toFixed(2));
    const images = JSON.parse(product.images_json || '[]') as string[];

    evaluatedItems.push({
      productId: Number(product.id),
      sellerId: Number(product.seller_id),
      sellerEmail: String(product.seller_email),
      sellerBusinessName: String(product.business_name),
      title: String(product.title),
      image: images[0] || null,
      selectedVariation,
      quantity,
      unitPrice,
      originalLineTotal,
      promoCodeId: null,
      appliedPromoCode: null,
      appliedPromoTitle: null,
      discountPercent: 0,
      discountAmount: 0,
      finalLineTotal: originalLineTotal,
    });
  }

  const now = Date.now();
  const validatedPromos: Array<{
    id: number;
    code: string;
    title: string;
    campaignType: string;
    discountPercent: number;
    sellerId: number;
    sellerBusinessName: string;
    appliesTo: 'all' | 'selected';
    firstTimeOnly: boolean;
    allowedProductIds: Set<number>;
    matchingItems: EvaluatedCartItem[];
  }> = [];

  for (const code of promoCodes) {
    const promo = db
      .prepare(
        `SELECT pc.*, sp.business_name AS seller_business_name
         FROM promo_codes pc
         LEFT JOIN seller_profiles sp ON sp.user_id = COALESCE(pc.seller_id, pc.created_by_user_id)
         WHERE UPPER(pc.code) = ?`
      )
      .get(code) as Record<string, any> | undefined;

    if (!promo) {
      throw new Error(`Promotional code "${code}" does not exist.`);
    }

    const effectiveStatus = computePromotionStatus({
      starts_at: promo.starts_at,
      expires_at: promo.expires_at,
      manually_ended: promo.manually_ended,
    });

    if (effectiveStatus === 'Deactivated') {
      throw new Error(`Promotional code "${promo.code}" has been deactivated by the seller.`);
    }
    if (effectiveStatus === 'Scheduled') {
      const startLabel = new Date(promo.starts_at).toLocaleString();
      throw new Error(`Promotional code "${promo.code}" is scheduled to start on ${startLabel} and is not active yet.`);
    }
    if (effectiveStatus === 'Expired') {
      throw new Error(`Promotional code "${promo.code}" has expired.`);
    }

    const promoSellerId = Number(promo.seller_id || promo.created_by_user_id);
    if (!Number.isFinite(promoSellerId) || promoSellerId <= 0) {
      throw new Error(`Promotional code "${promo.code}" is not configured for a valid seller.`);
    }

    const appliesTo = promo.applies_to === 'selected' ? 'selected' : 'all';
    const allowedProductIds = new Set<number>();
    if (appliesTo === 'selected') {
      const targetRows = db
        .prepare(`SELECT product_id FROM promo_code_products WHERE promo_code_id = ?`)
        .all(promo.id) as Array<{ product_id: number }>;
      for (const tr of targetRows) {
        allowedProductIds.add(Number(tr.product_id));
      }
    }

    const matchingItems = evaluatedItems.filter((item) => {
      if (item.sellerId !== promoSellerId) return false;
      if (appliesTo === 'selected' && !allowedProductIds.has(item.productId)) return false;
      return true;
    });

    if (matchingItems.length === 0) {
      throw new Error(
        `Promotional code "${promo.code}" does not apply to the product(s) currently in your cart.`
      );
    }

    const firstTimeOnly = Boolean(promo.first_time_only);
    if (firstTimeOnly) {
      if (!buyerId) {
        throw new Error(
          `Promotional code "${promo.code}" is for first-time customers only. Please sign in to verify eligibility.`
        );
      }
      const priorRedemption = db
        .prepare(
          `SELECT pr.id
           FROM promo_redemptions pr
           JOIN orders o ON o.id = pr.order_id
           WHERE pr.promo_code_id = ? AND pr.buyer_id = ? AND o.order_status != 'Cancelled'
           LIMIT 1`
        )
        .get(promo.id, buyerId);
      if (priorRedemption) {
        throw new Error(
          `Promotional code "${promo.code}" is for first-time customers only and has already been used on your account.`
        );
      }

      const priorSellerOrder = db
        .prepare(
          `SELECT id FROM orders
           WHERE buyer_id = ? AND seller_id = ? AND order_status != 'Cancelled'
           LIMIT 1`
        )
        .get(buyerId, promoSellerId);
      if (priorSellerOrder) {
        throw new Error(
          `Promotional code "${promo.code}" is valid only for first-time customers of ${promo.seller_business_name || 'this seller'}.`
        );
      }
    }

    validatedPromos.push({
      id: Number(promo.id),
      code: String(promo.code),
      title: String(promo.title || promo.code),
      campaignType: String(promo.campaign_type || 'General Promotion'),
      discountPercent: Number(promo.discount_percent),
      sellerId: promoSellerId,
      sellerBusinessName: String(promo.seller_business_name || 'Seller Store'),
      appliesTo,
      firstTimeOnly,
      allowedProductIds,
      matchingItems,
    });
  }

  // Assign at most ONE promotion per line item (no stacking / duplicate discount on the same product)
  for (const item of evaluatedItems) {
    let bestPromo: (typeof validatedPromos)[number] | null = null;
    for (const vp of validatedPromos) {
      if (item.sellerId !== vp.sellerId) continue;
      if (vp.appliesTo === 'selected' && !vp.allowedProductIds.has(item.productId)) continue;
      if (!bestPromo || vp.discountPercent > bestPromo.discountPercent) {
        bestPromo = vp;
      }
    }
    if (bestPromo) {
      const discountAmount = Number(((item.originalLineTotal * bestPromo.discountPercent) / 100).toFixed(2));
      item.promoCodeId = bestPromo.id;
      item.appliedPromoCode = bestPromo.code;
      item.appliedPromoTitle = bestPromo.title;
      item.discountPercent = bestPromo.discountPercent;
      item.discountAmount = discountAmount;
      item.finalLineTotal = Number(Math.max(0, item.originalLineTotal - discountAmount).toFixed(2));
    }
  }

  // Verify every entered promo code actually applied to at least one item
  const appliedMap = new Map<number, AppliedPromoSummary>();
  for (const vp of validatedPromos) {
    const affected = evaluatedItems.filter((it) => it.promoCodeId === vp.id);
    if (affected.length === 0) {
      throw new Error(
        `Promotional code "${vp.code}" could not be applied because its eligible product(s) already have an equal or higher discount applied.`
      );
    }
    appliedMap.set(vp.id, {
      promoCodeId: vp.id,
      code: vp.code,
      title: vp.title,
      campaignType: vp.campaignType,
      discountPercent: vp.discountPercent,
      firstTimeOnly: vp.firstTimeOnly,
      appliesTo: vp.appliesTo,
      sellerId: vp.sellerId,
      sellerBusinessName: vp.sellerBusinessName,
      affectedProductIds: Array.from(new Set(affected.map((a) => a.productId))),
      totalDiscount: Number(affected.reduce((sum, a) => sum + a.discountAmount, 0).toFixed(2)),
    });
  }

  const subtotalAmount = Number(evaluatedItems.reduce((sum, i) => sum + i.originalLineTotal, 0).toFixed(2));
  const totalDiscountAmount = Number(evaluatedItems.reduce((sum, i) => sum + i.discountAmount, 0).toFixed(2));
  const finalTotalAmount = Number(Math.max(0, subtotalAmount - totalDiscountAmount).toFixed(2));

  return {
    items: evaluatedItems,
    appliedPromos: Array.from(appliedMap.values()),
    subtotalAmount,
    totalDiscountAmount,
    finalTotalAmount,
  };
}
