import React, { useEffect } from 'react';
import { BellRing, ExternalLink, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';

interface NotificationPopupsProps {
  onNavigate: (path: string) => void;
}

function formatRelativeTime(raw: string): string {
  if (!raw) return 'Just now';
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function NotificationPopups({ onNavigate }: NotificationPopupsProps) {
  const { popupNotifications, dismissPopup, markAsRead } = useNotifications();

  useEffect(() => {
    if (popupNotifications.length === 0) return;
    const timers = popupNotifications.map((n) =>
      window.setTimeout(() => dismissPopup(n.id), 10000)
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [popupNotifications, dismissPopup]);

  if (popupNotifications.length === 0) return null;

  const visiblePopups = popupNotifications.slice(0, 3);

  return (
    <div
      aria-live="polite"
      className="fixed top-[68px] inset-x-3 sm:inset-x-auto sm:top-20 sm:right-4 z-50 sm:w-[380px] space-y-2 pointer-events-none"
    >
      {visiblePopups.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 border-l-4 border-l-[#F97316] rounded-xl shadow-lg p-3.5 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#F97316] flex items-center justify-center shrink-0 mt-0.5">
            <BellRing className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-[#0B1F3A] leading-snug break-words">
                {n.title}
              </p>
              <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                {formatRelativeTime(n.createdAt)}
              </span>
            </div>

            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words line-clamp-3">
              {n.message}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {n.link && (
                <button
                  type="button"
                  onClick={async () => {
                    await markAsRead(n.id);
                    onNavigate(n.link!);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0B1F3A] hover:bg-[#122E53] text-white text-[11px] font-semibold transition-colors"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => markAsRead(n.id)}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 transition-colors"
              >
                Mark read
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dismissPopup(n.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 w-7 h-7 rounded-md flex items-center justify-center shrink-0 -mr-1 -mt-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
