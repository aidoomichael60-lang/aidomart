import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Tag } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

interface CheckoutPageProps {
  onNavigate: (path: string) => void;
}

export function CheckoutPage({ onNavigate }: CheckoutPageProps) {
  const { user } = useAuth();
  const { items, subtotal, clearCart } = useCart();

  const [fulfillmentMethod, setFulfillmentMethod] = useState<'Delivery' | 'Pickup'>('Delivery');
  const [buyerPhone, setBuyerPhone] = useState(user?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdOrders, setCreatedOrders] = useState<
    Array<{ orderId: number; orderReference: string; sellerBusinessName: string; totalAmount: number }>
  >([]);

  const sellerGroups = useMemo(() => {
    const map = new Map<number, { sellerName: string; items: typeof items; total: number }>();
    for (const it of items) {
      const sid = it.product.sellerId;
      const existing = map.get(sid) || {
        sellerName: it.product.seller?.businessName || 'Independent Seller',
        items: [],
        total: 0,
      };
      existing.items.push(it);
      existing.total += it.product.price * it.quantity;
      map.set(sid, existing);
    }
    return Array.from(map.entries());
  }, [items]);

  const discountAmount = appliedPromo
    ? Number(((subtotal * appliedPromo.discountPercent) / 100).toFixed(2))
    : 0;
  const finalTotal = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

  const handleValidatePromo = async () => {
    setPromoError('');
    if (!promoInput.trim()) return;
    try {
      const res = await apiRequest<{ valid: boolean; code: string; discountPercent: number }>(
        '/api/marketplace/promo/validate',
        { method: 'POST', body: { code: promoInput.trim() } }
      );
      setAppliedPromo({ code: res.code, discountPercent: res.discountPercent });
    } catch (err: any) {
      setAppliedPromo(null);
      setPromoError(err.message || 'Invalid promotional code.');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        message: string;
        orders: Array<{
          orderId: number;
          orderReference: string;
          sellerBusinessName: string;
          totalAmount: number;
        }>;
      }>('/api/orders/checkout', {
        method: 'POST',
        body: {
          items: items.map((it) => ({
            productId: it.product.id,
            quantity: it.quantity,
            selectedVariation: it.selectedVariation,
          })),
          fulfillmentMethod,
          buyerPhone,
          deliveryAddress,
          deliveryNotes,
          promoCode: appliedPromo?.code || '',
        },
      });
      setCreatedOrders(res.orders || []);
      clearCart();
    } catch (err: any) {
      setError(err.message || 'Unable to place order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdOrders.length > 0) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-8 sm:py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B1F3A]">
                Order Placed Successfully
              </h1>
              <p className="text-xs sm:text-sm text-slate-600">
                Your order(s) have been saved with short, Mobile Money–ready tracking codes.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {createdOrders.map((ord) => (
              <div
                key={ord.orderId}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500 break-words">Seller: {ord.sellerBusinessName}</p>
                  <p className="font-mono text-base font-bold text-[#0B1F3A] mt-0.5 break-all">
                    Code: {ord.orderReference}
                  </p>
                  <p className="text-sm font-mono font-semibold text-[#F97316] tabular-nums">
                    Amount Payable: GHS {ord.totalAmount.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigate(`/buyer-dashboard?order=${ord.orderId}`)}
                    className="px-3.5 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Payment Instructions
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/track-order?code=${encodeURIComponent(ord.orderReference)}`)}
                    className="px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Track Order
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600">
            Enter the short 8-character code above in the Mobile Money or Bank Transfer reference field when paying each seller, then click <strong>I Have Made Payment</strong> on your order page.
          </p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-3 sm:px-6 py-12 sm:py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Your Cart is Empty</h1>
        <p className="text-sm text-slate-600">Add published seller products to proceed to checkout.</p>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="min-h-[42px] px-5 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
        >
          Browse Shop
        </button>
      </div>
    );
  }

  if (!user || user.role !== 'buyer') {
    return (
      <div className="max-w-xl mx-auto px-3 sm:px-6 py-10 sm:py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 text-center space-y-4">
          <Lock className="w-8 h-8 text-[#F97316] mx-auto" />
          <h1 className="font-display text-xl font-bold text-[#0B1F3A]">
            Buyer Account Required for Checkout
          </h1>
          <p className="text-sm text-slate-600">
            {user
              ? 'You are currently signed in as a Seller/Admin. Please sign in with a Buyer account to place marketplace orders.'
              : 'Please sign in or register a verified Buyer account to complete checkout and track your manual payments.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Sign In as Buyer
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/register?role=buyer')}
              className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#F97316] text-white text-xs font-semibold"
            >
              Register Buyer Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-10">
      <h1 className="font-display text-xl sm:text-3xl font-bold text-[#0B1F3A] mb-5 sm:mb-8">
        Checkout
      </h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
        <div className="lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            Delivery & Pickup Details
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFulfillmentMethod('Delivery')}
              className={`min-w-0 py-2.5 px-3 sm:px-4 rounded-lg border text-sm font-semibold transition-colors ${
                fulfillmentMethod === 'Delivery'
                  ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                  : 'border-slate-300 text-slate-700 bg-white'
              }`}
            >
              Delivery
            </button>
            <button
              type="button"
              onClick={() => setFulfillmentMethod('Pickup')}
              className={`min-w-0 py-2.5 px-3 sm:px-4 rounded-lg border text-sm font-semibold transition-colors ${
                fulfillmentMethod === 'Pickup'
                  ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                  : 'border-slate-300 text-slate-700 bg-white'
              }`}
            >
              Seller Pickup
            </button>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contact Telephone Number *
            </label>
            <input
              type="tel"
              required
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="e.g. 0200000000"
              className="w-full min-w-0 px-3.5 py-2.5 border border-slate-300 rounded-lg text-base sm:text-sm"
            />
          </div>

          {fulfillmentMethod === 'Delivery' && (
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery Address & Landmark *
              </label>
              <input
                type="text"
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House number, street, area, city"
                className="w-full min-w-0 px-3.5 py-2.5 border border-slate-300 rounded-lg text-base sm:text-sm"
              />
            </div>
          )}

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Delivery or Pickup Notes
            </label>
            <textarea
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Preferred time or instructions for the seller..."
              className="w-full min-w-0 px-3.5 py-2.5 border border-slate-300 rounded-lg text-base sm:text-sm"
            />
          </div>

          {sellerGroups.length > 1 && (
            <div className="p-3.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-slate-800 break-words">
              Your cart includes items from <strong>{sellerGroups.length} different sellers</strong>. AIDOMART will create a separate seller-specific order and unique reference for each seller so you can pay each seller directly with no automated payment splitting.
            </div>
          )}
        </div>

        <div className="lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Order Summary</h2>

          <div className="space-y-4 divide-y divide-slate-100">
            {sellerGroups.map(([sellerId, group]) => (
              <div key={sellerId} className="pt-3 first:pt-0 space-y-2 min-w-0">
                <p className="text-xs font-semibold text-[#0B1F3A] break-words">
                  Seller: {group.sellerName}
                </p>
                {group.items.map((it) => (
                  <div
                    key={`${it.product.id}-${it.selectedVariation}`}
                    className="flex items-start justify-between text-xs text-slate-700 gap-2 min-w-0"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {it.product.title}
                      {it.selectedVariation ? ` (${it.selectedVariation})` : ''} × {it.quantity}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 whitespace-nowrap">
                      GHS {(it.product.price * it.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Promo Code */}
          <div className="pt-4 border-t border-slate-200 space-y-2 min-w-0">
            <label className="block text-xs font-semibold text-slate-700">
              Promotional Code
            </label>
            <div className="flex gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="Enter promo code"
                  className="w-full min-w-0 pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-base sm:text-xs font-mono uppercase"
                />
              </div>
              <button
                type="button"
                onClick={handleValidatePromo}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 whitespace-nowrap"
              >
                Apply
              </button>
            </div>
            {promoError && <p className="text-xs text-red-600 break-words">{promoError}</p>}
            {appliedPromo && (
              <p className="text-xs text-emerald-700 font-medium break-words">
                Applied {appliedPromo.code}: {appliedPromo.discountPercent}% discount
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">GHS {subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Promo Discount ({appliedPromo?.discountPercent}%)</span>
                <span className="font-mono tabular-nums">-GHS {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-[#0B1F3A] pt-2 border-t border-slate-100">
              <span>Total Payable</span>
              <span className="font-mono tabular-nums">GHS {finalTotal.toFixed(2)}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {submitting ? 'Creating Order...' : 'Place Order & View Payment Details'}
          </button>
        </div>
      </form>
    </div>
  );
}
