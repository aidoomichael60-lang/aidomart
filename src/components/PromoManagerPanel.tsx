import React, { useEffect, useState } from 'react';
import { CalendarClock, StopCircle, Tag } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { PromoCode } from '../types/marketplace';

export function PromoManagerPanel() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [policy, setPolicy] = useState('buyer');
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [extendTargetId, setExtendTargetId] = useState<number | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPromos = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ promos: PromoCode[]; allowed: boolean; policy: string }>(
        '/api/promos'
      );
      setPromos(data.promos || []);
      setAllowed(data.allowed);
      setPolicy(data.policy);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromos();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ message: string }>('/api/promos', {
        method: 'POST',
        body: {
          code,
          discountPercent: Number(discountPercent),
          startsAt: new Date(startsAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      });
      setMessage(res.message);
      setCode('');
      await loadPromos();
    } catch (err: any) {
      setError(err.message || 'Could not create promotional code.');
    }
  };

  const handleEnd = async (id: number) => {
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ message: string }>(`/api/promos/${id}/end`, {
        method: 'PATCH',
      });
      setMessage(res.message);
      await loadPromos();
    } catch (err: any) {
      setError(err.message);
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
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Promotional Codes & Percentage Discounts
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Active permission policy: <strong className="capitalize">{policy}</strong> accounts (configurable by Administrator). Codes automatically expire at their configured end date and time.
            </p>
          </div>
          <Tag className="w-5 h-5 text-[#F97316] shrink-0" />
        </div>

        {!allowed ? (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            Promo-code creation is currently restricted to <strong>{policy}</strong> dashboards per platform policy.
          </div>
        ) : (
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Promo Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SAVE15"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discount (%)</label>
              <input
                type="number"
                min={1}
                max={90}
                required
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date & Time</label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date & Time</label>
              <input
                type="datetime-local"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
              >
                Create Promotional Code
              </button>
              {message && <span className="text-xs text-emerald-700 font-medium">{message}</span>}
              {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
            </div>
          </form>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
          <h3 className="font-display text-base font-bold text-[#0B1F3A]">
            Active & Expired Promotions ({promos.length})
          </h3>
        </div>
        {loading ? (
          <div className="p-4 sm:p-6 text-sm text-slate-500">Loading promotions...</div>
        ) : promos.length === 0 ? (
          <div className="p-4 sm:p-6 text-sm text-slate-500">No promotional codes created yet.</div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-slate-200">
              {promos.map((p) => (
                <div key={p.id} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-sm text-[#0B1F3A]">{p.code}</span>
                      <span className="ml-2 font-mono font-semibold text-[#F97316] tabular-nums">
                        {p.discountPercent}% OFF
                      </span>
                    </div>
                    <span
                      className={`font-semibold ${
                        p.effectiveStatus === 'Active'
                          ? 'text-emerald-700'
                          : p.effectiveStatus === 'Scheduled'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {p.effectiveStatus}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-0.5 tabular-nums">
                    <p>Starts: {new Date(p.startsAt).toLocaleString()}</p>
                    <p>
                      Expires: {new Date(p.expiresAt).toLocaleString()}
                      {p.extensionCount > 0 ? ` · Extended ${p.extensionCount}×` : ''}
                    </p>
                  </div>
                  {extendTargetId === p.id ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="datetime-local"
                        value={extendDate}
                        onChange={(e) => setExtendDate(e.target.value)}
                        className="flex-1 min-w-[180px] min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleExtend(p.id)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtendTargetId(null)}
                        className="min-h-[38px] px-2.5 py-1.5 text-slate-600 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setExtendTargetId(p.id);
                          setExtendDate(
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              .toISOString()
                              .slice(0, 16)
                          );
                        }}
                        className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>Extend</span>
                      </button>
                      {p.effectiveStatus !== 'Ended' && (
                        <button
                          type="button"
                          onClick={() => handleEnd(p.id)}
                          className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 font-semibold text-red-700"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          <span>End</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Discount</th>
                    <th className="px-4 py-3 font-semibold">Starts</th>
                    <th className="px-4 py-3 font-semibold">Expires</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promos.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-bold text-[#0B1F3A]">{p.code}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{p.discountPercent}%</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">
                        {new Date(p.startsAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">
                        {new Date(p.expiresAt).toLocaleString()}
                        {p.extensionCount > 0 && (
                          <span className="block text-[11px] text-slate-400">
                            Extended {p.extensionCount}×
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            p.effectiveStatus === 'Active'
                              ? 'text-emerald-700'
                              : p.effectiveStatus === 'Scheduled'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {p.effectiveStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {extendTargetId === p.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="datetime-local"
                              value={extendDate}
                              onChange={(e) => setExtendDate(e.target.value)}
                              className="px-2 py-1 border border-slate-300 rounded text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleExtend(p.id)}
                              className="px-2 py-1 rounded bg-[#0B1F3A] text-white font-semibold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setExtendTargetId(null)}
                              className="px-2 py-1 text-slate-500"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setExtendTargetId(p.id);
                                setExtendDate(
                                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                    .toISOString()
                                    .slice(0, 16)
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700"
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span>Extend</span>
                            </button>
                            {p.effectiveStatus !== 'Ended' && (
                              <button
                                type="button"
                                onClick={() => handleEnd(p.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 font-semibold text-red-700"
                              >
                                <StopCircle className="w-3.5 h-3.5" />
                                <span>End</span>
                              </button>
                            )}
                          </>
                        )}
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
  );
}
