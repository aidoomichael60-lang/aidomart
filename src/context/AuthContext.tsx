import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setCsrfToken } from '../lib/api';
import type { AuthUser } from '../types/marketplace';

interface PlatformSettings {
  promoCreatorPolicy: 'buyer' | 'seller' | 'both';
  requireLoginEmailOtp: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  settings: PlatformSettings;
  refreshUser: () => Promise<void>;
  setAuthenticatedUser: (user: AuthUser | null, csrfToken: string | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PlatformSettings>({
    promoCreatorPolicy: 'seller',
    requireLoginEmailOtp: true,
  });

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{
        user: AuthUser | null;
        csrfToken: string | null;
        settings: PlatformSettings;
      }>('/api/auth/me');
      setUser(data.user);
      setCsrfToken(data.csrfToken);
      if (data.settings) setSettings(data.settings);
    } catch (err: any) {
      // Only clear auth state if server explicitly indicates unauthorized/forbidden, not transient network blips
      if (err?.status === 401 || err?.status === 403) {
        setUser(null);
        setCsrfToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const setAuthenticatedUser = useCallback((nextUser: AuthUser | null, csrf: string | null) => {
    setUser(nextUser);
    setCsrfToken(csrf);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, settings, refreshUser, setAuthenticatedUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
