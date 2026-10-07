"use client";

import { useEffect, useState, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import SignInPage from '@/components/auth/SignInPage';
import AppShell from '@/components/layout/AppShell';
import { getCurrentUser, getCachedUser, SessionCheckUnreachableError, type AuthUser } from '@/services/auth';
import { getToken } from '@/lib/api';
import { pushOnLogin } from '@/lib/pushSubscribe';
import { Loader2, WifiOff } from 'lucide-react';

// Retried with backoff while the server is unreachable — the session itself is fine,
// so we keep trying quietly instead of giving up and signing the user out.
const RECONNECT_DELAYS_MS = [3000, 8000, 20000, 45000, 90000];

function loginPayload(user: AuthUser) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || '',
    status: user.status,
    department: user.department,
    isActive: user.is_active === 1,
  };
}

export default function Home() {
  const { state, dispatch } = useAppContext();
  const [checking, setChecking] = useState(true);
  // True once we're in (possibly optimistically, from cache) while the real check keeps retrying
  // in the background — distinct from `checking`, which only covers the very first attempt.
  const [reconnecting, setReconnecting] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const signOut = async () => {
      try {
        const { forceLogout } = await import('@/services/auth');
        await forceLogout();
      } catch {}
      if (!cancelledRef.current) dispatch({ type: 'LOGOUT' });
    };

    const applyUser = (user: AuthUser) => {
      dispatch({ type: 'LOGIN', payload: loginPayload(user) });
      // Send admin users directly to the admin portal on every load
      if (user.role === 'admin') dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'admin' });
      pushOnLogin(String(user.id));
    };

    // Keeps trying /auth/me in the background without ever signing the user out for it — only
    // a real 401/403 (surfaced as getCurrentUser() returning null) ends the retry loop with a logout.
    const retryInBackground = async () => {
      for (const delay of RECONNECT_DELAYS_MS) {
        await new Promise(r => setTimeout(r, delay));
        if (cancelledRef.current) return;
        try {
          const user = await getCurrentUser();
          if (cancelledRef.current) return;
          if (user) {
            applyUser(user); // refresh with the real data now that the server answered
            setReconnecting(false);
            return;
          }
          // Genuinely rejected (not just unreachable) — now it's correct to sign out
          setReconnecting(false);
          await signOut();
          return;
        } catch (err) {
          if (!(err instanceof SessionCheckUnreachableError)) {
            setReconnecting(false);
            await signOut();
            return;
          }
          // still unreachable — keep retrying
        }
      }
      // Out of retries — leave them logged in (their token is still valid); the normal
      // socket-reconnect / visibility-refetch paths will pick it up once the server is back.
      if (!cancelledRef.current) setReconnecting(false);
    };

    const restoreSession = async () => {
      try {
        const user = await getCurrentUser();
        if (user) applyUser(user);
        else await signOut(); // server explicitly said this token is no longer valid
      } catch (err) {
        if (err instanceof SessionCheckUnreachableError) {
          // Couldn't reach the server at all — do NOT sign out. If we have a cached profile and
          // a token, use the app immediately and keep confirming quietly in the background.
          const cached = getCachedUser();
          if (cached && getToken()) {
            applyUser(cached);
            setReconnecting(true);
            retryInBackground();
          } else {
            // First-ever load on this device with no connection — nothing to show yet, but this
            // is a connectivity problem, not a logout, so don't touch LOGOUT/dispatch here.
            setReconnecting(true);
            retryInBackground();
          }
        } else {
          await signOut();
        }
      }
      if (!cancelledRef.current) setChecking(false);
    };

    restoreSession();
    return () => { cancelledRef.current = true; };
  }, [dispatch]);

  if (checking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!state.isAuthenticated) {
    // Not logged in AND we couldn't reach the server to check a cached session either —
    // tell them it's a connection problem, not prompt them to sign in again for nothing.
    if (reconnecting) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-background text-center px-6">
          <WifiOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Can't reach the server. Retrying…</p>
        </div>
      );
    }
    return <SignInPage />;
  }

  return (
    <>
      <AppShell />
      {reconnecting && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[var(--z-toast)] flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border shadow-lg text-xs font-medium text-muted-foreground animate-in fade-in slide-in-from-bottom-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reconnecting…
        </div>
      )}
    </>
  );
}
