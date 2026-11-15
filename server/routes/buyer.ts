import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, createNotification } from '../db.ts';
import { escapeHtml, generateOrderReference, sanitizeText } from '../security.ts';
import { sendTransactionalEmail } from '../email.ts';
import { getAppBaseUrl, requireAuth, requireRole } from '../middleware.ts';

export const buyerRouter = Router();

function formatOrderDetail(orderRow: Record<string, any>) {
  const items = db
    .prepare(
      `SELECT id, order_id AS orderId, product_id AS productId, product_title AS productTitle,
              product_image AS productImage, selected_variation AS selectedVariation,
              quantity, unit_price AS unitPrice, line_total AS lineTotal
       FROM order_items WHERE order_id = ?`
    )
    .all(orderRow.id);

  const paymentRow = db
    .prepare(
      `SELECT p.*, u.full_name AS verified_by_name
       FROM payments p
       LEFT JOIN users u ON u.id = p.verified_by_id
       WHERE p.order_id = ?`
    )
    .get(orderRow.id) as Record<string, any> | undefined;

  const history = paymentRow
    ? db
        .prepare(
          `SELECT ph.id, ph.action, ph.status, u.full_name AS actorName, u.role AS actorRole,
                  ph.notes, ph.created_at AS createdAt
           FROM payment_history ph
           JOIN users u ON u.id = ph.actor_user_id
           WHERE ph.payment_id = ?
           ORDER BY ph.created_at DESC, ph.id DESC`
        )
        .all(paymentRow.id)
    : [];

  return {
    id: orderRow.id,
    orderReference: orderRow.order_reference,
    checkoutBatchRef: orderRow.checkout_batch_ref,
    buyerId: orderRow.buyer_id,
    buyerName: orderRow.buyer_name,
    buyerEmail: orderRow.buyer_email,
    buyerPhone: orderRow.buyer_phone,
    sellerId: orderRow.seller_id,
    sellerBusinessName: orderRow.seller_business_name,
    sellerVerifiedBadge: Boolean(orderRow.seller_verified_badge),
    sellerPaymentSettings: {
      momoEnabled: Boolean(orderRow.momo_enabled),
      momoProvider: orderRow.momo_provider || '',
      momoAccountName: orderRow.momo_account_name || '',
      momoNumber: orderRow.momo_number || '',
      momoInstructions: orderRow.momo_instructions || '',
      bankEnabled: Boolean(orderRow.bank_enabled),
      bankName: orderRow.bank_name || '',
      bankAccountName: orderRow.bank_account_name || '',
      bankAccountNumber: orderRow.bank_account_number || '',
      bankBranch: orderRow.bank_branch || '',
      bankInstructions: orderRow.bank_instructions || '',
    },
    fulfillmentMethod: orderRow.fulfillment_method,
    deliveryAddress: orderRow.delivery_address,
    deliveryNotes: orderRow.delivery_notes,
    promoCodeUsed: orderRow.promo_code_used,
    discountPercent: Number(orderRow.discount_percent || 0),
    subtotalAmount: Number(orderRow.subtotal_amount),
    discountAmount: Number(orderRow.discount_amount),
    totalAmount: Number(orderRow.total_amount),
    orderStatus: orderRow.order_status,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    items,
    payment: paymentRow
      ? {
          id: paymentRow.id,
          orderId: paymentRow.order_id,
          orderReference: paymentRow.order_reference,
          amountDue: Number(paymentRow.amount_due),
          amountReported: paymentRow.amount_reported !== null ? Number(paymentRow.amount_reported) : null,
          amountConfirmed: paymentRow.amount_confirmed !== null ? Number(paymentRow.amount_confirmed) : null,
          paymentMethod: paymentRow.payment_method,
          transactionReference: paymentRow.transaction_reference,
          reportedPaidAt: paymentRow.reported_paid_at,
          buyerNotes: paymentRow.buyer_notes,
          status: paymentRow.status,
          verifiedByName: paymentRow.verified_by_name,
          verifiedAt: paymentRow.verified_at,
          sellerNotes: paymentRow.seller_notes,
          history,
        }
      : null,
  };
}

