import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';

export interface ReturnTo {
  from?: string;
}

/**
 * No user → login, remembering the full address (path + ?page=&search=). After sign-in the user
 * lands exactly where they were: list parameters from the URL survive a reload.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const state: ReturnTo = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return children;
}
