import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Package,
  Phone,
  Send,
  Settings,
  Star,
  Tag,
  Truck,
  Volume2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import type { BuyerConversation, Complaint, Order } from '../types/marketplace';
import { PromoManagerPanel } from '../components/PromoManagerPanel';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';
import { useLoginGreeting } from '../utils/greeting';

interface BuyerDashboardProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

type BuyerTab = 'orders' | 'messages' | 'reviews' | 'promos' | 'complaints' | 'profile';

export function BuyerDashboard({ initialQuery, onNavigate }: BuyerDashboardProps) {
  const { user, refreshUser, settings } = useAuth();
  const { greeting } = useLoginGreeting(user);
  const { testNotificationSound } = useNotifications();
  const [tab, setTab] = useState<BuyerTab>(() => {
    const qTab = initialQuery?.get('tab');
    if (
      qTab === 'messages' ||
      qTab === 'reviews' ||
      qTab === 'promos' ||
      qTab === 'complaints' ||
      qTab === 'profile'
    ) {
      return qTab;
    }
    return 'orders';
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(() => {
    const q = initialQuery?.get('order');
    return q ? Number(q) : null;
  });
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Buyer <-> Seller Messages
  const [conversations, setConversations] = useState<BuyerConversation[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(() => {
    const q = initialQuery?.get('sellerId');
    return q ? Number(q) : null;
  });
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatErr, setChatErr] = useState('');

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

  const loadMessages = async (focusSellerId?: number | null) => {
    setLoadingMessages(true);
    try {
      const qs = focusSellerId ? `?sellerId=${focusSellerId}` : '';
      const res = await apiRequest<{ conversations: BuyerConversation[] }>(`/api/buyer/messages${qs}`);
      const list = res.conversations || [];
      setConversations(list);
      const targetId = focusSellerId ?? selectedSellerId;
      if (targetId && list.some((c) => c.sellerId === targetId)) {
        setSelectedSellerId(targetId);
      } else if (list.length > 0 && !targetId) {
        setSelectedSellerId(list[0].sellerId);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    const qTab = initialQuery?.get('tab');
    const qOrder = initialQuery?.get('order');
    const qSeller = initialQuery?.get('sellerId');
    if (
      qTab === 'orders' ||
      qTab === 'messages' ||
      qTab === 'reviews' ||
      qTab === 'promos' ||
      qTab === 'complaints' ||
      qTab === 'profile'
    ) {
      setTab(qTab);
    }
    if (qOrder) {
      setSelectedOrderId(Number(qOrder));
    }
    if (qSeller) {
      const sid = Number(qSeller);
      setSelectedSellerId(sid);
      if (user?.role === 'buyer') {
        loadMessages(sid);
      }
    }
  }, [initialQuery?.toString()]);

  useEffect(() => {
    if (user?.role === 'buyer') {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setSoundEnabled(user.soundEnabled);
      setLogin2faEnabled(user.login2faEnabled);
      loadBuyerData();
      const qSeller = initialQuery?.get('sellerId');
      loadMessages(qSeller ? Number(qSeller) : null);
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

  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const activeConversation =
    conversations.find((c) => c.sellerId === selectedSellerId) || conversations[0] || null;

  const handleOpenChatWithSeller = async (sellerId: number) => {
    setTab('messages');
    setSelectedSellerId(sellerId);
    await loadMessages(sellerId);
    apiRequest(`/api/buyer/messages/${sellerId}/read`, { method: 'POST' }).catch(() => {});
  };

  const handleSelectConversation = async (sellerId: number) => {
    setSelectedSellerId(sellerId);
    setChatErr('');
    const conv = conversations.find((c) => c.sellerId === sellerId);
    if (conv && conv.unreadCount > 0) {
      await apiRequest(`/api/buyer/messages/${sellerId}/read`, { method: 'POST' }).catch(() => {});
      await loadMessages(sellerId);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !chatDraft.trim()) return;
    setChatSending(true);
    setChatErr('');
    try {
      await apiRequest('/api/buyer/messages', {
        method: 'POST',
        body: {
          sellerId: activeConversation.sellerId,
          message: chatDraft.trim(),
        },
      });
      setChatDraft('');
      await loadMessages(activeConversation.sellerId);
    } catch (err: any) {
      setChatErr(err.message || 'Could not send message.');
    } finally {
      setChatSending(false);
    }
  };

  const tabs: Array<{ id: BuyerTab; label: string; icon: React.ReactNode }> = [
    { id: 'orders', label: 'Orders & Payments', icon: <Package className="w-4 h-4" /> },
    {
      id: 'messages',
      label: totalUnreadMessages > 0 ? `Messages (${totalUnreadMessages})` : 'Messages',
      icon: <MessageSquare className="w-4 h-4" />,
    },
    { id: 'reviews', label: 'Product Reviews', icon: <Star className="w-4 h-4" /> },
    ...(settings.promoCreatorPolicy === 'buyer' || settings.promoCreatorPolicy === 'both'
      ? [{ id: 'promos' as BuyerTab, label: 'Promotional Codes', icon: <Tag className="w-4 h-4" /> }]
      : []),
    { id: 'complaints', label: 'Complaints & Feedback', icon: <MessageSquareWarning className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile & Sound', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B1F3A]">Buyer Dashboard</h1>
          <p className="text-sm font-semibold text-[#F97316] mt-0.5">{greeting}</p>
          <p className="text-xs text-slate-600">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('/track-order')}
            className="px-3.5 py-2 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-xs font-semibold whitespace-nowrap transition-colors"
          >
            Track Order by Code
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/shop')}
            className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold whitespace-nowrap"
          >
            Continue Shopping
          </button>
        </div>
      </div>

      {/* Horizontal Tab Bar */}
      <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
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
          <div className="lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
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
              <div className="divide-y divide-slate-100 max-h-[300px] lg:max-h-[620px] overflow-y-auto">
                {orders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setShowReportForm(false);
                    }}
                    className={`w-full text-left p-3.5 sm:p-4 hover:bg-slate-50 transition-colors space-y-1.5 ${
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

          <div className="lg:col-span-7 min-w-0">
            {selectedOrder ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-lg font-bold text-[#0B1F3A] break-all">
                        {selectedOrder.orderReference}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(selectedOrder.orderReference);
                          setCopiedRef(selectedOrder.orderReference);
                          setTimeout(() => setCopiedRef(''), 2000);
                        }}
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50"
                      >
                        <ClipboardCopy className="w-3 h-3" />
                        <span>{copiedRef === selectedOrder.orderReference ? 'Copied' : 'Copy Code'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate(`/track-order?code=${encodeURIComponent(selectedOrder.orderReference)}`)
                        }
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded bg-[#F97316] hover:bg-[#EA580C] text-white text-[11px] font-semibold"
                      >
                        <Truck className="w-3 h-3" />
                        <span>Track Order</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      Placed {new Date(selectedOrder.createdAt).toLocaleString()} ·{' '}
                      {selectedOrder.fulfillmentMethod}
                      {selectedOrder.deliveryAddress ? ` · ${selectedOrder.deliveryAddress}` : ''}
                    </p>
                  </div>

                  <div className="sm:text-right space-y-1.5 min-w-0">
                    <div>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/seller/${selectedOrder.sellerId}`)}
                        className="text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316] break-words text-left sm:text-right"
                      >
                        {selectedOrder.sellerBusinessName}
                      </button>
                      {selectedOrder.sellerVerifiedBadge && (
                        <div className="mt-1">
                          <VerifiedBadge />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap sm:justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenChatWithSeller(selectedOrder.sellerId)}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded bg-[#0B1F3A] hover:bg-[#122E53] text-white text-[11px] font-semibold"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Message Seller</span>
                      </button>
                      {buildWhatsAppUrl(
                        selectedOrder.sellerPhone,
                        `Hello ${selectedOrder.sellerBusinessName}, following up on AIDOMART order ${selectedOrder.orderReference}.`
                      ) && (
                        <a
                          href={
                            buildWhatsAppUrl(
                              selectedOrder.sellerPhone,
                              `Hello ${selectedOrder.sellerBusinessName}, following up on AIDOMART order ${selectedOrder.orderReference}.`
                            )!
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[11px] font-semibold"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Separate Order Status, Tracking Stage & Payment Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Order Status</p>
                    <p className="text-xs sm:text-sm font-bold text-[#0B1F3A] mt-0.5">
                      {selectedOrder.orderStatus}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Delivery Tracking</p>
                    <p className="text-xs sm:text-sm font-bold text-[#0B1F3A] mt-0.5">
                      {selectedOrder.trackingStage || 'Order Placed'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Manual Payment</p>
                    <p className="text-xs sm:text-sm font-bold text-[#F97316] mt-0.5">
                      {selectedOrder.payment?.status || 'Not Reported'}
                    </p>
                  </div>
                </div>

                {/* Live Seller Tracking Details & History */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-[#F97316]" />
                      <span>Seller Tracking & Delivery Progress</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(`/track-order?code=${encodeURIComponent(selectedOrder.orderReference)}`)
                      }
                      className="text-xs font-semibold text-[#F97316] hover:underline"
                    >
                      Open Full Tracker →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                    {selectedOrder.trackingLocation && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                        <span>Location: {selectedOrder.trackingLocation}</span>
                      </p>
                    )}
                    {selectedOrder.estimatedDelivery && (
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                        <span>ETA: {selectedOrder.estimatedDelivery}</span>
                      </p>
                    )}
                    {selectedOrder.courierContact && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                        <span>Rider / Courier: {selectedOrder.courierContact}</span>
                      </p>
                    )}
                    {selectedOrder.trackingNote && (
                      <p className="sm:col-span-2 text-slate-600">{selectedOrder.trackingNote}</p>
                    )}
                  </div>

                  {selectedOrder.trackingEvents && selectedOrder.trackingEvents.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {selectedOrder.trackingEvents.slice(0, 4).map((ev) => (
                        <div key={ev.id} className="px-3 py-2 flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1 break-words">
                            <span className="font-semibold text-[#0B1F3A]">
                              {ev.stage}
                              {ev.location ? ` · ${ev.location}` : ''}
                            </span>
                            {ev.note && <p className="text-slate-600 mt-0.5 break-words">{ev.note}</p>}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                            {new Date(ev.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Order Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">Order Items</h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs min-w-0">
                        <div className="min-w-0 flex-1 break-words">
                          <span className="font-semibold text-slate-900">{item.productTitle}</span>
                          {item.selectedVariation && (
                            <span className="text-slate-500"> ({item.selectedVariation})</span>
                          )}
                          <span className="text-slate-500"> × {item.quantity}</span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums shrink-0 whitespace-nowrap">
                          GHS {item.lineTotal.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between gap-2 text-sm font-bold text-[#0B1F3A] pt-2">
                    <span>Exact Amount Payable</span>
                    <span className="font-mono tabular-nums shrink-0 whitespace-nowrap">
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
                      <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1 min-w-0 break-words">
                        <p className="font-bold text-[#0B1F3A]">
                          Mobile Money ({selectedOrder.sellerPaymentSettings.momoProvider})
                        </p>
                        <p>Account Name: {selectedOrder.sellerPaymentSettings.momoAccountName}</p>
                        <p className="font-mono font-semibold tabular-nums break-all">
                          Number: {selectedOrder.sellerPaymentSettings.momoNumber}
                        </p>
                        {selectedOrder.sellerPaymentSettings.momoInstructions && (
                          <p className="text-slate-600 pt-1 break-words">
                            {selectedOrder.sellerPaymentSettings.momoInstructions}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedOrder.sellerPaymentSettings?.bankEnabled && (
                      <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1 min-w-0 break-words">
                        <p className="font-bold text-[#0B1F3A]">
                          Bank Transfer ({selectedOrder.sellerPaymentSettings.bankName})
                        </p>
                        <p>Account Name: {selectedOrder.sellerPaymentSettings.bankAccountName}</p>
                        <p className="font-mono font-semibold tabular-nums break-all">
                          Account No: {selectedOrder.sellerPaymentSettings.bankAccountNumber}
                        </p>
                        {selectedOrder.sellerPaymentSettings.bankBranch && (
                          <p>Branch: {selectedOrder.sellerPaymentSettings.bankBranch}</p>
                        )}
                        {selectedOrder.sellerPaymentSettings.bankInstructions && (
                          <p className="text-slate-600 pt-1 break-words">
                            {selectedOrder.sellerPaymentSettings.bankInstructions}
                          </p>
                        )}
                      </div>
                    )}

                    {!selectedOrder.sellerPaymentSettings?.momoEnabled &&
                      !selectedOrder.sellerPaymentSettings?.bankEnabled && (
                        <p className="text-xs text-amber-700 col-span-full">
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
                            className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
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
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                Select an order on the left to view payment instructions and status details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MESSAGES WITH SELLERS */}
      {tab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50">
              <h2 className="font-display text-sm font-bold text-[#0B1F3A]">
                Seller Conversations ({conversations.length})
              </h2>
            </div>
            {loadingMessages ? (
              <div className="p-6 text-xs text-slate-500">Loading messages...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-slate-600">
                  No seller conversations yet. Open any product or seller storefront and click{' '}
                  <strong>Message Seller</strong> to start chatting.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('/shop')}
                  className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
                >
                  Browse Shop
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {conversations.map((conv) => (
                  <button
                    key={conv.sellerId}
                    type="button"
                    onClick={() => handleSelectConversation(conv.sellerId)}
                    className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                      activeConversation?.sellerId === conv.sellerId ? 'bg-orange-50/70' : ''
                    }`}
                  >
                    {conv.storefrontImage ? (
                      <SafeAssetImage
                        src={conv.storefrontImage}
                        alt={conv.sellerBusinessName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {conv.sellerBusinessName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#0B1F3A] truncate">
                          {conv.sellerBusinessName}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#F97316] text-white text-[10px] font-bold tabular-nums">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {conv.lastMessage || 'Start your conversation'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            {activeConversation ? (
              <>
                <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(`/seller/${activeConversation.sellerId}`)}
                      className="font-display text-sm font-bold text-[#0B1F3A] hover:text-[#F97316]"
                    >
                      {activeConversation.sellerBusinessName}
                    </button>
                    {activeConversation.sellerVerifiedBadge && <VerifiedBadge />}
                  </div>
                  {buildWhatsAppUrl(
                    activeConversation.sellerPhone,
                    `Hello ${activeConversation.sellerBusinessName}, messaging from AIDOMART.`
                  ) && (
                    <a
                      href={
                        buildWhatsAppUrl(
                          activeConversation.sellerPhone,
                          `Hello ${activeConversation.sellerBusinessName}, messaging from AIDOMART.`
                        )!
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
                    >
                      <WhatsAppIcon className="w-4 h-4 shrink-0" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>

                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto bg-slate-50/50">
                  {activeConversation.messages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      Send a message below to start chatting with {activeConversation.sellerBusinessName}.
                    </p>
                  ) : (
                    activeConversation.messages.map((m) => {
                      const isMine = m.senderId === user.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs space-y-1 ${
                              isMine
                                ? 'bg-[#0B1F3A] text-white'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            {m.productTitle && (
                              <p
                                className={`text-[10px] font-semibold ${
                                  isMine ? 'text-orange-300' : 'text-[#F97316]'
                                }`}
                              >
                                Product: {m.productTitle}
                              </p>
                            )}
                            {m.orderReference && (
                              <p
                                className={`text-[10px] font-mono ${
                                  isMine ? 'text-orange-300' : 'text-[#F97316]'
                                }`}
                              >
                                Order: {m.orderReference}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{m.message}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 px-1 tabular-nums">
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="p-3 sm:p-4 border-t border-slate-200 bg-white space-y-2"
                >
                  {chatErr && <p className="text-xs text-red-600">{chatErr}</p>}
                  <div className="flex gap-2 min-w-0">
                    <input
                      type="text"
                      required
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      placeholder={`Message ${activeConversation.sellerBusinessName}...`}
                      className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-lg text-base sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={chatSending}
                      className="shrink-0 inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-slate-500">
                Select a seller conversation to read and send messages.
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEWS */}
      {tab === 'reviews' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
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
                    className="p-3.5 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B1F3A] break-words">{item.productTitle}</p>
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
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#F97316] text-white text-xs font-semibold self-start sm:self-auto"
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

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Your Submitted Reviews ({submittedReviews.length})
            </h2>
            {submittedReviews.length === 0 ? (
              <p className="text-sm text-slate-500">You have not submitted any product reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {submittedReviews.map((rev) => (
                  <div key={rev.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="flex flex-wrap justify-between gap-2">
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
          <form onSubmit={handleComplaintSubmit} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
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
              className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Submit Complaint / Feedback
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Your Submitted Cases ({complaints.length})
            </h2>
            {complaints.length === 0 ? (
              <p className="text-sm text-slate-500">No complaints or feedback records.</p>
            ) : (
              <div className="space-y-3">
                {complaints.map((c) => (
                  <div key={c.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex flex-wrap justify-between gap-2">
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
        <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6">
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
