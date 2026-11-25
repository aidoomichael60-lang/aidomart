import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  FileText,
  Lock,
  Mail,
  Megaphone,
  MessageSquareWarning,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { configureAnalytics } from '../lib/analytics';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { getFirstName, useLoginGreeting } from '../utils/greeting';

type AdminTab =
  | 'overview'
  | 'sellers'
  | 'users'
  | 'products'
  | 'promotions'
  | 'orders'
  | 'complaints';

type SellerFilter = 'all' | 'needs_review' | 'approved' | 'other';

interface AdminDashboardProps {
  initialQuery?: URLSearchParams;
}

const VALID_TABS: AdminTab[] = [
  'overview',
  'sellers',
  'users',
  'products',
  'promotions',
  'orders',
  'complaints',
];

function getStatusBadgeClasses(status: string): string {
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Pending Review') return 'bg-orange-50 text-[#F97316] border-orange-200';
  if (status === 'Draft') return 'bg-slate-100 text-slate-700 border-slate-300';
  if (status === 'Additional Information Required') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-red-50 text-red-700 border-red-200';
}

export function AdminDashboard({ initialQuery }: AdminDashboardProps) {
  const { user, setAuthenticatedUser, refreshUser } = useAuth();
  const { greeting } = useLoginGreeting(user);
  const [tab, setTab] = useState<AdminTab>(() => {
    const q = initialQuery?.get('tab') as AdminTab | null;
    return q && VALID_TABS.includes(q) ? q : 'overview';
  });
  const [sellerFilter, setSellerFilter] = useState<SellerFilter>('all');

  // Private Admin Login Gate state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Data state
  const [overview, setOverview] = useState<any>(null);
  const [sellers, setSellers] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [promotionsList, setPromotionsList] = useState<any[]>([]);
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [complaintsList, setComplaintsList] = useState<any[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  const [loadingData, setLoadingData] = useState(false);
  const [savingSellerId, setSavingSellerId] = useState<number | null>(null);
  const [sellerFeedback, setSellerFeedback] = useState<
    Record<number, { ok: boolean; text: string }>
  >({});
  const [statusBanner, setStatusBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [gaMeasurementIdInput, setGaMeasurementIdInput] = useState('');
  const [savingGaSetting, setSavingGaSetting] = useState(false);

  // Seller review state per profileId
  const [reviewForms, setReviewForms] = useState<
    Record<
      number,
      {
        applicationStatus: string;
        verifiedBadge: boolean;
        physicalInspectionConducted: boolean;
        physicalInspectionDate: string;
        physicalInspectionNotes: string;
        adminFeedback: string;
      }
    >
  >({});

  useEffect(() => {
    const q = initialQuery?.get('tab') as AdminTab | null;
    if (q && VALID_TABS.includes(q)) {
      setTab(q);
    }
  }, [initialQuery?.toString()]);

  const showSuccess = (msg: string) => {
    setErrorBanner('');
    setStatusBanner(msg);
  };

  const showError = (msg: string) => {
    setStatusBanner('');
    setErrorBanner(msg);
  };

  const loadAdminData = async (options: { preserveBanner?: boolean } = {}) => {
    setLoadingData(true);
    try {
      const qs = orderSearch.trim() ? `?ref=${encodeURIComponent(orderSearch.trim())}` : '';
      const boot = await apiRequest<{
        overview: any;
        sellers: any[];
        users: any[];
        products: any[];
        categories: any[];
        promotions: any[];
        orders: any[];
        complaints: any[];
      }>(`/api/admin/bootstrap${qs}`);

      setOverview(boot.overview || null);
      if (boot.overview?.settings) {
        setGaMeasurementIdInput(boot.overview.settings.gaMeasurementId || '');
      }
      const sellerRows = boot.sellers || [];
      setSellers(sellerRows);
      const initForms: typeof reviewForms = {};
      for (const s of sellerRows) {
        initForms[s.id] = {
          applicationStatus: s.applicationStatus || 'Pending Review',
          verifiedBadge: Boolean(s.verifiedBadge),
          physicalInspectionConducted: Boolean(s.physicalInspectionConducted),
          physicalInspectionDate: s.physicalInspectionDate || new Date().toISOString().slice(0, 10),
          physicalInspectionNotes: s.physicalInspectionNotes || '',
          adminFeedback: s.adminFeedback || '',
        };
      }
      setReviewForms(initForms);
      setUsersList(boot.users || []);
      setProductsList(boot.products || []);
      setCategoriesList(boot.categories || []);
      setPromotionsList(boot.promotions || []);
      setOrdersList(boot.orders || []);
      setComplaintsList(boot.complaints || []);
    } catch (err: any) {
      if (!options.preserveBanner) {
        showError(err?.message || 'Unable to load admin records. Tap Refresh Data to try again.');
      }
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdminData();
    }
  }, [user?.id, user?.role]);

  const handleSellerDecision = async (
    seller: any,
    overrides?: Partial<{ applicationStatus: string; verifiedBadge: boolean }>
  ) => {
    const currentForm = reviewForms[seller.id] || {
      applicationStatus: seller.applicationStatus || 'Pending Review',
      verifiedBadge: Boolean(seller.verifiedBadge),
      physicalInspectionConducted: Boolean(seller.physicalInspectionConducted),
      physicalInspectionDate: seller.physicalInspectionDate || new Date().toISOString().slice(0, 10),
      physicalInspectionNotes: seller.physicalInspectionNotes || '',
      adminFeedback: seller.adminFeedback || '',
    };

    const payload = {
      ...currentForm,
      ...overrides,
    };

    setSavingSellerId(seller.id);
    setErrorBanner('');
    setStatusBanner('');
    setSellerFeedback((prev) => {
      const next = { ...prev };
      delete next[seller.id];
      return next;
    });

    try {
      const res = await apiRequest<{
        message: string;
        applicationStatus: string;
        verifiedBadge: boolean;
        emailDelivered?: boolean;
      }>(`/api/admin/sellers/${seller.id}/review`, {
        method: 'POST',
        body: payload,
      });
      const finalStatus = res.applicationStatus || payload.applicationStatus;
      const finalBadge = Boolean(
        res.verifiedBadge !== undefined ? res.verifiedBadge : payload.verifiedBadge && finalStatus === 'Approved'
      );
      const emailNote = res.emailDelivered
        ? ' Seller notified by email & dashboard.'
        : ' Seller notified in dashboard.';
      const successText = `Updated ${seller.businessName} to ${finalStatus}${
        finalBadge ? ' (Verified Badge Granted)' : ''
      }.${emailNote}`;

      setSellers((prev) =>
        prev.map((item) =>
          item.id === seller.id
            ? {
                ...item,
                applicationStatus: finalStatus,
                verifiedBadge: finalBadge,
                physicalInspectionConducted: payload.physicalInspectionConducted,
                physicalInspectionDate: payload.physicalInspectionDate,
                physicalInspectionNotes: payload.physicalInspectionNotes,
                adminFeedback: payload.adminFeedback,
              }
            : item
        )
      );
      setReviewForms((prev) => ({
        ...prev,
        [seller.id]: {
          ...payload,
          applicationStatus: finalStatus,
          verifiedBadge: finalBadge,
        },
      }));
      setSellerFeedback((prev) => ({ ...prev, [seller.id]: { ok: true, text: successText } }));
      showSuccess(successText);
      await loadAdminData({ preserveBanner: true });
    } catch (err: any) {
      const errText = err?.message || `Could not update ${seller.businessName}. Please try again.`;
      setSellerFeedback((prev) => ({ ...prev, [seller.id]: { ok: false, text: errText } }));
      showError(errText);
    } finally {
      setSavingSellerId(null);
    }
  };

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const data = await apiRequest<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: { email: loginEmail, password: loginPassword },
      });
      if (data.user.role !== 'admin') {
        setLoginError('This portal is restricted to authorised administrators.');
        return;
      }
      setAuthenticatedUser(data.user, data.csrfToken);
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed.');
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto px-3 sm:px-4 py-10 sm:py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-[#F97316]" />
            <div>
              <h1 className="font-display text-xl font-bold text-[#0B1F3A]">
                Administrator Access
              </h1>
              <p className="text-xs text-slate-500">
                Private marketplace administration portal.
              </p>
            </div>
          </div>
          <form onSubmit={handleAdminSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Administrator Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full min-h-[42px] py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-sm font-semibold"
            >
              Sign In as Administrator
            </button>
          </form>
        </div>
      </div>
    );
  }

  const awaitingApprovalCount = sellers.filter((s) =>
    ['Pending Review', 'Additional Information Required', 'Draft'].includes(s.applicationStatus)
  ).length;

  const filteredSellers = sellers.filter((s) => {
    if (sellerFilter === 'needs_review') {
      return ['Pending Review', 'Additional Information Required', 'Draft'].includes(
        s.applicationStatus
      );
    }
    if (sellerFilter === 'approved') {
      return s.applicationStatus === 'Approved';
    }
    if (sellerFilter === 'other') {
      return ['Rejected', 'Suspended'].includes(s.applicationStatus);
    }
    return true;
  });

  const tabs: Array<{ id: AdminTab; label: string; badge?: number; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview & Logs', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'sellers',
      label: 'Seller Verification',
      badge: awaitingApprovalCount,
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    { id: 'users', label: 'Accounts', icon: <Users className="w-4 h-4" /> },
    { id: 'products', label: 'Products & Categories', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'promotions', label: 'Promotions', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Payments', icon: <Package className="w-4 h-4" /> },
    { id: 'complaints', label: 'Complaints', icon: <MessageSquareWarning className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B1F3A]">
            AIDOOMART Private Admin Dashboard
          </h1>
          <p className="text-sm font-semibold text-[#F97316] mt-0.5">{greeting}</p>
          <p className="text-xs text-slate-500 break-all">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => loadAdminData()}
          disabled={loadingData}
          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#0B1F3A] self-start sm:self-auto shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          <span>{loadingData ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>

      {statusBanner && (
        <div className="flex items-start gap-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="break-words">{statusBanner}</span>
        </div>
      )}

      {errorBanner && (
        <div className="flex items-start gap-2.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="break-words">{errorBanner}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.badge === 'number' && t.badge > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums ${
                  tab === t.id ? 'bg-[#F97316] text-white' : 'bg-orange-100 text-[#F97316]'
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW & ACTIVITY LOGS */}
      {tab === 'overview' && overview && (
        <div className="space-y-5 sm:space-y-6">
          {awaitingApprovalCount > 0 && (
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#F97316] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-800">
                  <p className="font-bold text-[#0B1F3A]">
                    {awaitingApprovalCount} Seller Account{awaitingApprovalCount === 1 ? '' : 's'} Awaiting Verification / Approval
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    Review business profiles, supporting documents, and approve sellers to publish products.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTab('sellers');
                  setSellerFilter('needs_review');
                }}
                className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold shrink-0 self-start sm:self-auto"
              >
                Review &amp; Approve Sellers &rarr;
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <p className="text-[11px] sm:text-xs text-slate-500">Buyers</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.totalBuyers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <p className="text-[11px] sm:text-xs text-slate-500">Sellers (Approved / Total)</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.approvedSellers} / {overview.counts.totalSellers}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTab('sellers');
                setSellerFilter('needs_review');
              }}
              className="text-left bg-white border border-orange-200 hover:border-[#F97316] rounded-xl p-3.5 sm:p-4 transition-colors"
            >
              <p className="text-[11px] sm:text-xs text-slate-500">Sellers Awaiting Review</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-[#F97316] tabular-nums mt-1">
                {overview.counts.pendingSellers}
              </p>
            </button>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <p className="text-[11px] sm:text-xs text-slate-500">Published Products</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.publishedProducts}
              </p>
            </div>
            <div className="col-span-2 md:col-span-1 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
              <p className="text-[11px] sm:text-xs text-slate-500">Confirmed Payment Volume</p>
              <p className="text-lg sm:text-xl font-mono font-bold text-emerald-700 tabular-nums mt-1">
                GHS {Number(overview.counts.confirmedPaymentVolume || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Platform Configuration */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Platform & Security Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-[#0B1F3A]">Seller-Controlled Promotions Policy</p>
                <p className="text-slate-600">
                  Promotional codes and product-level discounts are strictly managed by individual sellers inside their
                  Seller Dashboard. Buyers only redeem codes manually entered at checkout.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                  Sellers Only (Product &amp; Store Scoped)
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-[#0B1F3A]">Brevo Email & Login OTP Status</p>
                <p className="text-slate-600">
                  Brevo API Key Configured:{' '}
                  <strong className={overview.settings.brevoConfigured ? 'text-emerald-700' : 'text-red-700'}>
                    {overview.settings.brevoConfigured ? 'Yes (Server Secret Active)' : 'No (Set BREVO_API_KEY in server env)'}
                  </strong>
                </p>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={overview.settings.requireLoginEmailOtp}
                    onChange={async (e) => {
                      try {
                        await apiRequest('/api/admin/settings', {
                          method: 'PUT',
                          body: { requireLoginEmailOtp: e.target.checked },
                        });
                        showSuccess('Login email OTP setting updated.');
                        await loadAdminData();
                      } catch (err: any) {
                        showError(err?.message || 'Could not update login OTP setting.');
                      }
                    }}
                  />
                  <span>Require email OTP verification on Buyer & Seller logins</span>
                </label>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#0B1F3A]">Google Analytics 4 (GA4) Integration</p>
                <span
                  className={`px-2 py-0.5 rounded font-semibold ${
                    overview.settings.gaMeasurementId
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {overview.settings.gaMeasurementId
                    ? `Active (${overview.settings.gaMeasurementId})`
                    : 'Not Configured'}
                </span>
              </div>
              <p className="text-slate-600">
                Enter your Google Analytics 4 Measurement ID (formatted like <code className="font-mono">G-XXXXXXXXXX</code>) to automatically track page views, searches, product views, cart additions, and completed purchases across AIDOOMART.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingGaSetting(true);
                  try {
                    const cleaned = gaMeasurementIdInput.trim().toUpperCase();
                    await apiRequest('/api/admin/settings', {
                      method: 'PUT',
                      body: { gaMeasurementId: cleaned },
                    });
                    configureAnalytics(cleaned);
                    await loadAdminData({ preserveBanner: true });
                    await refreshUser();
                    showSuccess(
                      cleaned
                        ? `Google Analytics (${cleaned}) is now active across AIDOOMART.`
                        : 'Google Analytics disabled.'
                    );
                  } catch (err: any) {
                    showError(err?.message || 'Could not update Google Analytics Measurement ID.');
                  } finally {
                    setSavingGaSetting(false);
                  }
                }}
                className="flex flex-col sm:flex-row gap-2 pt-1"
              >
                <input
                  type="text"
                  value={gaMeasurementIdInput}
                  onChange={(e) => setGaMeasurementIdInput(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  maxLength={40}
                  className="flex-1 min-w-0 sm:max-w-xs px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono text-xs uppercase"
                />
                <button
                  type="submit"
                  disabled={savingGaSetting}
                  className="px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#132f57] disabled:opacity-60 text-white font-semibold whitespace-nowrap"
                >
                  {savingGaSetting ? 'Saving...' : 'Save Measurement ID'}
                </button>
                {overview.settings.gaMeasurementId && (
                  <button
                    type="button"
                    disabled={savingGaSetting}
                    onClick={async () => {
                      setSavingGaSetting(true);
                      try {
                        await apiRequest('/api/admin/settings', {
                          method: 'PUT',
                          body: { gaMeasurementId: '' },
                        });
                        setGaMeasurementIdInput('');
                        configureAnalytics('');
                        await loadAdminData({ preserveBanner: true });
                        await refreshUser();
                        showSuccess('Google Analytics Measurement ID cleared.');
                      } catch (err: any) {
                        showError(err?.message || 'Could not clear Google Analytics Measurement ID.');
                      } finally {
                        setSavingGaSetting(false);
                      }
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold whitespace-nowrap"
                  >
                    Disable
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Platform Activity Logs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F97316]" />
                <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                  Platform Activity Logs ({overview.activityLogs?.length || 0})
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">Signups, logins, profile updates &amp; approvals</span>
            </div>

            {!overview.activityLogs || overview.activityLogs.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                No marketplace activity logged yet. Seller registrations, profile edits, and approvals will appear here automatically.
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
                  {overview.activityLogs.map((log: any) => (
                    <div key={log.id} className="p-4 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-[#0B1F3A] break-words">{log.summary}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold capitalize shrink-0 text-[10px]">
                          {log.actorRole}
                        </span>
                      </div>
                      {log.actorEmail && (
                        <p className="text-[11px] text-slate-500 break-all">{log.actorEmail}</p>
                      )}
                      {log.details && (
                        <p className="text-[11px] text-slate-600 break-words">{log.details}</p>
                      )}
                      <p className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Activity</th>
                        <th className="px-4 py-3 font-semibold">Account</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Details</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.activityLogs.map((log: any) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2.5 font-semibold text-[#0B1F3A]">{log.summary}</td>
                          <td className="px-4 py-2.5 text-slate-600">{log.actorEmail || '—'}</td>
                          <td className="px-4 py-2.5 capitalize">{log.actorRole}</td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                            {log.details || log.eventType}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Brevo Email Delivery Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#F97316]" />
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Recent Transactional Email Events
              </h2>
            </div>

            {overview.emailLogs.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                No email events recorded yet.
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100 text-xs">
                  {overview.emailLogs.map((log: any) => (
                    <div key={log.id} className="p-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#0B1F3A] break-all">
                          {log.recipientEmail}
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            log.status === 'sent' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-600 break-all">
                        {log.eventType}
                      </p>
                      {(log.brevoMessageId || log.errorMessage) && (
                        <p className="text-[11px] text-slate-500 break-all">
                          {log.brevoMessageId || log.errorMessage}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Recipient</th>
                        <th className="px-4 py-3 font-semibold">Event</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Details</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.emailLogs.map((log: any) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2.5">{log.recipientEmail}</td>
                          <td className="px-4 py-2.5 font-mono">{log.eventType}</td>
                          <td className="px-4 py-2.5 font-semibold">
                            <span
                              className={
                                log.status === 'sent' ? 'text-emerald-700' : 'text-red-700'
                              }
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                            {log.brevoMessageId || log.errorMessage || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SELLER VERIFICATION */}
      {tab === 'sellers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: `All Sellers (${sellers.length})` },
                { id: 'needs_review', label: `Needs Review / Draft (${awaitingApprovalCount})` },
                {
                  id: 'approved',
                  label: `Approved (${sellers.filter((s) => s.applicationStatus === 'Approved').length})`,
                },
                {
                  id: 'other',
                  label: `Rejected / Suspended (${
                    sellers.filter((s) => ['Rejected', 'Suspended'].includes(s.applicationStatus))
                      .length
                  })`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSellerFilter(f.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sellerFilter === f.id
                    ? 'bg-[#0B1F3A] text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredSellers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 text-center text-sm text-slate-500">
              {sellers.length === 0
                ? 'No seller applications submitted yet.'
                : 'No seller applications match this filter.'}
            </div>
          ) : (
            filteredSellers.map((s) => {
              const form = reviewForms[s.id] || {
                applicationStatus: s.applicationStatus || 'Pending Review',
                verifiedBadge: Boolean(s.verifiedBadge),
                physicalInspectionConducted: Boolean(s.physicalInspectionConducted),
                physicalInspectionDate:
                  s.physicalInspectionDate || new Date().toISOString().slice(0, 10),
                physicalInspectionNotes: s.physicalInspectionNotes || '',
                adminFeedback: s.adminFeedback || '',
              };
              const isSaving = savingSellerId === s.id;

              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {s.storefrontImage ? (
                        <SafeAssetImage
                          src={s.storefrontImage}
                          alt={s.businessName}
                          compact
                          className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center text-sm font-bold shrink-0">
                          {String(s.businessName || s.legalName || 'S').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base sm:text-lg font-bold text-[#0B1F3A] break-words">
                            {s.businessName}
                          </h3>
                          {s.verifiedBadge && <VerifiedBadge />}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 break-words">
                          Legal Name: <strong>{s.legalName}</strong> ·{' '}
                          <span className="break-all">{s.email}</span> (
                          {s.emailVerified ? 'Email Verified' : 'Email Unverified'}) · Tel:{' '}
                          {s.phone || 'Not provided'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 break-words">
                          Address: {s.physicalAddress || 'Not provided yet'}{' '}
                          {s.locationCity ? `(${s.locationCity})` : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`self-start px-2.5 py-1 rounded-md border text-xs font-bold shrink-0 ${getStatusBadgeClasses(
                        s.applicationStatus
                      )}`}
                    >
                      {s.applicationStatus}
                    </span>
                  </div>

                  {s.description && <p className="text-xs text-slate-700 leading-relaxed">{s.description}</p>}

                  {s.businessPhotos && s.businessPhotos.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-700">Storefront &amp; Business Photos</p>
                      <div className="flex flex-wrap gap-2">
                        {s.businessPhotos.map((photo: string) => (
                          <SafeAssetImage
                            key={photo}
                            src={photo}
                            alt={s.businessName}
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Private Verification Documents */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Private Supporting Documents ({s.documents?.length || 0})
                    </p>
                    {s.documents?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {s.documents.map((doc: any) => (
                          <a
                            key={doc.id}
                            href={`/api/admin/documents/${doc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-[#0B1F3A]"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                            <span className="break-all">{doc.originalName}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No verification documents uploaded yet.</p>
                    )}
                  </div>

                  {/* Per-Seller Verification & Activity Log */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Seller Activity &amp; Audit Log ({s.auditLogs?.length || 0})
                    </p>
                    {s.auditLogs?.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/70 text-[11px]">
                        {s.auditLogs.map((log: any) => (
                          <div key={log.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div className="min-w-0">
                              <span className="font-semibold text-[#0B1F3A]">{log.action}</span>
                              {log.notes && <span className="text-slate-600"> — {log.notes}</span>}
                            </div>
                            <span className="text-slate-400 shrink-0 tabular-nums">
                              {log.actorName} · {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No seller audit entries recorded yet.</p>
                    )}
                  </div>

                  {/* Inline Per-Seller Decision Feedback */}
                  {sellerFeedback[s.id] && (
                    <div
                      className={`text-xs font-semibold px-3.5 py-2.5 rounded-lg border ${
                        sellerFeedback[s.id].ok
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      {sellerFeedback[s.id].text}
                    </div>
                  )}

                  {/* Quick One-Click Approval Actions */}
                  {!(s.applicationStatus === 'Approved' && s.verifiedBadge) && (
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          handleSellerDecision(s, {
                            applicationStatus: 'Approved',
                            verifiedBadge: true,
                          })
                        }
                        className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{isSaving ? 'Updating...' : 'Approve & Grant Verified Badge'}</span>
                      </button>
                      {s.applicationStatus !== 'Approved' && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            handleSellerDecision(s, {
                              applicationStatus: 'Approved',
                              verifiedBadge: false,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isSaving ? 'Updating...' : 'Approve Seller'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Full Admin Verification Decision Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Application Status
                        </label>
                        <select
                          value={form.applicationStatus}
                          onChange={(e) => {
                            const nextStatus = e.target.value;
                            setReviewForms({
                              ...reviewForms,
                              [s.id]: {
                                ...form,
                                applicationStatus: nextStatus,
                                verifiedBadge: nextStatus === 'Approved' ? form.verifiedBadge : false,
                              },
                            });
                          }}
                          className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="Draft">Draft (Incomplete Registration)</option>
                          <option value="Pending Review">Pending Review</option>
                          <option value="Additional Information Required">
                            Additional Information Required
                          </option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Suspended">Suspended</option>
                        </select>
                      </div>

                      <div className="flex items-center sm:items-end sm:pb-2 pt-1">
                        <label className="flex items-center gap-2 font-semibold text-[#0B1F3A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.verifiedBadge}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setReviewForms({
                                ...reviewForms,
                                [s.id]: {
                                  ...form,
                                  verifiedBadge: checked,
                                  applicationStatus: checked ? 'Approved' : form.applicationStatus,
                                },
                              });
                            }}
                          />
                          <span>Grant Verified Seller Badge</span>
                        </label>
                      </div>

                      <div className="flex items-center sm:items-end sm:pb-2 pt-1">
                        <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.physicalInspectionConducted}
                            onChange={(e) =>
                              setReviewForms({
                                ...reviewForms,
                                [s.id]: { ...form, physicalInspectionConducted: e.target.checked },
                              })
                            }
                          />
                          <span>Physical Inspection Conducted</span>
                        </label>
                      </div>
                    </div>

                    {form.physicalInspectionConducted && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="date"
                          value={form.physicalInspectionDate}
                          onChange={(e) =>
                            setReviewForms({
                              ...reviewForms,
                              [s.id]: { ...form, physicalInspectionDate: e.target.value },
                            })
                          }
                          className="min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                        <input
                          type="text"
                          value={form.physicalInspectionNotes}
                          onChange={(e) =>
                            setReviewForms({
                              ...reviewForms,
                              [s.id]: { ...form, physicalInspectionNotes: e.target.value },
                            })
                          }
                          placeholder="Physical inspection findings..."
                          className="min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    )}

                    <input
                      type="text"
                      value={form.adminFeedback}
                      onChange={(e) =>
                        setReviewForms({
                          ...reviewForms,
                          [s.id]: { ...form, adminFeedback: e.target.value },
                        })
                      }
                      placeholder="Reviewer notes or additional info request (emailed to seller)..."
                      className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSellerDecision(s)}
                      className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white font-semibold"
                    >
                      {isSaving ? 'Saving Decision...' : 'Save Verification Decision'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ACCOUNTS */}
      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-100 text-xs">
            {usersList.map((u) => {
              const accountDisplayName =
                u.role === 'seller'
                  ? u.businessName || getFirstName(u.fullName)
                  : getFirstName(u.fullName);
              return (
                <div key={u.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#0B1F3A] break-words">
                        {accountDisplayName}
                      </p>
                      <p className="text-slate-600 break-all">{u.email}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold capitalize shrink-0">
                      {u.role}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Email Verified: {u.emailVerified ? 'Yes' : 'No'}</span>
                    <span>Status: <strong>{u.accountStatus}</strong></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {u.role === 'seller' && (
                      <button
                        type="button"
                        onClick={() => setTab('sellers')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white font-semibold"
                      >
                        Review Seller
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <select
                        value={u.accountStatus}
                        onChange={async (e) => {
                          try {
                            await apiRequest(`/api/admin/users/${u.id}/status`, {
                              method: 'PATCH',
                              body: { accountStatus: e.target.value },
                            });
                            showSuccess(`Updated ${u.email} status.`);
                            await loadAdminData();
                          } catch (err: any) {
                            showError(err?.message || 'Could not update account status.');
                          }
                        }}
                        className="min-h-[36px] px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      >
                        <option value="Active">Active</option>
                        <option value="Restricted">Restricted</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Buyer First Name / Seller Business</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Verified</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => {
                  const accountDisplayName =
                    u.role === 'seller'
                      ? u.businessName || getFirstName(u.fullName)
                      : getFirstName(u.fullName);
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-semibold text-[#0B1F3A]">{accountDisplayName}</td>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3 capitalize">{u.role}</td>
                      <td className="px-4 py-3">{u.emailVerified ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 font-semibold">{u.accountStatus}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {u.role === 'seller' && (
                          <button
                            type="button"
                            onClick={() => setTab('sellers')}
                            className="px-2.5 py-1 rounded border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white font-semibold"
                          >
                            Review
                          </button>
                        )}
                        {u.role !== 'admin' && (
                          <select
                            value={u.accountStatus}
                            onChange={async (e) => {
                              try {
                                await apiRequest(`/api/admin/users/${u.id}/status`, {
                                  method: 'PATCH',
                                  body: { accountStatus: e.target.value },
                                });
                                showSuccess(`Updated ${u.email} status.`);
                                await loadAdminData();
                              } catch (err: any) {
                                showError(err?.message || 'Could not update account status.');
                              }
                            }}
                            className="px-2 py-1 border border-slate-300 rounded text-xs"
                          >
                            <option value="Active">Active</option>
                            <option value="Restricted">Restricted</option>
                            <option value="Suspended">Suspended</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRODUCTS & CATEGORIES */}
      {tab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Manage Marketplace Categories
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiRequest('/api/admin/categories', {
                    method: 'POST',
                    body: { name: newCategoryName, description: newCategoryDesc },
                  });
                  setNewCategoryName('');
                  setNewCategoryDesc('');
                  showSuccess('Category added.');
                  await loadAdminData();
                } catch (err: any) {
                  showError(err?.message || 'Could not add category.');
                }
              }}
              className="space-y-2"
            >
              <input
                type="text"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="text"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                placeholder="Short description"
                className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
              >
                Add Category
              </button>
            </form>

            <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2">
              {categoriesList.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiRequest(`/api/admin/categories/${c.id}`, {
                          method: 'PATCH',
                          body: { active: !c.active },
                        });
                        await loadAdminData();
                      } catch (err: any) {
                        showError(err?.message || 'Could not update category.');
                      }
                    }}
                    className={`min-h-[32px] px-2 font-semibold ${
                      c.active ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Product Moderation ({productsList.length})
            </h2>
            {productsList.length === 0 ? (
              <p className="text-sm text-slate-500">No products created by sellers yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {productsList.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#0B1F3A] break-words">{p.title}</p>
                      <p className="text-slate-500">
                        {p.sellerBusinessName} · {p.categoryName} · GHS {Number(p.price).toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiRequest(`/api/admin/products/${p.id}/moderate`, {
                            method: 'PATCH',
                            body: p.moderatedReason
                              ? { clearModeration: true }
                              : { moderatedReason: 'Moderated by administrator' },
                          });
                          showSuccess('Product moderation updated.');
                          await loadAdminData();
                        } catch (err: any) {
                          showError(err?.message || 'Could not moderate product.');
                        }
                      }}
                      className={`self-start sm:self-auto min-h-[36px] px-3 py-1.5 rounded-lg font-semibold shrink-0 ${
                        p.moderatedReason
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {p.moderatedReason ? 'Restore Listing' : 'Hide Listing'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOMEPAGE PROMOTIONS */}
      {tab === 'promotions' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Seller Homepage Promotions Review ({promotionsList.length})
          </h2>
          {promotionsList.length === 0 ? (
            <p className="text-sm text-slate-500">No seller promotions submitted.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {promotionsList.map((pr) => (
                <div
                  key={pr.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[#0B1F3A]">{pr.title}</p>
                    <p className="text-slate-600 break-words">
                      {pr.sellerBusinessName} · {pr.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-semibold text-[#F97316]">{pr.status}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiRequest(`/api/admin/promotions/${pr.id}/review`, {
                            method: 'PATCH',
                            body: { status: 'Published' },
                          });
                          showSuccess('Promotion published.');
                          await loadAdminData();
                        } catch (err: any) {
                          showError(err?.message || 'Could not publish promotion.');
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiRequest(`/api/admin/promotions/${pr.id}/review`, {
                            method: 'PATCH',
                            body: { status: 'Rejected' },
                          });
                          showSuccess('Promotion rejected.');
                          await loadAdminData();
                        } catch (err: any) {
                          showError(err?.message || 'Could not reject promotion.');
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-300 text-red-700 font-semibold"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ORDERS & PAYMENTS */}
      {tab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Order & Manual Payment Oversight
            </h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search AM... code"
                  className="w-full sm:w-56 min-h-[38px] pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => loadAdminData()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold shrink-0"
              >
                Search
              </button>
            </div>
          </div>

          {ordersList.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">
              No matching orders found.
            </div>
          ) : (
            <>
              {/* Mobile Order Cards */}
              <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                {ordersList.map((o) => (
                  <div key={o.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#0B1F3A]">
                        {o.orderReference}
                      </span>
                      <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                        GHS {Number(o.totalAmount).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      Buyer: <strong>{getFirstName(o.buyerName)}</strong> → Seller:{' '}
                      <strong>{o.sellerBusinessName}</strong>
                    </p>
                    <p className="text-slate-500">Order: {o.orderStatus}</p>
                    <p className="font-semibold text-[#F97316]">Payment: {o.paymentStatus}</p>
                  </div>
                ))}
              </div>

              {/* Desktop Orders Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Reference</th>
                      <th className="px-3 py-2.5 font-semibold">Buyer</th>
                      <th className="px-3 py-2.5 font-semibold">Seller</th>
                      <th className="px-3 py-2.5 font-semibold">Amount</th>
                      <th className="px-3 py-2.5 font-semibold">Order Status</th>
                      <th className="px-3 py-2.5 font-semibold">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ordersList.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2.5 font-mono font-bold text-[#0B1F3A]">
                          {o.orderReference}
                        </td>
                        <td className="px-3 py-2.5">{getFirstName(o.buyerName)}</td>
                        <td className="px-3 py-2.5">{o.sellerBusinessName}</td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">
                          GHS {Number(o.totalAmount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5">{o.orderStatus}</td>
                        <td className="px-3 py-2.5 font-semibold text-[#F97316]">
                          {o.paymentStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* COMPLAINTS */}
      {tab === 'complaints' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Marketplace Complaints & Feedback ({complaintsList.length})
          </h2>
          {complaintsList.length === 0 ? (
            <p className="text-sm text-slate-500">No complaints filed yet.</p>
          ) : (
            <div className="space-y-3">
              {complaintsList.map((c) => (
                <div key={c.id} className="p-3.5 sm:p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong className="text-[#0B1F3A]">{c.subject}</strong>
                    <span className="font-semibold text-[#F97316]">{c.status}</span>
                  </div>
                  <p className="text-slate-600">
                    From:{' '}
                    {c.reporterRole === 'seller'
                      ? c.reporterBusinessName || getFirstName(c.reporterName)
                      : getFirstName(c.reporterName)}{' '}
                    {c.orderReference ? `· Order ${c.orderReference}` : ''}
                  </p>
                  <p className="text-slate-800 break-words">{c.message}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['Open', 'Under Review', 'Resolved', 'Closed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={async () => {
                          try {
                            await apiRequest(`/api/admin/complaints/${c.id}`, {
                              method: 'PATCH',
                              body: { status: st, adminNotes: `Marked ${st} by admin.` },
                            });
                            showSuccess('Complaint record updated.');
                            await loadAdminData();
                          } catch (err: any) {
                            showError(err?.message || 'Could not update complaint.');
                          }
                        }}
                        className={`min-h-[34px] px-2.5 py-1 rounded border font-semibold ${
                          c.status === st
                            ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                            : 'border-slate-300 text-slate-700'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
