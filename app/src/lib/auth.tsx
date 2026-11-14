import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { LoginResponse, MeView } from '../../../lib/types';
import { api, setOnUnauthorized, setToken } from './api';
import { storage } from './storage';

const KEY = 'bom_session';

interface AuthState {
  me: MeView | null;
  ready: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<MeView | null>;
  setMe: (me: MeView) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeView | null>(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(async () => {
    setToken(null);
    setMe(null);
    await storage.remove(KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => void clear());
    (async () => {
      try {
        const saved = await storage.get(KEY);
        if (saved) {
          setToken(saved);
          setMe(await api<MeView>('/me'));
        }
      } catch {
        /* offline or expired: stay logged out until they retry */
      } finally {
        setReady(true);
      }
    })();
    return () => setOnUnauthorized(null);
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      ready,
      setMe,
      login: async (username) => {
        const r = await api<LoginResponse>('/auth/login', { body: { username } });
        setToken(r.token);
        await storage.set(KEY, r.token);
        setMe(r.me);
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        await clear();
      },
      refresh: async () => {
        try {
          const fresh = await api<MeView>('/me');
          setMe(fresh);
          return fresh;
        } catch {
          return null;
        }
      },
    }),
    [me, ready, clear]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
