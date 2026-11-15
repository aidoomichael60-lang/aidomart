import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  FileText,
  Lock,
  Mail,
  Megaphone,
  MessageSquareWarning,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { getFirstName, useLoginGreeting } from '../utils/greeting';

type AdminTab =
  | 'overview'
  | 'sellers'
  | 'users'
  | 'products'
  | 'promotions'
  | 'orders'
  | 'complaints';

export function AdminDashboard() {
  const { user, setAuthenticatedUser, refreshUser } = useAuth();
  const { greeting } = useLoginGreeting(user);
  const [tab, setTab] = useState<AdminTab>('overview');

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

  const [statusBanner, setStatusBanner] = useState('');

  const loadAdminData = async () => {
    try {
      const [ov, sel, usr, prd, cats, prm, ord, cmp] = await Promise.all([
        apiRequest('/api/admin/overview'),
        apiRequest<{ sellers: any[] }>('/api/admin/sellers'),
        apiRequest<{ users: any[] }>('/api/admin/users'),
        apiRequest<{ products: any[] }>('/api/admin/products'),
        apiRequest<{ categories: any[] }>('/api/admin/categories'),
        apiRequest<{ promotions: any[] }>('/api/admin/promotions'),
        apiRequest<{ orders: any[] }>(
          `/api/admin/orders${orderSearch ? `?ref=${encodeURIComponent(orderSearch)}` : ''}`
        ),
        apiRequest<{ complaints: any[] }>('/api/admin/complaints'),
      ]);
      setOverview(ov);
      const sellerRows = sel.sellers || [];
      setSellers(sellerRows);
      const initForms: typeof reviewForms = {};
      for (const s of sellerRows) {
        initForms[s.id] = {
          applicationStatus: s.applicationStatus,
          verifiedBadge: Boolean(s.verifiedBadge),
          physicalInspectionConducted: Boolean(s.physicalInspectionConducted),
          physicalInspectionDate: s.physicalInspectionDate || new Date().toISOString().slice(0, 10),
          physicalInspectionNotes: s.physicalInspectionNotes || '',
          adminFeedback: s.adminFeedback || '',
        };
      }
      setReviewForms(initForms);
      setUsersList(usr.users || []);
      setProductsList(prd.products || []);
      setCategoriesList(cats.categories || []);
      setPromotionsList(prm.promotions || []);
      setOrdersList(ord.orders || []);
      setComplaintsList(cmp.complaints || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdminData();
    }
  }, [user?.id, user?.role]);

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
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-5 shadow-sm">
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
              className="w-full py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-sm font-semibold"
            >
              Sign In as Administrator
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview & Brevo Logs', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'sellers', label: 'Seller Verification', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'users', label: 'Accounts', icon: <Users className="w-4 h-4" /> },
    { id: 'products', label: 'Products & Categories', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'promotions', label: 'Homepage Promotions', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Payments', icon: <Package className="w-4 h-4" /> },
    { id: 'complaints', label: 'Complaints', icon: <MessageSquareWarning className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
            AIDOMART Private Admin Dashboard
          </h1>
          <p className="text-sm font-semibold text-[#F97316] mt-0.5">{greeting}</p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        {statusBanner && (
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            {statusBanner}
          </span>
        )}
      </div>

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

      {/* OVERVIEW & BREVO EMAIL LOGS */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Buyers</p>
              <p className="text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.totalBuyers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Sellers (Approved / Total)</p>
              <p className="text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.approvedSellers} / {overview.counts.totalSellers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Pending Seller Reviews</p>
              <p className="text-2xl font-mono font-bold text-[#F97316] tabular-nums mt-1">
                {overview.counts.pendingSellers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Published Products</p>
              <p className="text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {overview.counts.publishedProducts}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Confirmed Payment Volume</p>
              <p className="text-xl font-mono font-bold text-emerald-700 tabular-nums mt-1">
                GHS {Number(overview.counts.confirmedPaymentVolume || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Platform Configuration */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Platform & Security Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-[#0B1F3A]">Promo Code Creator Permission Policy (§13)</p>
                <p className="text-slate-600">
                  Confirm whether promo-code creation is permitted for buyers, sellers, or both:
                </p>
                <select
                  value={overview.settings.promoCreatorPolicy}
                  onChange={async (e) => {
                    await apiRequest('/api/admin/settings', {
                      method: 'PUT',
                      body: { promoCreatorPolicy: e.target.value },
                    });
                    setStatusBanner('Promo creator policy updated.');
                    await loadAdminData();
                    await refreshUser();
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="buyer">Buyers Only (As specified in request)</option>
                  <option value="seller">Sellers Only</option>
                  <option value="both">Both Buyers and Sellers</option>
                </select>
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
                      await apiRequest('/api/admin/settings', {
                        method: 'PUT',
                        body: { requireLoginEmailOtp: e.target.checked },
                      });
                      setStatusBanner('Login email OTP setting updated.');
                      await loadAdminData();
                    }}
                  />
                  <span>Require email OTP verification on Buyer & Seller logins</span>
                </label>
              </div>
            </div>
          </div>

          {/* Brevo Email Delivery Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#F97316]" />
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Recent Brevo Transactional Email Events
              </h2>
            </div>
            <div className="overflow-x-auto">
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
                  {overview.emailLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No email events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    overview.emailLogs.map((log: any) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2.5">{log.recipientEmail}</td>
                        <td className="px-4 py-2.5 font-mono">{log.eventType}</td>
                        <td className="px-4 py-2.5 font-semibold">
                          <span
                            className={
                              log.status === 'sent'
                                ? 'text-emerald-700'
                                : 'text-red-700'
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SELLER VERIFICATION */}
      {tab === 'sellers' && (
        <div className="space-y-4">
          {sellers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No seller applications submitted yet.
            </div>
          ) : (
            sellers.map((s) => {
              const form = reviewForms[s.id] || {
                applicationStatus: s.applicationStatus,
                verifiedBadge: s.verifiedBadge,
                physicalInspectionConducted: s.physicalInspectionConducted,
                physicalInspectionDate: '',
                physicalInspectionNotes: '',
                adminFeedback: '',
              };
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                          {s.businessName}
                        </h3>
                        {s.verifiedBadge && <VerifiedBadge />}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Legal Name: <strong>{s.legalName}</strong> · {s.email} ({s.emailVerified ? 'Email Verified' : 'Email Unverified'}) · Tel: {s.phone}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Address: {s.physicalAddress} {s.locationCity ? `(${s.locationCity})` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#F97316]">{s.applicationStatus}</span>
                  </div>

                  <p className="text-xs text-slate-700">{s.description}</p>

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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-[#0B1F3A]"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#F97316]" />
                            <span>{doc.originalName}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No verification documents uploaded yet.</p>
                    )}
                  </div>

                  {/* Admin Verification Decision Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Application Status
                        </label>
                        <select
                          value={form.applicationStatus}
                          onChange={(e) =>
                            setReviewForms({
                              ...reviewForms,
                              [s.id]: { ...form, applicationStatus: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="Pending Review">Pending Review</option>
                          <option value="Additional Information Required">Additional Information Required</option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Suspended">Suspended</option>
                        </select>
                      </div>

                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 font-semibold text-[#0B1F3A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.verifiedBadge}
                            disabled={form.applicationStatus !== 'Approved'}
                            onChange={(e) =>
                              setReviewForms({
                                ...reviewForms,
                                [s.id]: { ...form, verifiedBadge: e.target.checked },
                              })
                            }
                          />
                          <span>Grant Verified Seller Badge</span>
                        </label>
                      </div>

                      <div className="flex items-end pb-2">
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
                          className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
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
                          className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
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
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />

                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/sellers/${s.id}/review`, {
                          method: 'POST',
                          body: form,
                        });
                        setStatusBanner(`Updated ${s.businessName} to ${form.applicationStatus}.`);
                        await loadAdminData();
                      }}
                      className="px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white font-semibold"
                    >
                      Save Verification Decision
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
          <div className="overflow-x-auto">
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
                      <td className="px-4 py-3 text-right">
                        {u.role !== 'admin' && (
                          <select
                            value={u.accountStatus}
                            onChange={async (e) => {
                              await apiRequest(`/api/admin/users/${u.id}/status`, {
                                method: 'PATCH',
                                body: { accountStatus: e.target.value },
                              });
                              setStatusBanner(`Updated ${u.email} status.`);
                              await loadAdminData();
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Manage Marketplace Categories
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest('/api/admin/categories', {
                  method: 'POST',
                  body: { name: newCategoryName, description: newCategoryDesc },
                });
                setNewCategoryName('');
                setNewCategoryDesc('');
                await loadAdminData();
              }}
              className="space-y-2"
            >
              <input
                type="text"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="text"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                placeholder="Short description"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
              >
                Add Category
              </button>
            </form>

            <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2">
              {categoriesList.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/admin/categories/${c.id}`, {
                        method: 'PATCH',
                        body: { active: !c.active },
                      });
                      await loadAdminData();
                    }}
                    className={`font-semibold ${c.active ? 'text-emerald-700' : 'text-slate-400'}`}
                  >
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Product Moderation ({productsList.length})
            </h2>
            {productsList.length === 0 ? (
              <p className="text-sm text-slate-500">No products created by sellers yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {productsList.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#0B1F3A]">{p.title}</p>
                      <p className="text-slate-500">
                        {p.sellerBusinessName} · {p.categoryName} · GHS {Number(p.price).toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/products/${p.id}/moderate`, {
                          method: 'PATCH',
                          body: p.moderatedReason
                            ? { clearModeration: true }
                            : { moderatedReason: 'Moderated by administrator' },
                        });
                        await loadAdminData();
                      }}
                      className={`px-3 py-1.5 rounded font-semibold ${
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
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Seller Homepage Promotions Review ({promotionsList.length})
          </h2>
          {promotionsList.length === 0 ? (
            <p className="text-sm text-slate-500">No seller promotions submitted.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {promotionsList.map((pr) => (
                <div key={pr.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#0B1F3A]">{pr.title}</p>
                    <p className="text-slate-600">
                      {pr.sellerBusinessName} · {pr.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F97316]">{pr.status}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/promotions/${pr.id}/review`, {
                          method: 'PATCH',
                          body: { status: 'Published' },
                        });
                        await loadAdminData();
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/promotions/${pr.id}/review`, {
                          method: 'PATCH',
                          body: { status: 'Rejected' },
                        });
                        await loadAdminData();
                      }}
                      className="px-2.5 py-1 rounded border border-red-300 text-red-700 font-semibold"
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
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Order & Manual Payment Oversight
            </h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search ADM- reference..."
                  className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <button
                type="button"
                onClick={loadAdminData}
                className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
              >
                Search
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                {ordersList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  ordersList.map((o) => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COMPLAINTS */}
      {tab === 'complaints' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Marketplace Complaints & Feedback ({complaintsList.length})
          </h2>
          {complaintsList.length === 0 ? (
            <p className="text-sm text-slate-500">No complaints filed yet.</p>
          ) : (
            <div className="space-y-3">
              {complaintsList.map((c) => (
                <div key={c.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex justify-between">
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
                  <p className="text-slate-800">{c.message}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['Open', 'Under Review', 'Resolved', 'Closed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/complaints/${c.id}`, {
                            method: 'PATCH',
                            body: { status: st, adminNotes: `Marked ${st} by admin.` },
                          });
                          await loadAdminData();
                        }}
                        className={`px-2.5 py-1 rounded border font-semibold ${
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
