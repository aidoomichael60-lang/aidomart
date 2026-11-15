import React, { useEffect } from 'react';
import { BellRing, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationsContext';

interface NotificationPopupsProps {
  onNavigate: (path: string) => void;
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

  return (
    <div
      aria-live="polite"
      className="fixed top-20 right-4 z-50 w-80 sm:w-96 max-w-[calc(100vw-2rem)] space-y-2.5"
    >
      {popupNotifications.map((n) => (
        <div
          key={n.id}
          className="bg-white border-l-4 border-l-[#F97316] border border-slate-200 rounded-xl shadow-xl p-4 flex items-start gap-3"
        >
          <div className="p-2 rounded-lg bg-orange-50 text-[#F97316] shrink-0 mt-0.5">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#0B1F3A]">{n.title}</p>
            <p className="text-xs text-slate-600 mt-1 line-clamp-3">{n.message}</p>
            <div className="flex items-center gap-3 mt-2">
              {n.link && (
                <button
                  type="button"
                  onClick={async () => {
                    await markAsRead(n.id);
                    onNavigate(n.link!);
                  }}
                  className="text-[11px] font-semibold text-[#F97316] hover:underline"
                >
                  Open details
                </button>
              )}
              <button
                type="button"
                onClick={() => markAsRead(n.id)}
                className="text-[11px] font-medium text-slate-500 hover:text-[#0B1F3A]"
              >
                Mark as read
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismissPopup(n.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-700 p-1 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