buyerRouter.post('/orders/checkout', requireAuth, requireRole('buyer'), async (req: Request, res: Response) => {
  try {
    const buyer = req.authUser!;
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const fulfillmentMethod = req.body?.fulfillmentMethod === 'Pickup' ? 'Pickup' : 'Delivery';
    const deliveryAddress = sanitizeText(req.body?.deliveryAddress, 300);
    const deliveryNotes = sanitizeText(req.body?.deliveryNotes, 400);
    const buyerPhone = sanitizeText(req.body?.buyerPhone, 40) || buyer.phone || '';
    const promoCodeRaw = sanitizeText(req.body?.promoCode, 40).toUpperCase();

    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'Your shopping cart is empty.' });
    }
    if (!buyerPhone) {
      return res.status(400).json({ error: 'A contact telephone number is required for checkout.' });
    }
    if (fulfillmentMethod === 'Delivery' && !deliveryAddress) {
      return res.status(400).json({ error: 'Please enter a delivery address.' });
    }

    // Validate promo code server-side
    let appliedPromoCode: string | null = null;
    let discountPercent = 0;
    if (promoCodeRaw) {
      const promo = db.prepare(`SELECT * FROM promo_codes WHERE UPPER(code) = ?`).get(promoCodeRaw) as
        | {
            code: string;
            discount_percent: number;
            starts_at: string;
            expires_at: string;
            manually_ended: number;
          }
        | undefined;
      if (!promo) {
        return res.status(400).json({ error: 'The entered promotional code does not exist.' });
      }
      const now = Date.now();
      if (
        promo.manually_ended ||
        now < new Date(promo.starts_at).getTime() ||
        now >= new Date(promo.expires_at).getTime()
      ) {
        return res.status(400).json({ error: 'This promotional code is inactive or has expired.' });
      }
      appliedPromoCode = promo.code;
      discountPercent = Number(promo.discount_percent);
    }

    const checkoutBatchRef = `BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    interface ValidatedItem {
      productId: number;
      sellerId: number;
      sellerEmail: string;
      sellerBusinessName: string;
      title: string;
      image: string | null;
      selectedVariation: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }

    const createdOrdersInfo: Array<{
      orderId: number;
      orderReference: string;
      sellerId: number;
      sellerEmail: string;
      sellerBusinessName: string;
      totalAmount: number;
      items: ValidatedItem[];
    }> = [];

    const tx = db.transaction(() => {
      const groupedBySeller = new Map<number, ValidatedItem[]>();

      for (const entry of rawItems) {
        const productId = Number(entry?.productId);
        const quantity = Math.floor(Number(entry?.quantity));
        const selectedVariation = sanitizeText(entry?.selectedVariation, 80);

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
          throw new Error(`A selected product is no longer available.`);
        }
        if (product.application_status !== 'Approved' || product.seller_account_status !== 'Active') {
          throw new Error(`Seller for "${product.title}" is not currently active.`);
        }
        if (product.stock < quantity) {
          throw new Error(`Insufficient stock for "${product.title}". Available: ${product.stock}.`);
        }

        const unitPrice = Number(product.price);
        const lineTotal = Number((unitPrice * quantity).toFixed(2));
        const images = JSON.parse(product.images_json || '[]') as string[];

        const itemObj: ValidatedItem = {
          productId: product.id,
          sellerId: product.seller_id,
          sellerEmail: product.seller_email,
          sellerBusinessName: product.business_name,
          title: product.title,
          image: images[0] || null,
          selectedVariation,
          quantity,
          unitPrice,
          lineTotal,
        };

        const list = groupedBySeller.get(product.seller_id) || [];
        list.push(itemObj);
        groupedBySeller.set(product.seller_id, list);

        db.prepare(`UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?`).run(
          quantity,
          product.id
        );
      }

      // Create one independent seller-specific order per seller (no automatic payment splitting!)
      for (const [sellerId, sellerItems] of groupedBySeller.entries()) {
        const subtotalAmount = Number(
          sellerItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
        );
        const discountAmount = Number(((subtotalAmount * discountPercent) / 100).toFixed(2));
        const totalAmount = Number(Math.max(0, subtotalAmount - discountAmount).toFixed(2));

        let orderReference = generateOrderReference();
        while (db.prepare(`SELECT id FROM orders WHERE order_reference = ?`).get(orderReference)) {
          orderReference = generateOrderReference();
        }

        const orderRes = db
          .prepare(
            `INSERT INTO orders (
              order_reference, checkout_batch_ref, buyer_id, buyer_name, buyer_email, buyer_phone,
              seller_id, fulfillment_method, delivery_address, delivery_notes,
              promo_code_used, discount_percent, subtotal_amount, discount_amount, total_amount,
              order_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Seller Confirmation')`
          )
          .run(
            orderReference,
            checkoutBatchRef,
            buyer.id,
            buyer.fullName,
            buyer.email,
            buyerPhone,
            sellerId,
            fulfillmentMethod,
            deliveryAddress,
            deliveryNotes,
            appliedPromoCode,
            discountPercent,
            subtotalAmount,
            discountAmount,
            totalAmount
          );

        const orderId = Number(orderRes.lastInsertRowid);

        const insertItem = db.prepare(
          `INSERT INTO order_items (
            order_id, product_id, product_title, product_image, selected_variation, quantity, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const it of sellerItems) {
          insertItem.run(
            orderId,
            it.productId,
            it.title,
            it.image,
            it.selectedVariation,
            it.quantity,
            it.unitPrice,
            it.lineTotal
          );
        }

        const paymentRes = db
          .prepare(
            `INSERT INTO payments (
              order_id, order_reference, buyer_id, seller_id, amount_due, status
            ) VALUES (?, ?, ?, ?, ?, 'Not Reported')`
          )
          .run(orderId, orderReference, buyer.id, sellerId, totalAmount);

        db.prepare(
          `INSERT INTO payment_history (payment_id, action, status, actor_user_id, notes)
           VALUES (?, 'Order Created', 'Not Reported', ?, 'Awaiting direct manual payment from buyer.')`
        ).run(Number(paymentRes.lastInsertRowid), buyer.id);

        createNotification({
          userId: sellerId,
          title: `New Order ${orderReference}`,
          message: `${buyer.fullName} placed a new order totaling GHS ${totalAmount.toFixed(2)}.`,
          link: `/seller-dashboard?tab=orders&ref=${orderReference}`,
          type: 'new_order',
        });

        createdOrdersInfo.push({
          orderId,
          orderReference,
          sellerId,
          sellerEmail: sellerItems[0].sellerEmail,
          sellerBusinessName: sellerItems[0].sellerBusinessName,
          totalAmount,
          items: sellerItems,
        });
      }
    });

    tx();

    // Dispatch genuine Brevo emails outside SQLite transaction
    const baseUrl = getAppBaseUrl(req);
    const emailResults: Array<{ target: string; delivered: boolean; status: string }> = [];

    for (const ord of createdOrdersInfo) {
      const itemsRowsHtml = ord.items
        .map(
          (i) =>
            `<li><strong>${escapeHtml(i.title)}</strong>${i.selectedVariation ? ` (${escapeHtml(i.selectedVariation)})` : ''} × ${i.quantity} — GHS ${i.lineTotal.toFixed(2)}</li>`
        )
        .join('');

      // Email to Seller
      const sellerMail = await sendTransactionalEmail({
        toEmail: ord.sellerEmail,
        toName: ord.sellerBusinessName,
        subject: `New AIDOMART Order ${ord.orderReference}`,
        eventType: 'seller_new_order',
        dedupKey: `seller_order_${ord.orderReference}`,
        headline: `New Order Received: ${ord.orderReference}`,
        bodyHtml: `
          <p>A buyer has placed a new order with <strong>${escapeHtml(ord.sellerBusinessName)}</strong>.</p>
          <p><strong>Order Reference:</strong> ${escapeHtml(ord.orderReference)}<br/>
             <strong>Buyer:</strong> ${escapeHtml(buyer.fullName)} (${escapeHtml(buyerPhone)})<br/>
             <strong>Fulfilment:</strong> ${escapeHtml(fulfillmentMethod)} ${deliveryAddress ? `— ${escapeHtml(deliveryAddress)}` : ''}<br/>
             <strong>Amount Payable:</strong> GHS ${ord.totalAmount.toFixed(2)}</p>
          <ul>${itemsRowsHtml}</ul>
          <p>Please open your Seller Dashboard to confirm receipt of this order and monitor manual payment reporting.</p>
        `,
        ctaLabel: 'Review Order in Seller Dashboard',
        ctaUrl: `${baseUrl}/seller-dashboard?tab=orders`,
      });
      emailResults.push({ target: `seller:${ord.orderReference}`, delivered: sellerMail.delivered, status: sellerMail.status });

      // Email to Buyer
      const buyerMail = await sendTransactionalEmail({
        toEmail: buyer.email,
        toName: buyer.fullName,
        subject: `AIDOMART Order Confirmation — ${ord.orderReference}`,
        eventType: 'buyer_order_confirmation',
        dedupKey: `buyer_order_${ord.orderReference}`,
        headline: `Order Confirmed: ${ord.orderReference}`,
        bodyHtml: `
          <p>Hello ${escapeHtml(buyer.fullName)},</p>
          <p>Thank you for ordering from <strong>${escapeHtml(ord.sellerBusinessName)}</strong> on AIDOMART.</p>
          <p><strong>Unique Order Reference:</strong> ${escapeHtml(ord.orderReference)}<br/>
             <strong>Total Payable:</strong> GHS ${ord.totalAmount.toFixed(2)}</p>
          <ul>${itemsRowsHtml}</ul>
          <p>Please open your order page to view the seller's direct payment instructions and include <strong>${escapeHtml(ord.orderReference)}</strong> in your payment narration. Once paid, click <em>"I Have Made Payment"</em>.</p>
        `,
        ctaLabel: 'View Payment Instructions & Order',
        ctaUrl: `${baseUrl}/buyer-dashboard?order=${ord.orderId}`,
      });
      emailResults.push({ target: `buyer:${ord.orderReference}`, delivered: buyerMail.delivered, status: buyerMail.status });
    }

    return res.status(201).json({
      message:
        createdOrdersInfo.length > 1
          ? `Checkout complete. Created ${createdOrdersInfo.length} seller-specific orders so you can pay each seller directly.`
          : 'Order created successfully. Follow the seller payment instructions below.',
      checkoutBatchRef,
      orders: createdOrdersInfo.map((o) => ({
        orderId: o.orderId,
        orderReference: o.orderReference,
        sellerBusinessName: o.sellerBusinessName,
        totalAmount: o.totalAmount,
      })),
      emailResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to place order.';
    return res.status(400).json({ error: msg });
  }
});

buyerRouter.get('/buyer/orders', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT o.*, sp.business_name AS seller_business_name, sp.verified_badge AS seller_verified_badge,
              sp.momo_enabled, sp.momo_provider, sp.momo_account_name, sp.momo_number, sp.momo_instructions,
              sp.bank_enabled, sp.bank_name, sp.bank_account_name, sp.bank_account_number, sp.bank_branch, sp.bank_instructions
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.buyer_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(req.authUser!.id) as Record<string, any>[];

  return res.json({ orders: rows.map(formatOrderDetail) });
});

buyerRouter.get('/buyer/orders/:id', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT o.*, sp.business_name AS seller_business_name, sp.verified_badge AS seller_verified_badge,
              sp.momo_enabled, sp.momo_provider, sp.momo_account_name, sp.momo_number, sp.momo_instructions,
              sp.bank_enabled, sp.bank_name, sp.bank_account_name, sp.bank_account_number, sp.bank_branch, sp.bank_instructions
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = ? AND o.buyer_id = ?`
    )
    .get(id, req.authUser!.id) as Record<string, any> | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  return res.json({ order: formatOrderDetail(row) });
});

