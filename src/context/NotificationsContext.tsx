import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { AIDOMART_ASSETS } from '../constants/assets';
import { useAuth } from './AuthContext';
import type { AppNotification } from '../types/marketplace';

export type DesktopNotifPermission = NotificationPermission | 'unsupported';

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  readCount: number;
  totalCount: number;
  popupNotifications: AppNotification[];
  desktopPermission: DesktopNotifPermission;
  dismissPopup: (id: number) => void;
  requestDesktopPermission: () => Promise<DesktopNotifPermission>;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  testNotificationSound: () => Promise<{ ok: boolean; message: string }>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const PLAYED_KEY = 'aidomart_played_notification_ids';

function loadPlayedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(PLAYED_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function savePlayedIds(set: Set<number>) {
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(PLAYED_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function parseUtcTimestamp(raw: string): number {
  if (!raw) return 0;
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInitialDesktopPermission(): DesktopNotifPermission {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState({ unreadCount: 0, readCount: 0, totalCount: 0 });
  const [popupNotifications, setPopupNotifications] = useState<AppNotification[]>([]);
  const [desktopPermission, setDesktopPermission] = useState<DesktopNotifPermission>(
    getInitialDesktopPermission
  );

  const playedIdsRef = useRef<Set<number>>(loadPlayedIds());
  const initialLoadRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Unlock browser audio on the very first user gesture so background chimes can ring freely
  useEffect(() => {
    const unlockAudio = () => {
      ensureAudioContext();
      if (!audioRef.current) {
        const audio = new Audio(AIDOMART_ASSETS.notificationSound);
        audio.preload = 'auto';
        audioRef.current = audio;
      }
      if (typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
        setDesktopPermission(window.Notification.permission);
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [ensureAudioContext]);

  const playSynthesizedChime = useCallback(async (): Promise<boolean> => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const now = ctx.currentTime;
      const playTone = (freq: number, startOffset: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.24, now + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      playTone(880, 0, 0.22);
      playTone(1174.66, 0.14, 0.34);
      return true;
    } catch {
      return false;
    }
  }, [ensureAudioContext]);

  const playSoundOnce = useCallback(async (): Promise<{ ok: boolean; source: 'mp3' | 'chime' | 'none' }> => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(AIDOMART_ASSETS.notificationSound);
        audioRef.current.preload = 'auto';
      }
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      return { ok: true, source: 'mp3' };
    } catch {
      const chimeOk = await playSynthesizedChime();
      return { ok: chimeOk, source: chimeOk ? 'chime' : 'none' };
    }
  }, [playSynthesizedChime]);

  const showDesktopPopup = useCallback((n: AppNotification) => {
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return;
    if (window.Notification.permission !== 'granted') return;
    try {
      const notif = new window.Notification(`AIDOOMART · ${n.title}`, {
        body: n.message,
        tag: `aidomart-notif-${n.id}`,
      });
      notif.onclick = () => {
        window.focus();
        if (n.link) {
          window.history.pushState({}, '', n.link);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        notif.close();
      };
    } catch {
      // ignore if OS/iframe blocks Notification constructor
    }
  }, []);

  const dismissPopup = useCallback((id: number) => {
    setPopupNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const requestDesktopPermission = useCallback(async (): Promise<DesktopNotifPermission> => {
    ensureAudioContext();
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      setDesktopPermission('unsupported');
      return 'unsupported';
    }
    try {
      const perm = await window.Notification.requestPermission();
      setDesktopPermission(perm);
      return perm;
    } catch {
      const current = window.Notification.permission;
      setDesktopPermission(current);
      return current;
    }
  }, [ensureAudioContext]);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setCounts({ unreadCount: 0, readCount: 0, totalCount: 0 });
      setPopupNotifications([]);
      initialLoadRef.current = true;
      return;
    }
    try {
      const data = await apiRequest<{
        notifications: AppNotification[];
        unreadCount?: number;
        readCount?: number;
        totalCount?: number;
      }>('/api/notifications');
      const list = data.notifications || [];
      setNotifications(list);
      const unread = data.unreadCount ?? list.filter((n) => !n.isRead).length;
      const read = data.readCount ?? list.filter((n) => n.isRead).length;
      setCounts({
        unreadCount: unread,
        readCount: read,
        totalCount: data.totalCount ?? unread + read,
      });

      const now = Date.now();
      const unreadNew = list.filter((n) => !n.isRead && !playedIdsRef.current.has(n.id));
      if (unreadNew.length > 0) {
        // Trigger sound + popups for any notification arriving after load,
        // OR any brand-new notification created within the last 25 seconds
        const freshToAlert = initialLoadRef.current
          ? unreadNew.filter((n) => {
              const ts = parseUtcTimestamp(n.createdAt);
              return ts > 0 && now - ts < 25000;
            })
          : unreadNew;

        if (freshToAlert.length > 0) {
          if (user.soundEnabled) {
            await playSoundOnce();
          }
          setPopupNotifications((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const additions = freshToAlert.filter((n) => !existingIds.has(n.id));
            return [...additions, ...prev].slice(0, 4);
          });
          for (const n of freshToAlert) {
            showDesktopPopup(n);
          }
        }

        for (const n of unreadNew) {
          playedIdsRef.current.add(n.id);
        }
        savePlayedIds(playedIdsRef.current);
      }
      initialLoadRef.current = false;
    } catch {
      // ignore transient poll errors
    }
  }, [user, playSoundOnce, showDesktopPopup]);

  useEffect(() => {
    initialLoadRef.current = true;
    refreshNotifications();
    if (!user) return;
    const timer = window.setInterval(refreshNotifications, 4000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [user, refreshNotifications]);

  const markAsRead = async (id: number) => {
    dismissPopup(id);
    const res = await apiRequest<{
      unreadCount?: number;
      readCount?: number;
      totalCount?: number;
    }>(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    if (typeof res.unreadCount === 'number' && typeof res.readCount === 'number') {
      setCounts({
        unreadCount: res.unreadCount,
        readCount: res.readCount,
        totalCount: res.totalCount ?? res.unreadCount + res.readCount,
      });
    } else {
      setCounts((c) => ({
        unreadCount: Math.max(0, c.unreadCount - 1),
        readCount: c.readCount + 1,
        totalCount: c.totalCount,
      }));
    }
  };

  const markAllAsRead = async () => {
    setPopupNotifications([]);
    const res = await apiRequest<{
      unreadCount?: number;
      readCount?: number;
      totalCount?: number;
    }>('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (typeof res.unreadCount === 'number' && typeof res.readCount === 'number') {
      setCounts({
        unreadCount: res.unreadCount,
        readCount: res.readCount,
        totalCount: res.totalCount ?? res.unreadCount + res.readCount,
      });
    } else {
      setCounts((c) => ({
        unreadCount: 0,
        readCount: c.totalCount,
        totalCount: c.totalCount,
      }));
    }
  };

  const testNotificationSound = async () => {
    const res = await playSoundOnce();
    if (res.ok) {
      return {
        ok: true,
        message: 'Notification alert played successfully.',
      };
    }
    return {
      ok: false,
      message: 'Browser audio is muted or blocked. Click anywhere on the page and try again.',
    };
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount: counts.unreadCount,
        readCount: counts.readCount,
        totalCount: counts.totalCount,
        popupNotifications,
        desktopPermission,
        dismissPopup,
        requestDesktopPermission,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        testNotificationSound,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
