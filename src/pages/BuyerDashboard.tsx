import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  MessageSquareWarning,
  Package,
  Send,
  Settings,
  Star,
} from 'lucide-react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { BuyerConversation, Complaint, Order } from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';
import { useLoginGreeting } from '../utils/greeting';

interface BuyerDashboardProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

type BuyerTab = 'orders' | 'messages' | 'reviews' | 'complaints' | 'profile';

export function BuyerDashboard({ initialQuery, onNavigate }: BuyerDashboardProps) {
  const { user, refreshUser } = useAuth();
  const { greeting } = useLoginGreeting(user);
  const [tab, setTab] = useState<BuyerTab>(() => {
    const qTab = initialQuery?.get('tab');
    if (
      qTab === 'messages' ||
      qTab === 'reviews' ||
      qTab === 'complaints' ||
      qTab === 'profile'
    ) {
      return qTab;
    }
    return 'orders';
  });

  const [orders, setOrders] = useState<Order[]>([]);
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
    const qSeller = initialQuery?.get('sellerId');
    if (
      qTab === 'orders' ||
      qTab === 'messages' ||
      qTab === 'reviews' ||
      qTab === 'complaints' ||
      qTab === 'profile'
    ) {
      setTab(qTab);
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
      return subscribeDataChanged(() => {
        loadBuyerData();
      });
    }
    return undefined;
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
    { id: 'complaints', label: 'Complaints & Feedback', icon: <MessageSquareWarning className="w-4 h-4" /> },
    { id: 'profile', label: 'Account Settings', icon: <Settings className="w-4 h-4" /> },
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

      {/* Tab Bar */}
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Your Orders ({orders.length})
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Click any order to open its dedicated page with full items, tracking updates, payment instructions, and cancellation or refund options.
              </p>
            </div>
          </div>

          {loadingOrders ? (
            <div className="p-6 text-sm text-slate-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-10 text-center space-y-3">
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
            <div className="divide-y divide-slate-100">
              {orders.map((ord) => {
                const firstItem = ord.items[0];
                const totalUnits = ord.items.reduce((sum, item) => sum + item.quantity, 0);
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => onNavigate(`/buyer-dashboard/orders/${ord.id}`)}
                    className="w-full text-left p-4 sm:px-6 sm:py-5 hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        {firstItem?.productImage ? (
                          <SafeAssetImage
                            src={firstItem.productImage}
                            alt={firstItem.productTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                            {ord.orderReference}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {new Date(ord.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-700 break-words">
                          {ord.sellerBusinessName} · {ord.fulfillmentMethod}
                        </p>

                        {firstItem && (
                          <p className="text-xs text-slate-600 truncate">
                            {firstItem.productTitle}
                            {ord.items.length > 1
                              ? ` + ${ord.items.length - 1} more item${ord.items.length - 1 > 1 ? 's' : ''}`
                              : ''}{' '}
                            <span className="text-slate-400">({totalUnits} {totalUnits === 1 ? 'unit' : 'units'})</span>
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px]">
                          <span className="font-medium text-slate-700">
                            Order: <strong className="text-[#0B1F3A]">{ord.orderStatus}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="font-medium text-slate-700">
                            Tracking: <strong className="text-[#0B1F3A]">{ord.trackingStage || 'Order Placed'}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="font-medium text-slate-700">
                            Payment: <strong className="text-[#F97316]">{ord.payment?.status || 'Not Reported'}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <span className="font-mono text-sm sm:text-base font-bold text-[#F97316] tabular-nums whitespace-nowrap">
                        GHS {ord.totalAmount.toFixed(2)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3A]">
                        <span>View Order Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
                    `Hello ${activeConversation.sellerBusinessName}, messaging from AIDOOMART.`
                  ) && (
                    <a
                      href={
                        buildWhatsAppUrl(
                          activeConversation.sellerPhone,
                          `Hello ${activeConversation.sellerBusinessName}, messaging from AIDOOMART.`
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

      {/* ACCOUNT SETTINGS & SECURITY */}
      {tab === 'profile' && (
        <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            Account Settings & Security
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
              <span>Play alert chime for new order &amp; message notifications</span>
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

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
              >
                Save Account Settings
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
