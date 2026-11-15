import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../types/marketplace';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function getFirstName(fullName?: string | null): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'Member';
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function getAccountDisplayName(user?: AuthUser | null): string {
  if (!user) return 'Guest';
  if (user.role === 'seller') {
    const biz = user.sellerProfile?.businessName?.trim();
    if (biz) return biz;
  }
  return getFirstName(user.fullName);
}

export function useLoginGreeting(user?: AuthUser | null) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loginTimeMs = useMemo(() => {
    if (!user?.sessionCreatedAt) return null;
    const parsed = Date.parse(user.sessionCreatedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [user?.sessionCreatedAt]);

  useEffect(() => {
    setNowMs(Date.now());
    if (loginTimeMs === null) return;

    const elapsed = Date.now() - loginTimeMs;
    if (elapsed >= FIVE_MINUTES_MS) return;

    const remaining = Math.max(250, FIVE_MINUTES_MS - elapsed + 50);
    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
    }, remaining);

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [loginTimeMs]);

  const displayName = getAccountDisplayName(user);
  const isWelcomeWindow =
    loginTimeMs === null ? true : nowMs - loginTimeMs < FIVE_MINUTES_MS;

  return {
    displayName,
    salutation: isWelcomeWindow ? 'Welcome' : 'Hello',
    greeting: `${isWelcomeWindow ? 'Welcome' : 'Hello'}, ${displayName}`,
    isWelcomeWindow,
  };
}
