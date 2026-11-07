import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminUser, PublicUser, SessionResponse } from '@shared/types';
import { api, errorMessage, setPreviewAdminSession } from '@/lib/api';

interface AuthContextValue {
  customer: PublicUser | null;
  admin: AdminUser | null;
  adminConfigured: boolean;
  loading: boolean;
  refresh: () => Promise<SessionResponse>;
  logoutCustomer: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
  setCustomer: (customer: PublicUser | null) => void;
  setAdmin: (admin: AdminUser | null) => void;
  setAdminConfigured: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_SESSION: SessionResponse = { customer: null, admin: null, adminConfigured: false };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionResponse>('/api/auth/session');
      setSession(data);
      return data;
    } catch (error) {
      console.warn('Session check failed:', errorMessage(error));
      setSession(EMPTY_SESSION);
      return EMPTY_SESSION;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logoutCustomer = useCallback(async () => {
    await api.post<{ ok: boolean }>('/api/auth/logout');
    setSession((current) => ({ ...current, customer: null }));
  }, []);

  const logoutAdmin = useCallback(async () => {
    await api.post<{ ok: boolean }>('/api/admin/logout');
    setPreviewAdminSession(null);
    setSession((current) => ({ ...current, admin: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      customer: session.customer,
      admin: session.admin,
      adminConfigured: session.adminConfigured,
      loading,
      refresh,
      logoutCustomer,
      logoutAdmin,
      setCustomer: (customer) => setSession((current) => ({ ...current, customer })),
      setAdmin: (admin) => setSession((current) => ({ ...current, admin })),
      setAdminConfigured: (adminConfigured) => setSession((current) => ({ ...current, adminConfigured })),
    }),
    [session, loading, refresh, logoutCustomer, logoutAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
