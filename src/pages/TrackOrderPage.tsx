import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Phone,
  Search,
  Store,
  Truck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Order, OrderTrackingEvent } from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';

interface TrackOrderPageProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

interface TrackedOrderResult {
  orderReference: string;
  fulfillmentMethod: 'Delivery' | 'Pickup';
  orderStatus: string;
  paymentStatus: string;
  trackingStage: string;
  trackingLocation: string;
  trackingNote: string;
  estimatedDelivery: string;
  courierContact: string;
  createdAt: string;
  updatedAt: string;
  seller: {
    userId: number;
    businessName: string;
    verifiedBadge: boolean;
    locationCity: string;
    phone: string;
  };
  items: Array<{
    productTitle: string;
    selectedVariation: string;
    quantity: number;
    productImage: string | null;
  }>;
  trackingEvents: OrderTrackingEvent[];
}

const PROGRESS_STEPS = [
  { key: 'Order Placed', label: 'Order Placed' },
  { key: 'Confirmed & Preparing', label: 'Confirmed' },
  { key: 'Packed & Ready', label: 'Packed' },
  { key: 'Dispatched / In Transit', label: 'In Transit' },
  { key: 'Delivered / Completed', label: 'Delivered' },
];

function getStepIndex(stage: string, orderStatus: string): number {
  const s = `${stage} ${orderStatus}`.toLowerCase();
  if (s.includes('cancel')) return -1;
  if (s.includes('complete') || s.includes('deliver')) return 4;
  if (s.includes('transit') || s.includes('dispatch') || s.includes('out for') || s.includes('pickup')) {
    return 3;
  }
  if (s.includes('pack') || s.includes('process')) return 2;
  if (s.includes('confirm')) return 1;
  return 0;
}

