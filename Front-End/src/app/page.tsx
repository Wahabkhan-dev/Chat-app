"use client";

import { useEffect, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import SignInPage from '@/components/auth/SignInPage';
import AppShell from '@/components/layout/AppShell';
import { getCurrentUser } from '@/services/auth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { state, dispatch } = useAppContext();
  const [checking, setChecking] = useState(true);

  // On first load, check if there's a saved session
  useEffect(() => {
    const restoreSession = async () => {
      const user = await getCurrentUser();
      if (user) {
        dispatch({
          type: 'LOGIN',
          payload: {
            id: String(user.id),
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar || '',
            status: user.status,
            department: user.department,
            isActive: user.is_active === 1,
          },
        });
      }
      if (!user) {
        // Ensure local state and storage are cleared if server reports unauthorized
        try {
          const { forceLogout } = await import('@/services/auth');
          await forceLogout();
        } catch {}
        dispatch({ type: 'LOGOUT' });
      }
      setChecking(false);
    };

    restoreSession();
  }, [dispatch]);

  if (checking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return <SignInPage />;
  }

  return <AppShell />;
}