buyerRouter.post('/buyer/orders/:id/report-payment', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  const buyer = req.authUser!;

  const order = db
    .prepare(
      `SELECT o.*, sp.momo_enabled, sp.bank_enabled, sp.business_name
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = ? AND o.buyer_id = ?`
    )
    .get(orderId, buyer.id) as Record<string, any> | undefined;

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  if (order.order_status === 'Cancelled') {
    return res.status(400).json({ error: 'Cannot report payment on a cancelled order.' });
  }

  const paymentMethod = sanitizeText(req.body?.paymentMethod, 80);
  const amountReported = Number(req.body?.amountReported);
  const transactionReference = sanitizeText(req.body?.transactionReference, 120);
  const reportedPaidAt = sanitizeText(req.body?.reportedPaidAt, 80) || new Date().toISOString();
  const buyerNotes = sanitizeText(req.body?.buyerNotes, 500);

  if (!paymentMethod) {
    return res.status(400).json({ error: 'Please select the payment method you used.' });
  }
  if (paymentMethod.toLowerCase().includes('mobile') && !order.momo_enabled) {
    return res.status(400).json({ error: 'This seller has not enabled Mobile Money payments.' });
  }
  if (paymentMethod.toLowerCase().includes('bank') && !order.bank_enabled) {
    return res.status(400).json({ error: 'This seller has not enabled Bank Transfer payments.' });
  }
  if (!Number.isFinite(amountReported) || amountReported <= 0) {
    return res.status(400).json({ error: 'Please enter the exact amount you paid.' });
  }

  const payment = db.prepare(`SELECT id, status FROM payments WHERE order_id = ?`).get(orderId) as
    | { id: number; status: string }
    | undefined;

  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }
  if (payment.status === 'Payment Confirmed') {
    return res.status(400).json({ error: 'Payment has already been confirmed by the seller.' });
  }

  const newStatus = 'Payment Reported — Awaiting Seller Verification';
  db.transaction(() => {
    db.prepare(
      `UPDATE payments
       SET payment_method = ?, amount_reported = ?, transaction_reference = ?,
           reported_paid_at = ?, buyer_notes = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(paymentMethod, amountReported, transactionReference, reportedPaidAt, buyerNotes, newStatus, payment.id);

    db.prepare(
      `INSERT INTO payment_history (payment_id, action, status, actor_user_id, notes)
       VALUES (?, 'Buyer Reported Payment', ?, ?, ?)`
    ).run(
      payment.id,
      newStatus,
      buyer.id,
      `Reported GHS ${amountReported.toFixed(2)} via ${paymentMethod}${transactionReference ? ` (Ref: ${transactionReference})` : ''}.`
    );

    createNotification({
      userId: order.seller_id,
      title: `Payment Reported for ${order.order_reference}`,
      message: `${buyer.fullName} reported payment of GHS ${amountReported.toFixed(2)}. Check your receiving account before confirming.`,
      link: `/seller-dashboard?tab=payments`,
      type: 'payment_reported',
    });
  })();

  return res.json({
    message: 'Payment report saved. Status set to Payment Reported — Awaiting Seller Verification.',
    status: newStatus,
  });
});

buyerRouter.get('/buyer/reviews/eligible', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const eligible = db
    .prepare(
      `SELECT o.id AS orderId, o.order_reference AS orderReference, o.created_at AS orderDate,
              oi.product_id AS productId, oi.product_title AS productTitle, oi.product_image AS productImage
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN reviews r ON r.order_id = o.id AND r.product_id = oi.product_id AND r.buyer_id = o.buyer_id
       WHERE o.buyer_id = ?
         AND o.order_status = 'Completed'
         AND r.id IS NULL
       ORDER BY o.created_at DESC`
    )
    .all(req.authUser!.id);

  const submitted = db
    .prepare(
      `SELECT r.id, r.product_id AS productId, p.title AS productTitle, r.order_id AS orderId,
              r.rating, r.comment, r.seller_response AS sellerResponse, r.created_at AS createdAt
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       WHERE r.buyer_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(req.authUser!.id);

  return res.json({ eligible, submitted });
});

buyerRouter.post('/buyer/reviews', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const buyer = req.authUser!;
  const orderId = Number(req.body?.orderId);
  const productId = Number(req.body?.productId);
  const rating = Math.floor(Number(req.body?.rating));
  const comment = sanitizeText(req.body?.comment, 1000);

  if (!Number.isFinite(orderId) || !Number.isFinite(productId)) {
    return res.status(400).json({ error: 'Valid order and product are required.' });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
  }
  if (!comment || comment.length < 5) {
    return res.status(400).json({ error: 'Please write a short review (at least 5 characters).' });
  }

  // Strictly verify completed qualifying purchase
  const qualifying = db
    .prepare(
      `SELECT o.id, o.seller_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = ? AND o.buyer_id = ? AND oi.product_id = ? AND o.order_status = 'Completed'
       LIMIT 1`
    )
    .get(orderId, buyer.id, productId) as { id: number; seller_id: number } | undefined;

  if (!qualifying) {
    return res.status(403).json({
      error: 'Only buyers with a completed order for this product can submit a verified-purchase review.',
    });
  }

  const existing = db
    .prepare(`SELECT id FROM reviews WHERE order_id = ? AND product_id = ? AND buyer_id = ?`)
    .get(orderId, productId, buyer.id);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted a review for this purchase.' });
  }

  db.prepare(
    `INSERT INTO reviews (product_id, order_id, buyer_id, rating, comment) VALUES (?, ?, ?, ?, ?)`
  ).run(productId, orderId, buyer.id, rating, comment);

  createNotification({
    userId: qualifying.seller_id,
    title: 'New Verified Product Review',
    message: `${buyer.fullName} left a ${rating}-star review on your product.`,
    link: `/seller-dashboard?tab=feedback`,
    type: 'review',
  });

  return res.status(201).json({ message: 'Thank you. Your verified-purchase review has been published.' });
});

