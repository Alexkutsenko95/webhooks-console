import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '../api';
import { api } from '../app/api';

interface AuthContextValue {
  user: User | null;
  /** Set when the session ended on its own (rotate failed) — the login screen explains why. */
  sessionExpired: boolean;
  // Function properties, not methods: consumers destructure them, and a method signature
  // would suggest they depend on `this`.
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /** Local logout: no user, no cached user data. Idempotent — parallel failures may call it twice. */
  const endLocalSession = useCallback(() => {
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(
    () =>
      api.client.onSessionExpired(() => {
        setSessionExpired(true);
        endLocalSession();
      }),
    [endLocalSession],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await api.auth.signIn(email, password);
    const me = await api.auth.me();
    setSessionExpired(false);
    setUser(me);
  }, []);

  const signOut = useCallback(async () => {
    // First stop everything still in flight: a list request that hits 401 after revoke would
    // otherwise try to rotate, fail, and show "session expired" to someone who just signed out.
    api.client.endSession();
    try {
      await api.auth.revoke();
    } finally {
      // Even if revoke fails (network), the user asked to leave — clear everything locally.
      setSessionExpired(false);
      endLocalSession();
    }
  }, [endLocalSession]);

  const value = useMemo(() => ({ user, sessionExpired, signIn, signOut }), [user, sessionExpired, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
