import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileCheck,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  Plus,
  Send,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { apiRequest, apiUpload } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  MarketplaceCategory,
  Order,
  Product,
  SellerConversation,
  SellerProfile,
  SellerPromotion,
} from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { PromoManagerPanel } from '../components/PromoManagerPanel';
import { PhoneInput } from '../components/PhoneInput';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';
import { useLoginGreeting } from '../utils/greeting';

interface SellerDashboardProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

type SellerTab =
  | 'overview'
  | 'application'
  | 'profile'
  | 'products'
  | 'orders'
  | 'messages'
  | 'payment-settings'
  | 'payments'
  | 'promotions'
  | 'feedback'
  | 'promocodes';

const TRACKING_STAGE_PRESETS = [
  'Order Placed',
  'Confirmed & Preparing',
  'Packed & Ready',
  'Dispatched / In Transit',
  'Out for Delivery',
  'Ready for Pickup',
  'Delivered / Completed',
];

export function SellerDashboard({ initialQuery, onNavigate }: SellerDashboardProps) {
  const { user, settings, refreshUser } = useAuth();
  const [tab, setTab] = useState<SellerTab>(() => {
    const q = initialQuery?.get('tab');
    if (
      q === 'application' ||
      q === 'profile' ||
      q === 'products' ||
      q === 'orders' ||
      q === 'messages' ||
      q === 'payment-settings' ||
      q === 'payments' ||
      q === 'promotions' ||
      q === 'feedback' ||
      q === 'promocodes'
    ) {
      return q;
    }
    return 'overview';
  });

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const { greeting } = useLoginGreeting(
    user ? { ...user, sellerProfile: profile ?? user.sellerProfile } : null
  );
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellerPromos, setSellerPromos] = useState<SellerPromotion[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Application edit state
  const [appForm, setAppForm] = useState({
    legalName: '',
    businessName: '',
    phone: '',
    description: '',
    physicalAddress: '',
    locationCity: '',
    deliveryPickupNotes: '',
    categories: [] as string[],
  });

  // Payment settings state
  const [payForm, setPayForm] = useState({
    momoEnabled: false,
    momoProvider: 'MTN Mobile Money',
    momoAccountName: '',
    momoNumber: '',
    momoInstructions: '',
    bankEnabled: false,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankBranch: '',
    bankInstructions: '',
  });

  // Product editor state
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [prodForm, setProdForm] = useState({
    title: '',
    categoryId: '',
    price: '',
    stock: '',
    description: '',
    variationsText: '',
    images: [] as string[],
    published: true,
  });

  // Homepage promotion form
  const [hpPromoForm, setHpPromoForm] = useState({
    title: '',
    description: '',
    productId: '',
  });

  // Payment verification note
  const [verifyNotes, setVerifyNotes] = useState<Record<number, string>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Order tracking editor state
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingForm, setTrackingForm] = useState({
    trackingStage: 'Confirmed & Preparing',
    trackingLocation: '',
    estimatedDelivery: '',
    courierContact: '',
    trackingNote: '',
    orderStatus: '',
  });
  const [savingTracking, setSavingTracking] = useState(false);

  // Seller <-> Buyer Messages state
  const [conversations, setConversations] = useState<SellerConversation[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(() => {
    const q = initialQuery?.get('buyerId');
    return q ? Number(q) : null;
  });
  const [buyerReplyDraft, setBuyerReplyDraft] = useState('');
  const [sendingBuyerReply, setSendingBuyerReply] = useState(false);

  const loadAll = async () => {
    try {
      const [dash, cats, prods, ords, promos, fb, msgs] = await Promise.all([
        apiRequest<{ profile: SellerProfile; documents: any[]; auditLogs: any[]; analytics: any }>(
          '/api/seller/dashboard'
        ),
        apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories'),
        apiRequest<{ products: Product[] }>('/api/seller/products'),
        apiRequest<{ orders: Order[] }>('/api/seller/orders'),
        apiRequest<{ promotions: SellerPromotion[] }>('/api/seller/promotions'),
        apiRequest<{ complaints: any[]; reviews: any[] }>('/api/seller/complaints'),
        apiRequest<{ conversations: SellerConversation[] }>('/api/seller/messages'),
      ]);

      setProfile(dash.profile);
      setDocuments(dash.documents || []);
      setAuditLogs(dash.auditLogs || []);
      setAnalytics(dash.analytics);
      setAppForm({
        legalName: dash.profile.legalName,
        businessName: dash.profile.businessName,
        phone: dash.profile.phone,
        description: dash.profile.description,
        physicalAddress: dash.profile.physicalAddress,
        locationCity: dash.profile.locationCity,
        deliveryPickupNotes: dash.profile.deliveryPickupNotes,
        categories: dash.profile.categories || [],
      });
      setPayForm(dash.profile.paymentSettings);

      const catList = cats.categories || [];
      setCategories(catList);
      if (catList.length > 0 && !prodForm.categoryId) {
        setProdForm((p) => ({ ...p, categoryId: String(catList[0].id) }));
      }
      setProducts(prods.products || []);
      setOrders(ords.orders || []);
      setSellerPromos(promos.promotions || []);
      setComplaints(fb.complaints || []);
      setReviews(fb.reviews || []);
      const convList = msgs.conversations || [];
      setConversations(convList);
      if (convList.length > 0 && !selectedBuyerId) {
        setSelectedBuyerId(convList[0].buyerId);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const qTab = initialQuery?.get('tab');
    const qBuyerId = initialQuery?.get('buyerId');
    if (
      qTab === 'overview' ||
      qTab === 'application' ||
      qTab === 'profile' ||
      qTab === 'products' ||
      qTab === 'orders' ||
      qTab === 'messages' ||
      qTab === 'payment-settings' ||
      qTab === 'payments' ||
      qTab === 'promotions' ||
      qTab === 'feedback' ||
      qTab === 'promocodes'
    ) {
      setTab(qTab);
    }
    if (qBuyerId) {
      setSelectedBuyerId(Number(qBuyerId));
    }
  }, [initialQuery?.toString()]);

  useEffect(() => {
    if (user?.role === 'seller') {
      loadAll();
    }
  }, [user?.id, user?.role]);

  if (!user || user.role !== 'seller') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Seller Dashboard</h1>
        <p className="text-sm text-slate-600">
          Please sign in with a Seller account to manage your business and storefront.
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

  const isApproved = profile?.applicationStatus === 'Approved';

  const notifyResult = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setStatusMsg('');
    } else {
      setStatusMsg(msg);
      setErrorMsg('');
    }
  };

  const handleSaveApplication = async (submitForReview: boolean) => {
    try {
      const res = await apiRequest<{ message: string }>('/api/seller/application', {
        method: 'PUT',
        body: { ...appForm, submitForReview },
      });
      notifyResult(res.message);
      await loadAll();
      await refreshUser();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('documents', f));
    try {
      const res = await apiUpload<{ message: string }>('/api/seller/application/documents', fd);
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'storefront' | 'business') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    fd.append('kind', kind);
    Array.from(files).forEach((f) => fd.append('photos', f));
    try {
      const res = await apiUpload<{ message: string }>('/api/seller/profile/photos', fd);
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>('/api/seller/profile', {
        method: 'PUT',
        body: {
          businessName: appForm.businessName,
          description: appForm.description,
          phone: appForm.phone,
          locationCity: appForm.locationCity,
          deliveryPickupNotes: appForm.deliveryPickupNotes,
        },
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>('/api/seller/payment-settings', {
        method: 'PUT',
        body: payForm,
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleProductImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('images', f));
    try {
      const res = await apiUpload<{ images: string[] }>('/api/seller/products/upload-images', fd);
      setProdForm((p) => ({ ...p, images: [...p.images, ...res.images].slice(0, 5) }));
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const variations = prodForm.variationsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      title: prodForm.title,
      categoryId: Number(prodForm.categoryId),
      price: Number(prodForm.price),
      stock: Number(prodForm.stock),
      description: prodForm.description,
      variations,
      images: prodForm.images,
      published: prodForm.published,
    };

    try {
      if (editingProductId) {
        const res = await apiRequest<{ message: string }>(`/api/seller/products/${editingProductId}`, {
          method: 'PUT',
          body: payload,
        });
        notifyResult(res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/seller/products', {
          method: 'POST',
          body: payload,
        });
        notifyResult(res.message);
      }
      setEditingProductId(null);
      setProdForm({
        title: '',
        categoryId: categories[0] ? String(categories[0].id) : '',
        price: '',
        stock: '',
        description: '',
        variationsText: '',
        images: [],
        published: true,
      });
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, orderStatus: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { orderStatus },
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const openTrackingEditor = (ord: Order) => {
    if (trackingOrderId === ord.id) {
      setTrackingOrderId(null);
      return;
    }
    setTrackingOrderId(ord.id);
    setTrackingForm({
      trackingStage: ord.trackingStage || 'Confirmed & Preparing',
      trackingLocation: ord.trackingLocation || '',
      estimatedDelivery: ord.estimatedDelivery || '',
      courierContact: ord.courierContact || '',
      trackingNote: ord.trackingNote || '',
      orderStatus: ord.orderStatus,
    });
  };

  const handleSaveOrderTracking = async (e: React.FormEvent, orderId: number) => {
    e.preventDefault();
    setSavingTracking(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/orders/${orderId}/tracking`, {
        method: 'POST',
        body: trackingForm,
      });
      notifyResult(res.message);
      setTrackingOrderId(null);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message || 'Could not update tracking.', true);
    } finally {
      setSavingTracking(false);
    }
  };

  const handleSendBuyerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBuyerConversation || !buyerReplyDraft.trim()) return;
    setSendingBuyerReply(true);
    try {
      await apiRequest(`/api/seller/messages/${activeBuyerConversation.buyerId}`, {
        method: 'POST',
        body: { message: buyerReplyDraft.trim() },
      });
      setBuyerReplyDraft('');
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message || 'Could not send reply.', true);
    } finally {
      setSendingBuyerReply(false);
    }
  };

  const handleVerifyPayment = async (orderId: number, decision: string, amountDue: number) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/payments/${orderId}/verify`, {
        method: 'POST',
        body: {
          decision,
          amountConfirmed: decision === 'confirm' ? amountDue : undefined,
          sellerNotes: verifyNotes[orderId] || '',
        },
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err.message, true);
    }
  };

  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const activeBuyerConversation =
    conversations.find((c) => c.buyerId === selectedBuyerId) || conversations[0] || null;

  const tabs: Array<{ id: SellerTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview & Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'application', label: 'Verification & Docs', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'profile', label: 'Storefront Profile', icon: <Store className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Tracking', icon: <Package className="w-4 h-4" /> },
    {
      id: 'messages',
      label: totalUnreadMessages > 0 ? `Buyer Messages (${totalUnreadMessages})` : 'Buyer Messages',
      icon: <MessageCircle className="w-4 h-4" />,
    },
    { id: 'payment-settings', label: 'Payment Settings', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'payments', label: 'Payment Verification', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'promotions', label: 'Homepage Promotions', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'feedback', label: 'Complaints & Reviews', icon: <MessageSquare className="w-4 h-4" /> },
    ...(settings.promoCreatorPolicy === 'seller' || settings.promoCreatorPolicy === 'both'
      ? [{ id: 'promocodes' as SellerTab, label: 'Promo Codes', icon: <Tag className="w-4 h-4" /> }]
      : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
              {profile?.businessName || 'Seller Dashboard'}
            </h1>
            {profile?.verifiedBadge && <VerifiedBadge size="md" />}
          </div>
          <p className="text-sm font-semibold text-[#F97316] mt-0.5">{greeting}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Application Status:{' '}
            <strong className={isApproved ? 'text-emerald-700' : 'text-[#F97316]'}>
              {profile?.applicationStatus || 'Loading...'}
            </strong>
          </p>
        </div>

        {isApproved && (
          <button
            type="button"
            onClick={() => onNavigate(`/seller/${user.id}`)}
            className="px-4 py-2 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            View Public Storefront
          </button>
        )}
      </div>

      {!isApproved && profile && (
        <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-xs text-slate-800 space-y-1">
          <p className="font-bold text-[#0B1F3A]">
            Seller Verification Status: {profile.applicationStatus}
          </p>
          <p>
            Only administrator-approved sellers can publish products to the Shop. You may complete your application, upload private verification documents, and configure your manual payment settings while awaiting approval.
          </p>
          {profile.adminFeedback && (
            <p className="pt-1 font-medium text-red-700">
              Administrator Note: {profile.adminFeedback}
            </p>
          )}
        </div>
      )}

      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
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

      {/* OVERVIEW & GENUINE ANALYTICS */}
      {tab === 'overview' && analytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Published Products</p>
              <p className="text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {analytics.publishedProducts} / {analytics.totalProducts}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Total Orders Received</p>
              <p className="text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {analytics.totalOrders}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Awaiting Payment Check</p>
              <p className="text-2xl font-mono font-bold text-[#F97316] tabular-nums mt-1">
                {analytics.pendingPaymentVerifications}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Confirmed Sales Total</p>
              <p className="text-2xl font-mono font-bold text-emerald-700 tabular-nums mt-1">
                GHS {Number(analytics.confirmedSalesTotal || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Order Status Breakdown (Live Database Totals)
            </h2>
            {analytics.ordersByStatus?.length === 0 ? (
              <p className="text-sm text-slate-500">No order records yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {analytics.ordersByStatus.map((row: any) => (
                  <div key={row.status} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between text-xs">
                    <span className="text-slate-700">{row.status}</span>
                    <span className="font-mono font-bold tabular-nums text-[#0B1F3A]">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPLICATION & PRIVATE VERIFICATION DOCS */}
      {tab === 'application' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Seller Verification Application
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Legal Name</label>
                <input
                  type="text"
                  value={appForm.legalName}
                  onChange={(e) => setAppForm({ ...appForm, legalName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={appForm.businessName}
                  onChange={(e) => setAppForm({ ...appForm, businessName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Telephone</label>
                <PhoneInput
                  value={appForm.phone}
                  onChange={(val) => setAppForm({ ...appForm, phone: val })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City / Region</label>
                <input
                  type="text"
                  value={appForm.locationCity}
                  onChange={(e) => setAppForm({ ...appForm, locationCity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Business Address</label>
              <input
                type="text"
                value={appForm.physicalAddress}
                onChange={(e) => setAppForm({ ...appForm, physicalAddress: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Description</label>
              <textarea
                rows={3}
                value={appForm.description}
                onChange={(e) => setAppForm({ ...appForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Categories</label>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  new Set([
                    ...categories.map((c) => c.name),
                    ...AIDOMART_ASSETS.categories.map((c) => c.name),
                    ...appForm.categories,
                  ])
                ).map((catName) => {
                  const selected = appForm.categories.includes(catName);
                  return (
                    <button
                      key={catName}
                      type="button"
                      onClick={() =>
                        setAppForm((f) => ({
                          ...f,
                          categories: selected
                            ? f.categories.filter((c) => c !== catName)
                            : [...f.categories, catName],
                        }))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                        selected
                          ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {catName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSaveApplication(true)}
                className="px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
              >
                {isApproved ? 'Save Changes' : 'Save & Submit for Admin Review'}
              </button>
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => handleSaveApplication(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Save Draft
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                Private Verification Documents
              </h3>
              <p className="text-xs text-slate-600">
                Upload business registration, ID, or supporting documents (JPG, PNG, WebP, PDF). Stored privately for administrator inspection only.
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Upload Supporting Documents</span>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={handleDocUpload}
                  className="hidden"
                />
              </label>

              {documents.length > 0 && (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                  {documents.map((doc) => (
                    <li key={doc.id} className="px-3 py-2 flex justify-between gap-2">
                      <span className="truncate font-medium text-slate-800">{doc.originalName}</span>
                      <span className="text-slate-400 shrink-0 tabular-nums">
                        {Math.round(doc.sizeBytes / 1024)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                Verification & Inspection Audit Trail
              </h3>
              <p className="text-xs text-slate-600">
                Physical Inspection Conducted:{' '}
                <strong>{profile?.physicalInspectionConducted ? `Yes (${profile.physicalInspectionDate})` : 'No'}</strong>
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                    <p className="font-semibold text-[#0B1F3A]">{log.action}</p>
                    {log.notes && <p className="text-slate-600 mt-0.5">{log.notes}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">
                      By {log.actorName} · {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STOREFRONT PROFILE */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Public Storefront Information
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Name</label>
              <input
                type="text"
                required
                value={appForm.businessName}
                onChange={(e) => setAppForm({ ...appForm, businessName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Public Description</label>
              <textarea
                rows={3}
                value={appForm.description}
                onChange={(e) => setAppForm({ ...appForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={appForm.phone}
                  onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City / Location</label>
                <input
                  type="text"
                  value={appForm.locationCity}
                  onChange={(e) => setAppForm({ ...appForm, locationCity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery & Pickup Arrangements
              </label>
              <input
                type="text"
                value={appForm.deliveryPickupNotes}
                onChange={(e) => setAppForm({ ...appForm, deliveryPickupNotes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Update Storefront Profile
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Storefront & Business Photos
            </h2>
            <div className="flex items-center gap-4">
              {profile?.storefrontImage ? (
                <SafeAssetImage
                  src={profile.storefrontImage}
                  alt="Storefront"
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <Store className="w-7 h-7" />
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] text-white text-xs font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Upload Storefront Avatar</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => handlePhotoUpload(e, 'storefront')}
                  className="hidden"
                />
              </label>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Add Business Photos</span>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => handlePhotoUpload(e, 'business')}
                  className="hidden"
                />
              </label>
              {profile?.businessPhotos && profile.businessPhotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {profile.businessPhotos.map((p) => (
                    <SafeAssetImage
                      key={p}
                      src={p}
                      alt="Business"
                      className="aspect-square rounded-lg object-cover border border-slate-200"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MANAGEMENT */}
      {tab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              {editingProductId ? 'Edit Product' : 'Add New Product'}
            </h2>
            {!isApproved ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                Your seller account must be Approved by an administrator before you can publish products.
              </p>
            ) : (
              <form onSubmit={handleSaveProduct} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={prodForm.title}
                    onChange={(e) => setProdForm({ ...prodForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                    <select
                      value={prodForm.categoryId}
                      onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Price (GHS) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={prodForm.price}
                      onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Quantity *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={prodForm.stock}
                      onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Variations (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={prodForm.variationsText}
                      onChange={(e) => setProdForm({ ...prodForm, variationsText: e.target.value })}
                      placeholder="S, M, L or Black, Navy"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                  <textarea
                    rows={3}
                    required
                    value={prodForm.description}
                    onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Images</label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Images</span>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp"
                      onChange={handleProductImages}
                      className="hidden"
                    />
                  </label>
                  {prodForm.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {prodForm.images.map((img) => (
                        <div key={img} className="relative w-14 h-14">
                          <SafeAssetImage
                            src={img}
                            alt="Product"
                            className="w-14 h-14 rounded object-cover border border-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setProdForm((p) => ({
                                ...p,
                                images: p.images.filter((x) => x !== img),
                              }))
                            }
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px]"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={prodForm.published}
                    onChange={(e) => setProdForm({ ...prodForm, published: e.target.checked })}
                  />
                  <span>Publish immediately in Shop</span>
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
                  >
                    {editingProductId ? 'Update Product' : 'Save Product'}
                  </button>
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId(null);
                        setProdForm({
                          title: '',
                          categoryId: categories[0] ? String(categories[0].id) : '',
                          price: '',
                          stock: '',
                          description: '',
                          variationsText: '',
                          images: [],
                          published: true,
                        });
                      }}
                      className="px-3 py-2 text-xs text-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Your Product Listings ({products.length})
              </h2>
            </div>
            {products.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                You have not added any products yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {products.map((p) => (
                  <div key={p.id} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <SafeAssetImage
                        src={p.images[0] || ''}
                        alt={p.title}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#0B1F3A] truncate">{p.title}</h3>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {p.categoryName} · GHS {p.price.toFixed(2)} · Stock: {p.stock} ·{' '}
                          <span className={p.published ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                            {p.published ? 'Published' : 'Unpublished'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProductId(p.id);
                          setProdForm({
                            title: p.title,
                            categoryId: String(p.categoryId),
                            price: String(p.price),
                            stock: String(p.stock),
                            description: p.description,
                            variationsText: p.variations.join(', '),
                            images: p.images,
                            published: p.published,
                          });
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/seller/products/${p.id}`, {
                            method: 'PUT',
                            body: { published: !p.published },
                          });
                          await loadAll();
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700"
                      >
                        {p.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/seller/products/${p.id}`, { method: 'DELETE' });
                          await loadAll();
                        }}
                        aria-label="Delete product"
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDERS & BUYER TRACKING */}
      {tab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Seller Orders & Buyer Tracking ({orders.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update order workflow or post live tracking milestones so buyers know how far their order has reached.
            </p>
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No orders received yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {orders.map((ord) => {
                const buyerWa = buildWhatsAppUrl(
                  ord.buyerPhone,
                  `Hello ${ord.buyerName}, update on your AIDOMART order ${ord.orderReference}.`
                );
                return (
                  <div key={ord.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                          {ord.orderReference}
                        </span>
                        <span className="text-xs text-slate-500 block sm:inline sm:ml-3">
                          Buyer: {ord.buyerName} ({ord.buyerPhone}) · {ord.fulfillmentMethod}
                          {ord.deliveryAddress ? ` — ${ord.deliveryAddress}` : ''}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#F97316] tabular-nums">
                        GHS {ord.totalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 space-y-1">
                      {ord.items.map((it) => (
                        <div key={it.id}>
                          • {it.productTitle} {it.selectedVariation ? `(${it.selectedVariation})` : ''} ×{' '}
                          {it.quantity}
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[#0B1F3A] flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-[#F97316]" />
                          <span>Tracking Stage: {ord.trackingStage || 'Order Placed'}</span>
                        </p>
                        {(ord.trackingLocation || ord.estimatedDelivery || ord.courierContact) && (
                          <p className="text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                            {ord.trackingLocation && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#F97316]" />
                                {ord.trackingLocation}
                              </span>
                            )}
                            {ord.estimatedDelivery && <span>ETA: {ord.estimatedDelivery}</span>}
                            {ord.courierContact && <span>Courier: {ord.courierContact}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openTrackingEditor(ord)}
                          className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
                        >
                          {trackingOrderId === ord.id ? 'Close Tracking Form' : 'Update Tracking'}
                        </button>
                        {buyerWa && (
                          <a
                            href={buyerWa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {trackingOrderId === ord.id && (
                      <form
                        onSubmit={(e) => handleSaveOrderTracking(e, ord.id)}
                        className="p-4 rounded-xl bg-orange-50/50 border border-orange-200 space-y-3 text-xs"
                      >
                        <h3 className="font-display text-sm font-bold text-[#0B1F3A]">
                          Post Tracking Update for {ord.orderReference}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Tracking Milestone Stage *
                            </label>
                            <select
                              value={trackingForm.trackingStage}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingStage: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
                            >
                              {TRACKING_STAGE_PRESETS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Update Order Status (Optional)
                            </label>
                            <select
                              value={trackingForm.orderStatus}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, orderStatus: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            >
                              <option value="Pending Seller Confirmation">Pending Seller Confirmation</option>
                              <option value="Confirmed">Confirmed</option>
                              <option value="Processing">Processing</option>
                              <option value="Ready for Pickup / Dispatch">Ready for Pickup / Dispatch</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Current Location / Checkpoint
                            </label>
                            <input
                              type="text"
                              value={trackingForm.trackingLocation}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingLocation: e.target.value })
                              }
                              placeholder="e.g. Circle Dispatch Hub, Accra"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Estimated Delivery / Pickup Time
                            </label>
                            <input
                              type="text"
                              value={trackingForm.estimatedDelivery}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, estimatedDelivery: e.target.value })
                              }
                              placeholder="e.g. Today 4:00 PM"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Courier / Rider Contact
                            </label>
                            <input
                              type="text"
                              value={trackingForm.courierContact}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, courierContact: e.target.value })
                              }
                              placeholder="e.g. Kwame (0240000000)"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Progress Note for Buyer
                            </label>
                            <input
                              type="text"
                              value={trackingForm.trackingNote}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingNote: e.target.value })
                              }
                              placeholder="Parcel handed over to dispatch rider..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={savingTracking}
                            className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60"
                          >
                            {savingTracking ? 'Saving...' : 'Save & Notify Buyer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackingOrderId(null)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-slate-600">
                        Payment: <strong>{ord.payment?.status}</strong>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-slate-600">Order Workflow:</label>
                        <select
                          value={ord.orderStatus}
                          onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                        >
                          <option value="Pending Seller Confirmation">Pending Seller Confirmation</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Processing">Processing</option>
                          <option value="Ready for Pickup / Dispatch">Ready for Pickup / Dispatch</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* BUYER MESSAGES */}
      {tab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50">
              <h2 className="font-display text-sm font-bold text-[#0B1F3A]">
                Buyer Inquiries ({conversations.length})
              </h2>
            </div>
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No messages from buyers yet. When buyers message you from your storefront or product pages, conversations appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {conversations.map((conv) => (
                  <button
                    key={conv.buyerId}
                    type="button"
                    onClick={async () => {
                      setSelectedBuyerId(conv.buyerId);
                      if (conv.unreadCount > 0) {
                        await apiRequest(`/api/seller/messages/${conv.buyerId}/read`, {
                          method: 'POST',
                        }).catch(() => {});
                        await loadAll();
                      }
                    }}
                    className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors space-y-1 ${
                      activeBuyerConversation?.buyerId === conv.buyerId ? 'bg-orange-50/70' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0B1F3A]">{conv.buyerName}</span>
                      {conv.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#F97316] text-white text-[10px] font-bold tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{conv.lastMessage}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            {activeBuyerConversation ? (
              <>
                <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#0B1F3A]">
                      Chat with {activeBuyerConversation.buyerName}
                    </h3>
                    {activeBuyerConversation.buyerPhone && (
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {activeBuyerConversation.buyerPhone}
                      </p>
                    )}
                  </div>
                  {buildWhatsAppUrl(
                    activeBuyerConversation.buyerPhone,
                    `Hello ${activeBuyerConversation.buyerName}, replying from ${profile?.businessName || 'AIDOMART'}.`
                  ) && (
                    <a
                      href={
                        buildWhatsAppUrl(
                          activeBuyerConversation.buyerPhone,
                          `Hello ${activeBuyerConversation.buyerName}, replying from ${profile?.businessName || 'AIDOMART'}.`
                        )!
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
                    >
                      <WhatsAppIcon className="w-4 h-4 shrink-0" />
                      <span>WhatsApp Buyer</span>
                    </a>
                  )}
                </div>

                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto bg-slate-50/50">
                  {activeBuyerConversation.messages.map((m) => {
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
                  })}
                </div>

                <form
                  onSubmit={handleSendBuyerReply}
                  className="p-3 sm:p-4 border-t border-slate-200 bg-white flex gap-2"
                >
                  <input
                    type="text"
                    required
                    value={buyerReplyDraft}
                    onChange={(e) => setBuyerReplyDraft(e.target.value)}
                    placeholder={`Reply to ${activeBuyerConversation.buyerName}...`}
                    className="flex-1 min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sendingBuyerReply}
                    className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-slate-500">
                Select a buyer conversation on the left to read and reply.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT SETTINGS */}
      {tab === 'payment-settings' && (
        <form onSubmit={handleSavePaymentSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Manual Payment Receiving Settings
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Configure your Mobile Money and/or Bank Transfer details. Only enabled methods are displayed to buyers on their order payment page.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 border border-slate-200 rounded-xl space-y-3">
              <label className="flex items-center gap-2 font-display text-sm font-bold text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={payForm.momoEnabled}
                  onChange={(e) => setPayForm({ ...payForm, momoEnabled: e.target.checked })}
                />
                <span>Enable Mobile Money</span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Provider</label>
                <select
                  value={payForm.momoProvider}
                  onChange={(e) => setPayForm({ ...payForm, momoProvider: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="MTN Mobile Money">MTN Mobile Money</option>
                  <option value="Telecel Cash">Telecel Cash</option>
                  <option value="AT Money">AT Money</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Account Holder Name
                </label>
                <input
                  type="text"
                  value={payForm.momoAccountName}
                  onChange={(e) => setPayForm({ ...payForm, momoAccountName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Money Number
                </label>
                <input
                  type="tel"
                  value={payForm.momoNumber}
                  onChange={(e) => setPayForm({ ...payForm, momoNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                <input
                  type="text"
                  value={payForm.momoInstructions}
                  onChange={(e) => setPayForm({ ...payForm, momoInstructions: e.target.value })}
                  placeholder="Include your Order Reference in the MoMo reference field"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl space-y-3">
              <label className="flex items-center gap-2 font-display text-sm font-bold text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={payForm.bankEnabled}
                  onChange={(e) => setPayForm({ ...payForm, bankEnabled: e.target.checked })}
                />
                <span>Enable Bank Transfer</span>
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={payForm.bankName}
                  onChange={(e) => setPayForm({ ...payForm, bankName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Account Holder Name
                </label>
                <input
                  type="text"
                  value={payForm.bankAccountName}
                  onChange={(e) => setPayForm({ ...payForm, bankAccountName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={payForm.bankAccountNumber}
                    onChange={(e) => setPayForm({ ...payForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <input
                    type="text"
                    value={payForm.bankBranch}
                    onChange={(e) => setPayForm({ ...payForm, bankBranch: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                <input
                  type="text"
                  value={payForm.bankInstructions}
                  onChange={(e) => setPayForm({ ...payForm, bankInstructions: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
          >
            Save Payment Receiving Details
          </button>
        </form>
      )}

      {/* MANUAL PAYMENT VERIFICATION */}
      {tab === 'payments' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Manual Payment Verification
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Always check your actual Mobile Money wallet or bank statement before confirming payment received.
            </p>
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No payment records yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {orders.map((ord) => (
                <div key={ord.id} className="p-5 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                        {ord.orderReference}
                      </span>
                      <span className="text-slate-500 ml-2">· Buyer: {ord.buyerName}</span>
                    </div>
                    <span className="font-semibold text-[#F97316]">{ord.payment?.status}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div>
                      <span className="text-slate-500 block">Amount Due</span>
                      <strong className="font-mono tabular-nums">GHS {ord.totalAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Reported Paid</span>
                      <strong className="font-mono tabular-nums">
                        {ord.payment?.amountReported !== null && ord.payment?.amountReported !== undefined
                          ? `GHS ${ord.payment.amountReported.toFixed(2)}`
                          : '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Method</span>
                      <strong>{ord.payment?.paymentMethod || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Tx Ref</span>
                      <strong className="font-mono">{ord.payment?.transactionReference || '—'}</strong>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={verifyNotes[ord.id] || ''}
                      onChange={(e) => setVerifyNotes({ ...verifyNotes, [ord.id]: e.target.value })}
                      placeholder="Verification notes (optional)..."
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(ord.id, 'confirm', ord.totalAmount)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                      >
                        Confirm Payment Received
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(ord.id, 'not_received', ord.totalAmount)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700 font-semibold"
                      >
                        Not Received
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(ord.id, 'amount_mismatch', ord.totalAmount)}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 font-semibold"
                      >
                        Amount Mismatch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(ord.id, 'under_review', ord.totalAmount)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                      >
                        Flag / Review
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HOMEPAGE PROMOTIONS */}
      {tab === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await apiRequest<{ message: string }>('/api/seller/promotions', {
                  method: 'POST',
                  body: {
                    ...hpPromoForm,
                    productId: hpPromoForm.productId ? Number(hpPromoForm.productId) : null,
                    submitForReview: true,
                  },
                });
                notifyResult(res.message);
                setHpPromoForm({ title: '', description: '', productId: '' });
                await loadAll();
              } catch (err: any) {
                notifyResult(err.message, true);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Submit Homepage Promotional Showcase
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Promotion Title *</label>
              <input
                type="text"
                required
                value={hpPromoForm.title}
                onChange={(e) => setHpPromoForm({ ...hpPromoForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Featured Published Product</label>
              <select
                value={hpPromoForm.productId}
                onChange={(e) => setHpPromoForm({ ...hpPromoForm, productId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">General Storefront Showcase</option>
                {products
                  .filter((p) => p.published)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (GHS {p.price.toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
              <textarea
                rows={3}
                required
                value={hpPromoForm.description}
                onChange={(e) => setHpPromoForm({ ...hpPromoForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!isApproved}
              className="px-4 py-2.5 rounded-lg bg-[#0B1F3A] disabled:bg-slate-300 text-white text-xs font-semibold"
            >
              Submit for Admin Approval
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Your Promotions ({sellerPromos.length})
            </h2>
            {sellerPromos.length === 0 ? (
              <p className="text-sm text-slate-500">No promotions submitted yet.</p>
            ) : (
              sellerPromos.map((pr) => (
                <div key={pr.id} className="p-3.5 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <strong className="text-sm text-[#0B1F3A]">{pr.title}</strong>
                    <span className="font-semibold text-[#F97316]">{pr.status}</span>
                  </div>
                  <p className="text-slate-600">{pr.description}</p>
                  {pr.status === 'Published' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/seller/promotions/${pr.id}`, {
                          method: 'PATCH',
                          body: { action: 'unpublish' },
                        });
                        await loadAll();
                      }}
                      className="text-xs font-semibold text-slate-600 underline"
                    >
                      Unpublish
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* COMPLAINTS & REVIEWS */}
      {tab === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Buyer Complaints ({complaints.length})
            </h2>
            {complaints.length === 0 ? (
              <p className="text-sm text-slate-500">No complaints against your store.</p>
            ) : (
              complaints.map((c) => (
                <div key={c.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex justify-between">
                    <strong className="text-[#0B1F3A]">{c.subject}</strong>
                    <span className="text-[#F97316] font-semibold">{c.status}</span>
                  </div>
                  <p className="text-slate-700">{c.message}</p>
                  {c.sellerResponse ? (
                    <p className="bg-slate-50 p-2 rounded">
                      <strong>Your Response:</strong> {c.sellerResponse}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyTexts[`c_${c.id}`] || ''}
                        onChange={(e) => setReplyTexts({ ...replyTexts, [`c_${c.id}`]: e.target.value })}
                        placeholder="Write response..."
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/seller/complaints/${c.id}/respond`, {
                            method: 'POST',
                            body: { response: replyTexts[`c_${c.id}`] || '' },
                          });
                          await loadAll();
                        }}
                        className="px-3 py-1.5 rounded bg-[#0B1F3A] text-white font-semibold"
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Product Reviews ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No product reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex justify-between">
                    <strong className="text-[#0B1F3A]">{r.productTitle}</strong>
                    <span className="text-[#F97316] font-bold">{r.rating}/5</span>
                  </div>
                  <p className="text-slate-700">{r.comment}</p>
                  {r.sellerResponse ? (
                    <p className="bg-slate-50 p-2 rounded">
                      <strong>Your Reply:</strong> {r.sellerResponse}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyTexts[`r_${r.id}`] || ''}
                        onChange={(e) => setReplyTexts({ ...replyTexts, [`r_${r.id}`]: e.target.value })}
                        placeholder="Reply to customer..."
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/seller/reviews/${r.id}/respond`, {
                            method: 'POST',
                            body: { response: replyTexts[`r_${r.id}`] || '' },
                          });
                          await loadAll();
                        }}
                        className="px-3 py-1.5 rounded bg-[#0B1F3A] text-white font-semibold"
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'promocodes' && <PromoManagerPanel />}
    </div>
  );
}