buyerRouter.get('/buyer/complaints', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const complaints = db
    .prepare(
      `SELECT c.id, c.order_id AS orderId, o.order_reference AS orderReference,
              c.reporter_id AS reporterId, u.full_name AS reporterName, u.role AS reporterRole,
              c.target_seller_id AS targetSellerId, sp.business_name AS targetSellerName,
              c.subject, c.message, c.status, c.seller_response AS sellerResponse,
              c.admin_notes AS adminNotes, c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM complaints c
       JOIN users u ON u.id = c.reporter_id
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN seller_profiles sp ON sp.user_id = c.target_seller_id
       WHERE c.reporter_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.authUser!.id);
  return res.json({ complaints });
});

buyerRouter.post('/buyer/complaints', requireAuth, requireRole('buyer'), (req: Request, res: Response) => {
  const buyer = req.authUser!;
  const orderId = req.body?.orderId ? Number(req.body.orderId) : null;
  const subject = sanitizeText(req.body?.subject, 160);
  const message = sanitizeText(req.body?.message, 1500);

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and detailed message are required.' });
  }

  let targetSellerId: number | null = null;
  if (orderId) {
    const ord = db.prepare(`SELECT id, seller_id FROM orders WHERE id = ? AND buyer_id = ?`).get(orderId, buyer.id) as
      | { id: number; seller_id: number }
      | undefined;
    if (!ord) {
      return res.status(404).json({ error: 'Referenced order not found.' });
    }
    targetSellerId = ord.seller_id;
  }

  db.prepare(
    `INSERT INTO complaints (order_id, reporter_id, target_seller_id, subject, message)
     VALUES (?, ?, ?, ?, ?)`
  ).run(orderId, buyer.id, targetSellerId, subject, message);

  if (targetSellerId) {
    createNotification({
      userId: targetSellerId,
      title: 'New Buyer Complaint / Feedback',
      message: `${buyer.fullName} submitted feedback: "${subject}".`,
      link: '/seller-dashboard?tab=feedback',
      type: 'complaint',
    });
  }

  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get() as { id: number } | undefined;
  if (admin) {
    createNotification({
      userId: admin.id,
      title: 'New Marketplace Complaint',
      message: `${buyer.fullName} filed a complaint: "${subject}".`,
      link: '/admin?tab=complaints',
      type: 'complaint',
    });
  }

  return res.status(201).json({ message: 'Your complaint / feedback has been submitted.' });
});
