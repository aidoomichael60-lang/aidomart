import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  MessageSquareWarning,
  Package,
  Settings,
  Star,
  Tag,
  Volume2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import type { Complaint, Order } from '../types/marketplace';
import { PromoManagerPanel } from '../components/PromoManagerPanel';
import { VerifiedBadge } from '../components/VerifiedBadge';

interface BuyerDashboardProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

type BuyerTab = 'orders' | 'reviews' | 'promos' | 'complaints' | 'profile';

export function BuyerDashboard({ initialQuery, onNavigate }: BuyerDashboardProps) {
  const { user, refreshUser, settings } = useAuth();
  const { testNotificationSound } = useNotifications();
  const [tab, setTab] = useState<BuyerTab>('orders');

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(() => {
    const q = initialQuery?.get('order');
    return q ? Number(q) : null;
  });
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Payment report form
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMethod, setReportMethod] = useState('');
  const [reportAmount, setReportAmount] = useState('');
  const [reportTxRef, setReportTxRef] = useState('');
  const [reportPaidAt, setReportPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [reportNotes, setReportNotes] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [reportErr, setReportErr] = useState('');
  const [copiedRef, setCopiedRef] = useState('');

  // Reviews
  const [eligibleReviews, setEligibleReviews] = useState<any[]>([]);
  const [submittedReviews, setSubmittedReviews] = useState<any[]>([]);
  const [reviewFormTarget, setReviewFormTarget] = useState<{ orderId: number; productId: number; title: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Complaints
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [compOrderId, setCompOrderId] = useState('');
  const [compSubject, setCompSubject] = useState('');
  const [compMessage, setCompMessage] = useState('');
  const [compFeedback, setCompFeedback] = useState('');

  // Profile & Preferences
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [soundEnabled, setSoundEnabled] = useState(user?.soundEnabled ?? true);
  const [login2faEnabled, setLogin2faEnabled] = useState(user?.login2faEnabled ?? true);
  const [prefMsg, setPrefMsg] = useState('');
  const [soundTestMsg, setSoundTestMsg] = useState('');

  const loadBuyerData = async () => {
    setLoadingOrders(true);
    try {
      const [ordRes, revRes, compRes] = await Promise.all([
        apiRequest<{ orders: Order[] }>('/api/buyer/orders'),
        apiRequest<{ eligible: any[]; submitted: any[] }>('/api/buyer/reviews/eligible'),
        apiRequest<{ complaints: Complaint[] }>('/api/buyer/complaints'),
      ]);
      const list = ordRes.orders || [];
      setOrders(list);
      if (list.length > 0 && !selectedOrderId) {
        setSelectedOrderId(list[0].id);
      }
      setEligibleReviews(revRes.eligible || []);
      setSubmittedReviews(revRes.submitted || []);
      setComplaints(compRes.complaints || []);
    } catch {
      // ignore
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'buyer') {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setSoundEnabled(user.soundEnabled);
      setLogin2faEnabled(user.login2faEnabled);
      loadBuyerData();
    }
  }, [user?.id, user?.role]);

  if (!user || user.role !== 'buyer') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Buyer Dashboard</h1>
        <p className="text-sm text-slate-600">Please sign in with a Buyer account to view your orders, payment instructions, and reviews.</p>
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

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  const openReportModal = (order: Order) => {
    const methods: string[] = [];
    if (order.sellerPaymentSettings?.momoEnabled) {
      methods.push(`Mobile Money (${order.sellerPaymentSettings.momoProvider})`);
    }
    if (order.sellerPaymentSettings?.bankEnabled) {
      methods.push(`Bank Transfer (${order.sellerPaymentSettings.bankName})`);
    }
    setReportMethod(methods[0] || 'Mobile Money');
    setReportAmount(order.totalAmount.toFixed(2));
    setReportTxRef('');
    setReportNotes('');
    setReportMsg('');
    setReportErr('');
    setShowReportForm(true);
  };

  const handleSubmitPaymentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setReportMsg('');
    setReportErr('');
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/buyer/orders/${selectedOrder.id}/report-payment`,
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
      await loadBuyerData();
    } catch (err: any) {
      setReportErr(err.message || 'Could not report payment.');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewFormTarget) return;
    await apiRequest('/api/buyer/reviews', {
      method: 'POST',
      body: {
        orderId: reviewFormTarget.orderId,
        productId: reviewFormTarget.productId,
        rating: reviewRating,
        comment: reviewComment,
      },
    });
    setReviewFormTarget(null);
    setReviewComment('');
    await loadBuyerData();
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompFeedback('');
    const res = await apiRequest<{ message: string }>('/api/buyer/complaints', {
      method: 'POST',
      body: {
        orderId: compOrderId ? Number(compOrderId) : null,
        subject: compSubject,
        message: compMessage,
      },
    });
    setCompFeedback(res.message);
    setCompSubject('');
    setCompMessage('');
    await loadBuyerData();
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefMsg('');
    const res = await apiRequest<{ message: string }>('/api/auth/preferences', {
      method: 'PATCH',
      body: { fullName, phone, soundEnabled, login2faEnabled },
    });
    setPrefMsg(res.message);
    await refreshUser();
  };

  const tabs: Array<{ id: BuyerTab; label: string; icon: React.ReactNode }> = [
    { id: 'orders', label: 'Orders & Manual Payments', icon: <Package className="w-4 h-4" /> },
    { id: 'reviews', label: 'Product Reviews', icon: <Star className="w-4 h-4" /> },
    ...(settings.promoCreatorPolicy === 'buyer' || settings.promoCreatorPolicy === 'both'
      ? [{ id: 'promos' as BuyerTab, label: 'Promotional Codes', icon: <Tag className="w-4 h-4" /> }]
      : []),
    { id: 'complaints', label: 'Complaints & Feedback', icon: <MessageSquareWarning className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile & Sound Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Buyer Dashboard</h1>
          <p className="text-sm text-slate-600">
            Welcome back, {user.fullName} · {user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
        >
          Continue Shopping
        </button>
      </div>

      {/* Horizontal Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ORDERS & MANUAL PAYMENTS */}
      {tab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50">
              <h2 className="font-display text-sm font-bold text-[#0B1F3A]">
                Your Orders ({orders.length})
              </h2>
            </div>
            {loadingOrders ? (
              <div className="p-6 text-sm text-slate-500">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-600">You have not placed any orders yet.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('/shop')}
                  className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
                >
                  Browse Shop
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
                {orders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setShowReportForm(false);
                    }}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors space-y-1.5 ${
                      selectedOrder?.id === ord.id ? 'bg-orange-50/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {ord.orderReference}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#F97316] tabular-nums">
                        GHS {ord.totalAmount.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-700">{ord.sellerBusinessName}</p>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                      <span>Order: {ord.orderStatus}</span>
                      <span>·</span>
                      <span>Payment: {ord.payment?.status || 'Not Reported'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            {selectedOrder ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-mono text-lg font-bold text-[#0B1F3A]">
                        {selectedOrder.orderReference}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(selectedOrder.orderReference);
                          setCopiedRef(selectedOrder.orderReference);
                          setTimeout(() => setCopiedRef(''), 2000);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50"
                      >
                        <ClipboardCopy className="w-3 h-3" />
                        <span>{copiedRef === selectedOrder.orderReference ? 'Copied' : 'Copy Ref'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Placed {new Date(selectedOrder.createdAt).toLocaleString()} ·{' '}
                      {selectedOrder.fulfillmentMethod}
                      {selectedOrder.deliveryAddress ? ` · ${selectedOrder.deliveryAddress}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => onNavigate(`/seller/${selectedOrder.sellerId}`)}
                      className="text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                    >
                      {selectedOrder.sellerBusinessName}
                    </button>
                    {selectedOrder.sellerVerifiedBadge && (
                      <div className="mt-1">
                        <VerifiedBadge />
                      </div>
                    )}
                  </div>
                </div>

                {/* Separate Order Status & Payment Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Order Status</p>
                    <p className="text-sm font-bold text-[#0B1F3A] mt-0.5">
                      {selectedOrder.orderStatus}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Manual Payment Status</p>
                    <p className="text-sm font-bold text-[#F97316] mt-0.5">
                      {selectedOrder.payment?.status || 'Not Reported'}
                    </p>
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">Order Items</h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{item.productTitle}</span>
                          {item.selectedVariation && (
                            <span className="text-slate-500"> ({item.selectedVariation})</span>
                          )}
                          <span className="text-slate-500"> × {item.quantity}</span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums">
                          GHS {item.lineTotal.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#0B1F3A] pt-2">
                    <span>Exact Amount Payable</span>
                    <span className="font-mono tabular-nums">
                      GHS {selectedOrder.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Manual Seller Payment Instructions */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#F97316]" />
                    <h3 className="font-display text-sm font-bold text-[#0B1F3A]">
                      Direct Manual Payment Instructions
                    </h3>
                  </div>
                  <p className="text-xs text-slate-700">
                    Pay <strong>GHS {selectedOrder.totalAmount.toFixed(2)}</strong> directly to{' '}
                    <strong>{selectedOrder.sellerBusinessName}</strong> using one of their configured methods below. Always enter{' '}
                    <strong className="font-mono">{selectedOrder.orderReference}</strong> as your payment reference/narration.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedOrder.sellerPaymentSettings?.momoEnabled && (
                      <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                        <p className="font-bold text-[#0B1F3A]">
                          Mobile Money ({selectedOrder.sellerPaymentSettings.momoProvider})
                        </p>
                        <p>Account Name: {selectedOrder.sellerPaymentSettings.momoAccountName}</p>
                        <p className="font-mono font-semibold tabular-nums">
                          Number: {selectedOrder.sellerPaymentSettings.momoNumber}
                        </p>
                        {selectedOrder.sellerPaymentSettings.momoInstructions && (
                          <p className="text-slate-600 pt-1">
                            {selectedOrder.sellerPaymentSettings.momoInstructions}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedOrder.sellerPaymentSettings?.bankEnabled && (
                      <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                        <p className="font-bold text-[#0B1F3A]">
                          Bank Transfer ({selectedOrder.sellerPaymentSettings.bankName})
                        </p>
                        <p>Account Name: {selectedOrder.sellerPaymentSettings.bankAccountName}</p>
                        <p className="font-mono font-semibold tabular-nums">
                          Account No: {selectedOrder.sellerPaymentSettings.bankAccountNumber}
                        </p>
                        {selectedOrder.sellerPaymentSettings.bankBranch && (
                          <p>Branch: {selectedOrder.sellerPaymentSettings.bankBranch}</p>
                        )}
                        {selectedOrder.sellerPaymentSettings.bankInstructions && (
                          <p className="text-slate-600 pt-1">
                            {selectedOrder.sellerPaymentSettings.bankInstructions}
                          </p>
                        )}
                      </div>
                    )}

                    {!selectedOrder.sellerPaymentSettings?.momoEnabled &&
                      !selectedOrder.sellerPaymentSettings?.bankEnabled && (
                        <p className="text-xs text-amber-700 col-span-2">
                          This seller has not configured Mobile Money or Bank Transfer details yet. Please contact the seller or administrator before sending payment.
                        </p>
                      )}
                  </div>

                  {selectedOrder.payment?.status !== 'Payment Confirmed' &&
                    selectedOrder.orderStatus !== 'Cancelled' && (
                      <div className="pt-2">
                        {!showReportForm ? (
                          <button
                            type="button"
                            onClick={() => openReportModal(selectedOrder)}
                            className="px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
                          >
                            I Have Made Payment
                          </button>
                        ) : (
                          <form
                            onSubmit={handleSubmitPaymentReport}
                            className="bg-white border border-slate-300 rounded-lg p-4 space-y-3 mt-2"
                          >
                            <h4 className="text-xs font-bold text-[#0B1F3A]">
                              Report Manual Payment (Awaiting Seller Verification)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Payment Method Used *
                                </label>
                                <select
                                  value={reportMethod}
                                  onChange={(e) => setReportMethod(e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                >
                                  {selectedOrder.sellerPaymentSettings?.momoEnabled && (
                                    <option
                                      value={`Mobile Money (${selectedOrder.sellerPaymentSettings.momoProvider})`}
                                    >
                                      Mobile Money ({selectedOrder.sellerPaymentSettings.momoProvider})
                                    </option>
                                  )}
                                  {selectedOrder.sellerPaymentSettings?.bankEnabled && (
                                    <option
                                      value={`Bank Transfer (${selectedOrder.sellerPaymentSettings.bankName})`}
                                    >
                                      Bank Transfer ({selectedOrder.sellerPaymentSettings.bankName})
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
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
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
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Date & Time Paid
                                </label>
                                <input
                                  type="datetime-local"
                                  value={reportPaidAt}
                                  onChange={(e) => setReportPaidAt(e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                />
                              </div>
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
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            {reportErr && <p className="text-xs text-red-600">{reportErr}</p>}
                            {reportMsg && <p className="text-xs text-emerald-700">{reportMsg}</p>}
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
                              >
                                Submit Payment Report
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowReportForm(false)}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                </div>

                {/* Payment History Log */}
                {selectedOrder.payment?.history?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500">Payment History</h3>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                      {selectedOrder.payment.history.map((h) => (
                        <div key={h.id} className="px-3.5 py-2.5 flex justify-between gap-3">
                          <div>
                            <span className="font-semibold text-[#0B1F3A]">{h.action}</span>
                            {h.notes && <p className="text-slate-600 mt-0.5">{h.notes}</p>}
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
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                Select an order on the left to view payment instructions and status details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEWS */}
      {tab === 'reviews' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Products Eligible for Verified Review ({eligibleReviews.length})
            </h2>
            <p className="text-xs text-slate-600">
              Reviews can only be submitted after an order reaches <strong>Completed</strong> status.
            </p>
            {eligibleReviews.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                No completed purchases awaiting review right now.
              </p>
            ) : (
              <div className="space-y-3">
                {eligibleReviews.map((item) => (
                  <div
                    key={`${item.orderId}-${item.productId}`}
                    className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{item.productTitle}</p>
                      <p className="text-xs font-mono text-slate-500">{item.orderReference}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setReviewFormTarget({
                          orderId: item.orderId,
                          productId: item.productId,
                          title: item.productTitle,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#F97316] text-white text-xs font-semibold"
                    >
                      Write Review
                    </button>
                  </div>
                ))}
              </div>
            )}

            {reviewFormTarget && (
              <form onSubmit={handleReviewSubmit} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <h3 className="text-xs font-bold text-[#0B1F3A]">
                  Reviewing: {reviewFormTarget.title}
                </h3>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs bg-white"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} Stars
                    </option>
                  ))}
                </select>
                <textarea
                  required
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Describe product quality and delivery experience..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
                  >
                    Publish Verified Review
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFormTarget(null)}
                    className="px-3 py-2 text-xs text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Your Submitted Reviews ({submittedReviews.length})
            </h2>
            {submittedReviews.length === 0 ? (
              <p className="text-sm text-slate-500">You have not submitted any product reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {submittedReviews.map((rev) => (
                  <div key={rev.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold text-[#0B1F3A]">{rev.productTitle}</span>
                      <span className="text-xs font-bold text-[#F97316]">{rev.rating}/5</span>
                    </div>
                    <p className="text-xs text-slate-700">{rev.comment}</p>
                    {rev.sellerResponse && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-1">
                        <strong>Seller Reply:</strong> {rev.sellerResponse}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROMOS */}
      {tab === 'promos' && <PromoManagerPanel />}

      {/* COMPLAINTS */}
      {tab === 'complaints' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleComplaintSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Submit Complaint or Marketplace Feedback
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Related Order (Optional)
              </label>
              <select
                value={compOrderId}
                onChange={(e) => setCompOrderId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value="">General Marketplace Feedback</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderReference} — {o.sellerBusinessName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
              <input
                type="text"
                required
                value={compSubject}
                onChange={(e) => setCompSubject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Details *</label>
              <textarea
                rows={4}
                required
                value={compMessage}
                onChange={(e) => setCompMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            {compFeedback && <p className="text-xs text-emerald-700">{compFeedback}</p>}
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Submit Complaint / Feedback
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Your Submitted Cases ({complaints.length})
            </h2>
            {complaints.length === 0 ? (
              <p className="text-sm text-slate-500">No complaints or feedback records.</p>
            ) : (
              <div className="space-y-3">
                {complaints.map((c) => (
                  <div key={c.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-[#0B1F3A]">{c.subject}</span>
                      <span className="font-semibold text-[#F97316]">{c.status}</span>
                    </div>
                    <p className="text-slate-700">{c.message}</p>
                    {c.sellerResponse && (
                      <p className="bg-slate-50 p-2 rounded text-slate-700">
                        <strong>Seller Response:</strong> {c.sellerResponse}
                      </p>
                    )}
                    {c.adminNotes && (
                      <p className="bg-orange-50 p-2 rounded text-slate-800">
                        <strong>Admin Resolution:</strong> {c.adminNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROFILE & NOTIFICATION SOUND */}
      {tab === 'profile' && (
        <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            Account Profile & Notification Sound Preferences
          </h2>

          <form onSubmit={handleSavePreferences} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telephone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Play AIDOMART notification sound (static/notification.mp3) for new alerts</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={login2faEnabled}
                onChange={(e) => setLogin2faEnabled(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Require email verification code on login</span>
            </label>

            {prefMsg && (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{prefMsg}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
              >
                Save Preferences
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await testNotificationSound();
                  setSoundTestMsg(res.message);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Volume2 className="w-4 h-4 text-[#F97316]" />
                <span>Test Notification Sound</span>
              </button>
            </div>
            {soundTestMsg && <p className="text-xs text-slate-600">{soundTestMsg}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
