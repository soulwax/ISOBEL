// File: src/hooks/useAuth.ts

import { useState, useEffect } from 'react';
import { getSession, signIn, signOut } from '../lib/auth-client';

interface Session {
  user?: {
    id: string;
    name?: string;
    email?: string;
    image?: string;
  };
  expires?: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const sessionData = await getSession();
    setSession(sessionData);
    setLoading(false);
  };

  useEffect(() => {
    refreshSession();

    // Refresh session when window gains focus (e.g., after OAuth redirect)
    const handleFocus = () => {
      refreshSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleSignIn = async () => {
    await signIn();
  };

  const handleSignOut = async () => {
    await signOut();
    setSession(null);
  };

  return {
    session,
    loading,
    signIn: handleSignIn,
    signOut: handleSignOut,
    isAuthenticated: !!session?.user,
  };
}