export function TrackOrderPage({ initialQuery, onNavigate }: TrackOrderPageProps) {
  const { user } = useAuth();
  const initialCode = (initialQuery?.get('code') || '').trim().toUpperCase();

  const [codeInput, setCodeInput] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedOrderResult | null>(null);
  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);

  const runLookup = async (rawCode: string) => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) {
      setError('Enter your unique order tracking code (for example, AM7K9P2X).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ tracking: TrackedOrderResult }>(
        `/api/marketplace/track/${encodeURIComponent(clean)}`
      );
      setResult(data.tracking);
    } catch (err: any) {
      setResult(null);
      setError(err.message || 'Could not find an order matching that code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      setCodeInput(initialCode);
      runLookup(initialCode);
    }
  }, [initialCode]);

  useEffect(() => {
    if (user?.role === 'buyer') {
      apiRequest<{ orders: Order[] }>('/api/buyer/orders')
        .then((d) => setBuyerOrders(d.orders || []))
        .catch(() => {});
    } else {
      setBuyerOrders([]);
    }
  }, [user?.id, user?.role]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(codeInput);
  };

  const activeStep = result ? getStepIndex(result.trackingStage, result.orderStatus) : 0;
  const sellerWhatsApp = result
    ? buildWhatsAppUrl(
        result.seller.phone,
        `Hello ${result.seller.businessName}, I am checking on my AIDOMART order ${result.orderReference}.`
      )
    : null;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5 shadow-sm">
        <div>
          <h1 className="font-display text-xl sm:text-3xl font-bold text-[#0B1F3A]">
            Track Your AIDOMART Order
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Enter the short unique order code you received at checkout (e.g.{' '}
            <span className="font-mono font-semibold text-[#0B1F3A]">AM7K9P2X</span>) to see live status and seller tracking updates.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter order code (e.g. AM7K9P2X)"
              className="w-full min-w-0 pl-10 pr-4 py-3 border border-slate-300 rounded-lg font-mono text-base uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#F97316]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 min-h-[44px] px-6 py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {loading ? 'Checking...' : 'Track Order'}
          </button>
        </form>

        {buyerOrders.length > 0 && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-semibold text-slate-500">Your Recent Orders:</p>
            <div className="flex flex-wrap gap-2">
              {buyerOrders.slice(0, 6).map((ord) => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => {
                    setCodeInput(ord.orderReference);
                    runLookup(ord.orderReference);
                  }}
                  className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-colors ${
                    result?.orderReference === ord.orderReference
                      ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                      : 'bg-slate-50 text-[#0B1F3A] border-slate-200 hover:border-[#F97316]'
                  }`}
                >
                  {ord.orderReference}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs text-slate-500">Order Reference</p>
              <h2 className="font-mono text-xl sm:text-2xl font-bold text-[#0B1F3A]">
                {result.orderReference}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Placed {new Date(result.createdAt).toLocaleString()} · {result.fulfillmentMethod}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-slate-500">Current Stage</p>
              <p className="text-sm sm:text-base font-bold text-[#F97316]">
                {result.trackingStage || result.orderStatus}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Payment: {result.paymentStatus}</p>
            </div>
          </div>

          {/* Progress Stepper */}
          {activeStep >= 0 ? (
            <div className="grid grid-cols-5 gap-1.5 sm:gap-3 pt-1">
              {PROGRESS_STEPS.map((step, idx) => {
                const done = idx <= activeStep;
                return (
                  <div key={step.key} className="space-y-1.5 text-center">
                    <div
                      className={`h-2 rounded-full transition-colors ${
                        done ? 'bg-[#F97316]' : 'bg-slate-200'
                      }`}
                    />
                    <p
                      className={`text-[10px] sm:text-xs leading-tight ${
                        done ? 'font-semibold text-[#0B1F3A]' : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              This order was marked Cancelled.
            </div>
          )}

          {/* Latest Checkpoint Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
            <div className="space-y-1.5 min-w-0 break-words">
              <p className="font-semibold text-[#0B1F3A] flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#F97316]" />
                <span>Latest Dispatch Status</span>
              </p>
              <p className="text-slate-700">
                <strong>Workflow:</strong> {result.orderStatus}
              </p>
              {result.trackingLocation && (
                <p className="text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>Location: {result.trackingLocation}</span>
                </p>
              )}
              {result.estimatedDelivery && (
                <p className="text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>ETA: {result.estimatedDelivery}</span>
                </p>
              )}
              {result.courierContact && (
                <p className="text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>Rider / Courier: {result.courierContact}</span>
                </p>
              )}
              {result.trackingNote && (
                <p className="text-slate-600 pt-1">{result.trackingNote}</p>
              )}
            </div>

            <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4 min-w-0 break-words">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-semibold text-[#0B1F3A] flex items-center gap-1.5 min-w-0">
                  <Store className="w-4 h-4 text-[#F97316] shrink-0" />
                  <span className="break-words">{result.seller.businessName}</span>
                </span>
                {result.seller.verifiedBadge && <VerifiedBadge />}
              </div>
              {result.seller.locationCity && (
                <p className="text-slate-600">Location: {result.seller.locationCity}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {user?.role === 'buyer' && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(`/buyer-dashboard?tab=messages&sellerId=${result.seller.userId}`)
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
                  >
                    Message Seller
                  </button>
                )}
                {sellerWhatsApp && (
                  <a
                    href={sellerWhatsApp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500">Order Items</h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {result.items.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center gap-3 text-xs">
                  {item.productImage ? (
                    <SafeAssetImage
                      src={item.productImage}
                      alt={item.productTitle}
                      className="w-11 h-11 rounded-md object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#0B1F3A] truncate">{item.productTitle}</p>
                    <p className="text-slate-500">
                      {item.selectedVariation ? `${item.selectedVariation} · ` : ''}Qty: {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracking Timeline */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500">Tracking Timeline</h3>
            {result.trackingEvents.length === 0 ? (
              <p className="text-xs text-slate-500">No tracking updates posted yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {result.trackingEvents.map((ev, idx) => (
                  <div key={ev.id} className="p-3.5 flex items-start justify-between gap-3 text-xs min-w-0">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <CheckCircle2
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          idx === 0 ? 'text-[#F97316]' : 'text-emerald-600'
                        }`}
                      />
                      <div className="min-w-0 flex-1 break-words">
                        <p className="font-semibold text-[#0B1F3A]">
                          {ev.stage}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                        {ev.note && <p className="text-slate-600 mt-0.5 break-words">{ev.note}</p>}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
