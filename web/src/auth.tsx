import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getTokens, setSessionExpiredHandler, setTokens } from './api/client';
import type { Profile, Tokens } from './api/types';

interface AuthState {
  user: Profile | null;
  ready: boolean;
  signIn: (tokens: Tokens, user: Profile) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export const isStaff = (u: Profile | null) => !!u && u.role !== 'OWNER';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      qc.clear();
    });
    if (!getTokens()) {
      setReady(true);
      return;
    }
    api
      .get<Profile>('/me')
      .then(setUser)
      .catch(() => setTokens(null))
      .finally(() => setReady(true));
  }, [qc]);

  const signIn = useCallback((tokens: Tokens, profile: Profile) => {
    setTokens(tokens);
    setUser(profile);
  }, []);

  const signOut = useCallback(async () => {
    const t = getTokens();
    if (t) await api.post('/auth/logout', { refreshToken: t.refreshToken }).catch(() => undefined);
    setTokens(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
