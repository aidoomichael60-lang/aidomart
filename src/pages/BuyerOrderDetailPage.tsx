import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ClipboardCopy,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';

interface BuyerOrderDetailPageProps {
  orderId: number;
  onNavigate: (path: string) => void;
}

export function BuyerOrderDetailPage({ orderId, onNavigate }: BuyerOrderDetailPageProps) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);

  // Payment report form
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMethod, setReportMethod] = useState('');
  const [reportAmount, setReportAmount] = useState('');
  const [reportTxRef, setReportTxRef] = useState('');
  const [reportPaidAt, setReportPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [reportNotes, setReportNotes] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [reportErr, setReportErr] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Buyer Cancel & Refund forms
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundDetails, setRefundDetails] = useState('');
  const [requestingRefund, setRequestingRefund] = useState(false);
  const [orderActionMsg, setOrderActionMsg] = useState('');
  const [orderActionErr, setOrderActionErr] = useState('');

  const loadOrder = useCallback(async (silent = false) => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setError('Invalid order ID.');
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await apiRequest<{ order: Order }>(`/api/buyer/orders/${orderId}`);
      setOrder(res.order);
    } catch (err: any) {
      setError(err.message || 'Could not load order details.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (user?.role === 'buyer') {
      loadOrder(false);
      return subscribeDataChanged(() => {
        loadOrder(true);
      });
    }
    setLoading(false);
    return undefined;
  }, [user?.id, user?.role, loadOrder]);

  if (!user || user.role !== 'buyer') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Order Details</h1>
        <p className="text-sm text-slate-600">
          Please sign in with your Buyer account to view this order's information and payment instructions.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="px-5 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-8 space-y-4">
        <button
          type="button"
          onClick={() => onNavigate('/buyer-dashboard?tab=orders')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </button>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
          Loading order information...
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-10 space-y-4">
        <button
          type="button"
          onClick={() => onNavigate('/buyer-dashboard?tab=orders')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </button>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <p className="text-sm font-semibold text-red-700">{error || 'Order not found.'}</p>
          <button
            type="button"
            onClick={() => onNavigate('/buyer-dashboard?tab=orders')}
            className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
          >
            Return to My Orders
          </button>
        </div>
      </div>
    );
  }

  const openReportModal = (ord: Order) => {
    const methods: string[] = [];
    if (ord.sellerPaymentSettings?.momoEnabled) {
      methods.push(`Mobile Money (${ord.sellerPaymentSettings.momoProvider})`);
    }
    if (ord.sellerPaymentSettings?.bankEnabled) {
      methods.push(`Bank Transfer (${ord.sellerPaymentSettings.bankName})`);
    }
    setReportMethod(methods[0] || 'Mobile Money');
    setReportAmount(ord.totalAmount.toFixed(2));
    setReportTxRef('');
    setReportNotes('');
    setReportMsg('');
    setReportErr('');
    setShowReportForm(true);
  };

  const handleSubmitPaymentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReport(true);
    setReportMsg('');
    setReportErr('');
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/buyer/orders/${order.id}/report-payment`,
        {
          method: 'POST',
          body: {
            paymentMethod: reportMethod,
            amountReported: Number(reportAmount),
            transactionReference: reportTxRef,
            reportedPaidAt: new Date(reportPaidAt).toISOString(),
            buyerNotes: reportNotes,
          },
        }
      );
      setReportMsg(res.message);
      setShowReportForm(false);
      await loadOrder(true);
    } catch (err: any) {
      setReportErr(err.message || 'Could not report payment.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancellingOrder(true);
    setOrderActionMsg('');
    setOrderActionErr('');
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/buyer/orders/${order.id}/cancel`,
        {
          method: 'POST',
          body: { reason: cancelReason },
        }
      );
      setOrderActionMsg(res.message);
      setShowCancelForm(false);
      setCancelReason('');
      await loadOrder(true);
    } catch (err: any) {
      setOrderActionErr(err.message || 'Could not cancel order.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleRequestRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestingRefund(true);
    setOrderActionMsg('');
    setOrderActionErr('');
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/buyer/orders/${order.id}/request-refund`,
        {
          method: 'POST',
          body: { reason: refundReason, refundDetails },
        }
      );
      setOrderActionMsg(res.message);
      setShowRefundForm(false);
      setRefundReason('');
      setRefundDetails('');
      await loadOrder(true);
    } catch (err: any) {
      setOrderActionErr(err.message || 'Could not submit refund request.');
    } finally {
      setRequestingRefund(false);
    }
  };

  const canCancel = ['Pending Seller Confirmation', 'Confirmed', 'Processing'].includes(order.orderStatus);
  const canRequestRefund = [
    'Payment Reported — Awaiting Seller Verification',
    'Payment Confirmed',
    'Payment Amount Mismatch',
    'Payment Under Review',
    'Payment Not Received',
  ].includes(order.payment?.status || '');

  const whatsappUrl = buildWhatsAppUrl(
    order.sellerPhone,
    `Hello ${order.sellerBusinessName}, following up on AIDOMART order ${order.orderReference}.`
  );

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('/buyer-dashboard?tab=orders')}
          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#0B1F3A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate(`/track-order?code=${encodeURIComponent(order.orderReference)}`)}
          className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
        >
          <Truck className="w-4 h-4" />
          <span>Open Full Order Tracker</span>
        </button>
      </div>

      {/* Order Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Package className="w-3.5 h-3.5 text-[#F97316]" />
                Order Reference
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-xl sm:text-2xl font-bold text-[#0B1F3A] break-all">
                {order.orderReference}
              </h1>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(order.orderReference);
                  setCopiedRef(true);
                  setTimeout(() => setCopiedRef(false), 2000);
                }}
                className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
                <span>{copiedRef ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-600 break-words">
              Placed {new Date(order.createdAt).toLocaleString()} · <strong>{order.fulfillmentMethod}</strong>
              {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
            </p>
            {order.deliveryNotes && (
              <p className="text-xs text-slate-500 break-words">Delivery Note: {order.deliveryNotes}</p>
            )}
          </div>

          <div className="md:text-right space-y-2 shrink-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seller Store</p>
              <button
                type="button"
                onClick={() => onNavigate(`/seller/${order.sellerId}`)}
                className="text-sm font-bold text-[#0B1F3A] hover:text-[#F97316] break-words text-left md:text-right"
              >
                {order.sellerBusinessName}
              </button>
              {order.sellerVerifiedBadge && (
                <div className="mt-1 md:flex md:justify-end">
                  <VerifiedBadge />
                </div>
              )}
            </div>
            <div className="flex flex-wrap md:justify-end gap-2">
              <button
                type="button"
                onClick={() => onNavigate(`/buyer-dashboard?tab=messages&sellerId=${order.sellerId}`)}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Message Seller</span>
              </button>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                >
                  <WhatsAppIcon className="w-4 h-4 shrink-0" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 3 Status Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Order Status</p>
            <p className="text-sm font-bold text-[#0B1F3A] mt-0.5">{order.orderStatus}</p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Delivery Tracking</p>
            <p className="text-sm font-bold text-[#0B1F3A] mt-0.5">{order.trackingStage || 'Order Placed'}</p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Manual Payment</p>
            <p className="text-sm font-bold text-[#F97316] mt-0.5">{order.payment?.status || 'Not Reported'}</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Items, Tracking & Payment History */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          {/* Order Items */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Order Items ({order.items.length})
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {order.items.map((item) => (
                <div key={item.id} className="p-3.5 flex items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => item.productId && onNavigate(`/product/${item.productId}`)}
                    className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0"
                  >
                    {item.productImage ? (
                      <SafeAssetImage
                        src={item.productImage}
                        alt={item.productTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                        Item
                      </div>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => item.productId && onNavigate(`/product/${item.productId}`)}
                      className="text-sm font-semibold text-[#0B1F3A] hover:text-[#F97316] text-left break-words"
                    >
                      {item.productTitle}
                    </button>
                    {item.selectedVariation && (
                      <p className="text-xs text-slate-500 mt-0.5">Variation: {item.selectedVariation}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      Qty: {item.quantity} × GHS {item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#0B1F3A] tabular-nums shrink-0 whitespace-nowrap">
                    GHS {item.lineTotal.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-1 text-xs text-slate-600">
              {order.discountAmount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">GHS {order.subtotalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Promo Discount ({order.promoCodeUsed || `${order.discountPercent}%`})</span>
                    <span className="font-mono tabular-nums">-GHS {order.discountAmount.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center text-sm sm:text-base font-bold text-[#0B1F3A] pt-2 border-t border-slate-200">
                <span>Exact Amount Payable</span>
                <span className="font-mono text-[#F97316] tabular-nums whitespace-nowrap">
                  GHS {order.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Seller Tracking & Delivery Progress */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#0B1F3A] flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#F97316]" />
                <span>Seller Tracking &amp; Delivery Progress</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate(`/track-order?code=${encodeURIComponent(order.orderReference)}`)}
                className="text-xs font-semibold text-[#F97316] hover:underline"
              >
                Full Tracker →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              {order.trackingLocation && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>Location: {order.trackingLocation}</span>
                </p>
              )}
              {order.estimatedDelivery && (
                <p className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>ETA: {order.estimatedDelivery}</span>
                </p>
              )}
              {order.courierContact && (
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                  <span>Rider / Courier: {order.courierContact}</span>
                </p>
              )}
              {order.trackingNote ? (
                <p className="sm:col-span-2 text-slate-600">{order.trackingNote}</p>
              ) : (
                !order.trackingLocation &&
                !order.estimatedDelivery &&
                !order.courierContact && (
                  <p className="sm:col-span-2 text-slate-500">
                    Current stage: <strong>{order.trackingStage || 'Order Placed'}</strong>. Tracking notes from the seller will appear here.
                  </p>
                )
              )}
            </div>

            {order.trackingEvents && order.trackingEvents.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
                {order.trackingEvents.map((ev) => (
                  <div key={ev.id} className="px-3.5 py-2.5 flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1 break-words">
                      <span className="font-semibold text-[#0B1F3A]">
                        {ev.stage}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </span>
                      {ev.note && <p className="text-slate-600 mt-0.5 break-words">{ev.note}</p>}
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment History Log */}
          {order.payment?.history?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">Payment History</h2>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                {order.payment.history.map((h) => (
                  <div key={h.id} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-[#0B1F3A]">{h.action}</span>
                      {h.notes && <p className="text-slate-600 mt-0.5 break-words">{h.notes}</p>}
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Payment Instructions, Report Form, Cancel & Refund */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          {/* Manual Seller Payment Instructions */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#F97316]" />
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Direct Manual Payment Instructions
              </h2>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Pay <strong>GHS {order.totalAmount.toFixed(2)}</strong> directly to{' '}
              <strong>{order.sellerBusinessName}</strong> using one of their configured methods below. Always enter{' '}
              <strong className="font-mono">{order.orderReference}</strong> as your payment reference/narration.
            </p>

            <div className="space-y-3">
              {order.sellerPaymentSettings?.momoEnabled && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 min-w-0 break-words">
                  <p className="font-bold text-[#0B1F3A]">
                    Mobile Money ({order.sellerPaymentSettings.momoProvider})
                  </p>
                  <p>Account Name: {order.sellerPaymentSettings.momoAccountName}</p>
                  <p className="font-mono font-semibold tabular-nums break-all">
                    Number: {order.sellerPaymentSettings.momoNumber}
                  </p>
                  {order.sellerPaymentSettings.momoInstructions && (
                    <p className="text-slate-600 pt-1 break-words">
                      {order.sellerPaymentSettings.momoInstructions}
                    </p>
                  )}
                </div>
              )}

              {order.sellerPaymentSettings?.bankEnabled && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 min-w-0 break-words">
                  <p className="font-bold text-[#0B1F3A]">
                    Bank Transfer ({order.sellerPaymentSettings.bankName})
                  </p>
                  <p>Account Name: {order.sellerPaymentSettings.bankAccountName}</p>
                  <p className="font-mono font-semibold tabular-nums break-all">
                    Account No: {order.sellerPaymentSettings.bankAccountNumber}
                  </p>
                  {order.sellerPaymentSettings.bankBranch && (
                    <p>Branch: {order.sellerPaymentSettings.bankBranch}</p>
                  )}
                  {order.sellerPaymentSettings.bankInstructions && (
                    <p className="text-slate-600 pt-1 break-words">
                      {order.sellerPaymentSettings.bankInstructions}
                    </p>
                  )}
                </div>
              )}

              {!order.sellerPaymentSettings?.momoEnabled && !order.sellerPaymentSettings?.bankEnabled && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  This seller has not configured Mobile Money or Bank Transfer details yet. Please contact the seller before sending payment.
                </p>
              )}
            </div>

            {order.payment?.sellerNotes && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <strong>Seller Payment Note:</strong> {order.payment.sellerNotes}
              </div>
            )}

            {reportMsg && (
              <p className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {reportMsg}
              </p>
            )}

            {order.payment?.status !== 'Payment Confirmed' && order.orderStatus !== 'Cancelled' && (
              <div className="pt-1">
                {!showReportForm ? (
                  <button
                    type="button"
                    onClick={() => openReportModal(order)}
                    className="w-full min-h-[42px] px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
                  >
                    I Have Made Payment
                  </button>
                ) : (
                  <form
                    onSubmit={handleSubmitPaymentReport}
                    className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-3"
                  >
                    <h3 className="text-xs font-bold text-[#0B1F3A]">
                      Report Manual Payment (Awaiting Seller Verification)
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Payment Method Used *
                        </label>
                        <select
                          value={reportMethod}
                          onChange={(e) => setReportMethod(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                        >
                          {order.sellerPaymentSettings?.momoEnabled && (
                            <option value={`Mobile Money (${order.sellerPaymentSettings.momoProvider})`}>
                              Mobile Money ({order.sellerPaymentSettings.momoProvider})
                            </option>
                          )}
                          {order.sellerPaymentSettings?.bankEnabled && (
                            <option value={`Bank Transfer (${order.sellerPaymentSettings.bankName})`}>
                              Bank Transfer ({order.sellerPaymentSettings.bankName})
                            </option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Amount Paid (GHS) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={reportAmount}
                          onChange={(e) => setReportAmount(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Transaction Reference / ID
                        </label>
                        <input
                          type="text"
                          value={reportTxRef}
                          onChange={(e) => setReportTxRef(e.target.value)}
                          placeholder="MoMo / Bank Transaction ID"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Date &amp; Time Paid
                        </label>
                        <input
                          type="datetime-local"
                          value={reportPaidAt}
                          onChange={(e) => setReportPaidAt(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Additional Notes
                        </label>
                        <input
                          type="text"
                          value={reportNotes}
                          onChange={(e) => setReportNotes(e.target.value)}
                          placeholder="Sender name or number used..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                        />
                      </div>
                    </div>
                    {reportErr && <p className="text-xs text-red-600">{reportErr}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={submittingReport}
                        className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {submittingReport ? 'Submitting...' : 'Submit Payment Report'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReportForm(false)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Refund Status & Buyer Order Actions */}
          {(order.payment?.status === 'Refund Pending' ||
            order.payment?.status === 'Refunded' ||
            canCancel ||
            canRequestRefund ||
            orderActionMsg ||
            orderActionErr) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">Order Actions &amp; Refunds</h2>

              {order.payment?.status === 'Refund Pending' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950">
                  <strong>Refund Pending:</strong> The seller has been notified of your refund request and will return funds directly to your account.
                </div>
              )}
              {order.payment?.status === 'Refunded' && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950">
                  <strong>Refunded:</strong> The seller marked your refund completed.
                </div>
              )}

              {(canCancel || canRequestRefund) && (
                <div className="flex flex-wrap gap-2">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCancelForm((v) => !v);
                        setShowRefundForm(false);
                        setOrderActionErr('');
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel Order</span>
                    </button>
                  )}
                  {canRequestRefund && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowRefundForm((v) => !v);
                        setShowCancelForm(false);
                        setOrderActionErr('');
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg border border-amber-400 bg-white hover:bg-amber-50 text-amber-900 text-xs font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Refund</span>
                    </button>
                  )}
                </div>
              )}

              {orderActionMsg && <p className="text-xs text-emerald-700 font-medium">{orderActionMsg}</p>}
              {orderActionErr && <p className="text-xs text-red-700 font-medium">{orderActionErr}</p>}

              {showCancelForm && canCancel && (
                <form
                  onSubmit={handleCancelOrder}
                  className="bg-slate-50 border border-red-200 rounded-lg p-3.5 space-y-3"
                >
                  <p className="text-xs font-bold text-red-800">Cancel Order {order.orderReference}</p>
                  <p className="text-[11px] text-slate-600">
                    {canRequestRefund
                      ? 'Because you already reported or made payment, cancelling will also set your payment to Refund Pending and notify the seller.'
                      : 'Cancelling restores item stock automatically and notifies the seller.'}
                  </p>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (optional)..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={cancellingOrder}
                      className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold"
                    >
                      {cancellingOrder ? 'Cancelling...' : 'Confirm Cancel Order'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(false)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                    >
                      Keep Order
                    </button>
                  </div>
                </form>
              )}

              {showRefundForm && canRequestRefund && (
                <form
                  onSubmit={handleRequestRefund}
                  className="bg-slate-50 border border-amber-300 rounded-lg p-3.5 space-y-3"
                >
                  <p className="text-xs font-bold text-[#0B1F3A]">
                    Request Manual Refund from {order.sellerBusinessName}
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reason for Refund *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. Changed my mind, wrong size, item delayed..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Your MoMo Number or Bank Details for Refund (Recommended)
                    </label>
                    <input
                      type="text"
                      value={refundDetails}
                      onChange={(e) => setRefundDetails(e.target.value)}
                      placeholder="e.g. MTN MoMo 0240000000 (Name)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={requestingRefund}
                      className="px-3.5 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white text-xs font-semibold"
                    >
                      {requestingRefund ? 'Submitting...' : 'Submit Refund Request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRefundForm(false)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                    >
                      Close
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
