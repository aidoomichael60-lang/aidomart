import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Pencil,
  RotateCcw,
  StopCircle,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Product, PromoCode } from '../types/marketplace';

interface PromoManagerPanelProps {
  sellerProducts: Product[];
}

const CAMPAIGN_TYPES = [
  'General Promotion',
  'Special Occasion',
  'Anniversary',
  'Seasonal Sale',
  'Celebration',
  'First-Time Customers',
];

const QUICK_DISCOUNTS = [5, 10, 20, 30, 50];

function toDatetimeLocalValue(isoOrDate: string | Date): string {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PromoManagerPanel({ sellerProducts }: PromoManagerPanelProps) {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [campaignType, setCampaignType] = useState('General Promotion');
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [appliesTo, setAppliesTo] = useState<'all' | 'selected'>('all');
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [firstTimeOnly, setFirstTimeOnly] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [expiresAt, setExpiresAt] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  );

  const [productFilter, setProductFilter] = useState('');
  const [extendTargetId, setExtendTargetId] = useState<number | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPromos = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ promos: PromoCode[] }>('/api/promos');
      setPromos(data.promos || []);
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPromos();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCampaignType('General Promotion');
    setCode('');
    setDiscountPercent('10');
    setAppliesTo('all');
    setSelectedProductIds([]);
    setFirstTimeOnly(false);
    setStartsAt(toDatetimeLocalValue(new Date()));
    setExpiresAt(toDatetimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    setProductFilter('');
  };

  const startEdit = (p: PromoCode) => {
    setMessage('');
    setError('');
    setEditingId(p.id);
    setTitle(p.title || p.code);
    setCampaignType(p.campaignType || 'General Promotion');
    setCode(p.code);
    setDiscountPercent(String(p.discountPercent));
    setAppliesTo(p.appliesTo);
    setSelectedProductIds(p.productIds || []);
    setFirstTimeOnly(Boolean(p.firstTimeOnly));
    setStartsAt(toDatetimeLocalValue(p.startsAt));
    setExpiresAt(toDatetimeLocalValue(p.expiresAt));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const filteredSellerProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    if (!q) return sellerProducts;
    return sellerProducts.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.categoryName || '').toLowerCase().includes(q)
    );
  }, [sellerProducts, productFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (appliesTo === 'selected' && selectedProductIds.length === 0) {
      setError('Please select at least one product for this promotion, or switch to All Products.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        campaignType,
        code: code.trim().toUpperCase(),
        discountPercent: Number(discountPercent),
        appliesTo,
        productIds: appliesTo === 'selected' ? selectedProductIds : [],
        firstTimeOnly,
        startsAt: new Date(startsAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      };

      const res = editingId
        ? await apiRequest<{ message: string }>(`/api/promos/${editingId}`, {
            method: 'PUT',
            body: payload,
          })
        : await apiRequest<{ message: string }>('/api/promos', {
            method: 'POST',
            body: payload,
          });

      setMessage(res.message);
      resetForm();
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Could not save promotion.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ message: string }>(`/api/promos/${id}/end`, {
        method: 'PATCH',
      });
      setMessage(res.message);
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Could not deactivate promotion.');
    }
  };

  const handleReactivate = async (id: number) => {
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ message: string }>(`/api/promos/${id}/reactivate`, {
        method: 'PATCH',
      });
      setMessage(res.message);
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Could not reactivate promotion.');
    }
  };

  const handleExtend = async (id: number) => {
    if (!extendDate) return;
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ message: string }>(`/api/promos/${id}/extend`, {
        method: 'PATCH',
        body: { expiresAt: new Date(extendDate).toISOString() },
      });
      setMessage(res.message);
      setExtendTargetId(null);
      setExtendDate('');
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Could not extend expiry.');
    }
  };

  const statusBadgeClass = (status: PromoCode['effectiveStatus']) => {
    if (status === 'Active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Scheduled') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'Deactivated') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              {editingId ? 'Edit Store Promotion' : 'Create Store Promotion & Discount Code'}
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Promotions only apply when buyers enter your promotional code at checkout. Choose whether a code applies to all your products or only selected items, set start and expiry dates, and optionally restrict offers to first-time customers.
            </p>
          </div>
          <Tag className="w-5 h-5 text-[#F97316] shrink-0" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Promotion / Campaign Name *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 1st Anniversary Sale"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign Type / Occasion
              </label>
              <select
                value={campaignType}
                onChange={(e) => {
                  const next = e.target.value;
                  setCampaignType(next);
                  if (next === 'First-Time Customers') {
                    setFirstTimeOnly(true);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {CAMPAIGN_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Promotional Code *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingId)}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                placeholder="e.g. ANNIV50"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono uppercase disabled:bg-slate-100 disabled:text-slate-500"
              />
              {editingId && (
                <p className="text-[11px] text-slate-500 mt-0.5">Promo code cannot be renamed after creation.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Discount Percentage (%) *
              </label>
              <input
                type="number"
                min={1}
                max={90}
                step="0.5"
                required
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {QUICK_DISCOUNTS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountPercent(String(pct))}
                    className={`px-2 py-0.5 rounded border text-[11px] font-mono ${
                      Number(discountPercent) === pct
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date &amp; Time *
              </label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expiry Date &amp; Time *
              </label>
              <input
                type="datetime-local"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Product Targeting Options */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#0B1F3A]">Products Covered by This Promotion</span>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={firstTimeOnly}
                  onChange={(e) => setFirstTimeOnly(e.target.checked)}
                  className="rounded border-slate-300 text-[#F97316]"
                />
                <span>Restrict to First-Time Store Customers Only</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAppliesTo('all')}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  appliesTo === 'all'
                    ? 'border-[#0B1F3A] bg-white ring-1 ring-[#0B1F3A]'
                    : 'border-slate-200 bg-white/70 hover:bg-white'
                }`}
              >
                <p className="text-xs font-bold text-[#0B1F3A]">Option A: All Store Products</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Applies to every published product in your store when buyers enter the code.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAppliesTo('selected')}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  appliesTo === 'selected'
                    ? 'border-[#0B1F3A] bg-white ring-1 ring-[#0B1F3A]'
                    : 'border-slate-200 bg-white/70 hover:bg-white'
                }`}
              >
                <p className="text-xs font-bold text-[#0B1F3A]">
                  Option B: Selected Products Only ({selectedProductIds.length} chosen)
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Applies strictly to the specific products you check below. Excluded products stay at full price.
                </p>
              </button>
            </div>

            {appliesTo === 'selected' && (
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="search"
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    placeholder="Filter your products..."
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-full sm:w-64"
                  />
                  <span className="text-[11px] font-semibold text-slate-600">
                    {selectedProductIds.length} of {sellerProducts.length} selected
                  </span>
                </div>

                {sellerProducts.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    You do not have any products yet. Add products under the Products tab first, or choose Option A (All Store Products).
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {filteredSellerProducts.map((prod) => {
                      const checked = selectedProductIds.includes(prod.id);
                      return (
                        <label
                          key={prod.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 ${
                            checked ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProductSelection(prod.id)}
                              className="rounded border-slate-300 text-[#F97316]"
                            />
                            <span className="font-semibold text-[#0B1F3A] truncate">{prod.title}</span>
                          </div>
                          <span className="font-mono text-slate-600 shrink-0 tabular-nums">
                            GHS {prod.price.toFixed(2)}
                            {!prod.published ? ' (Unpublished)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white text-xs font-semibold"
            >
              {saving ? 'Saving...' : editingId ? 'Save Promotion Changes' : 'Create Promotion'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Edit</span>
              </button>
            )}
            {message && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{message}</span>
              </span>
            )}
            {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
          </div>
        </form>
      </div>

      {/* Promotions List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
          <h3 className="font-display text-base font-bold text-[#0B1F3A]">
            Your Store Promotions ({promos.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-4 sm:p-6 text-sm text-slate-500">Loading promotions...</div>
        ) : promos.length === 0 ? (
          <div className="p-4 sm:p-6 text-sm text-slate-500">
            No promotional codes created yet. Use the form above to launch a storewide or product-specific offer.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {promos.map((p) => (
              <div key={p.id} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm sm:text-base font-bold text-[#0B1F3A]">
                        {p.title || p.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-[#0B1F3A]">
                        {p.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 font-mono text-xs font-bold text-[#F97316] tabular-nums">
                        {p.discountPercent}% OFF
                      </span>
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${statusBadgeClass(p.effectiveStatus)}`}>
                        {p.effectiveStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span>Campaign: <strong>{p.campaignType}</strong></span>
                      {p.firstTimeOnly && (
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <Users className="w-3 h-3" />
                          First-time store customers only
                        </span>
                      )}
                      <span>
                        Usage: <strong className="tabular-nums">{p.usageCount}</strong>{' '}
                        {p.usageCount === 1 ? 'order' : 'orders'}
                        {p.totalDiscountGranted > 0 ? ` (GHS ${p.totalDiscountGranted.toFixed(2)} discounted)` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExtendTargetId(p.id);
                        setExtendDate(
                          toDatetimeLocalValue(
                            new Date(Math.max(Date.now(), new Date(p.expiresAt).getTime()) + 7 * 24 * 60 * 60 * 1000)
                          )
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      <CalendarClock className="w-3 h-3" />
                      <span>Extend</span>
                    </button>
                    {p.effectiveStatus !== 'Deactivated' ? (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700"
                      >
                        <StopCircle className="w-3 h-3" />
                        <span>Deactivate</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 text-xs font-semibold text-emerald-700"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reactivate</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div>
                    <span className="font-semibold text-slate-700">Products Covered: </span>
                    {p.appliesTo === 'all' ? (
                      <span>All eligible products in your store</span>
                    ) : p.products.length === 0 ? (
                      <span className="text-amber-700">No products currently selected</span>
                    ) : (
                      <span>
                        {p.products.length} selected ({p.products.map((prod) => prod.title).join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="tabular-nums">
                    <span className="font-semibold text-slate-700">Validity: </span>
                    {new Date(p.startsAt).toLocaleString()} &rarr; {new Date(p.expiresAt).toLocaleString()}
                    {p.extensionCount > 0 ? ` · Extended ${p.extensionCount}×` : ''}
                  </div>
                </div>

                {extendTargetId === p.id && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="datetime-local"
                      value={extendDate}
                      onChange={(e) => setExtendDate(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleExtend(p.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
                    >
                      Save New Expiry
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtendTargetId(null)}
                      className="px-2.5 py-1.5 text-xs text-slate-600 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
