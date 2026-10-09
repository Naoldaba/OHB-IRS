'use client';

/**
 * Client-side auth context. The session lives in an httpOnly cookie the browser
 * can't read, so we learn the current user by calling `/auth/me`. Route guards
 * here are convenience only — the API enforces authorization server-side.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { RoleScope } from '@ohb/shared';
import { api, ApiError } from './api';
import type { AuthUser } from './types';

/** Login either completes, or signals that a second factor is still required. */
export type LoginOutcome =
  | { user: AuthUser }
  | { twoFactorRequired: true };

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  verifyTwoFactor: (code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isLab: boolean;
  /** Whether the signed-in user's role holds a capability (Phase 28). Convenience
   *  only — the API independently enforces every capability server-side. */
  can: (capability: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const res = await api.post<AuthUser | { twoFactorRequired: true }>(
        '/auth/login',
        { email, password },
      );
      if ('twoFactorRequired' in res) {
        // Credentials were correct; a second factor is still needed.
        return { twoFactorRequired: true };
      }
      setUser(res);
      return { user: res };
    },
    [],
  );

  const verifyTwoFactor = useCallback(async (code: string) => {
    const me = await api.post<AuthUser>('/auth/2fa/verify', { code });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      verifyTwoFactor,
      logout,
      refresh,
      // "Admin"/"lab" are really data-boundary (scope) distinctions, so custom
      // roles slot into the right portal automatically.
      isAdmin: user?.scope === RoleScope.BUREAU,
      isLab: user?.scope === RoleScope.LAB,
      can: (capability: string) => user?.capabilities?.includes(capability) ?? false,
    }),
    [user, loading, login, verifyTwoFactor, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Landing route for a scope after login (bureau → admin portal, lab → lab portal). */
export function homeFor(scope: RoleScope | string | undefined): string {
  return scope === RoleScope.BUREAU ? '/admin' : '/lab';
}

/** Where to send a signed-in user: the forced change-password page takes priority. */
export function landingFor(user: Pick<AuthUser, 'scope' | 'mustChangePassword'>): string {
  return user.mustChangePassword ? '/change-password' : homeFor(user.scope);
}
