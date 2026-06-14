import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  signInWithEmail,
  signOut as signOutRequest,
  signUpWithEmail,
} from '../api/auth.api';
import { getProfileById } from '../api/profiles.api';
import type { UserProfile } from '../../types/profile';
import { AuthContext, type AuthContextValue } from './auth.context';

const hasAccessToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('access_token');
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(hasAccessToken);

  const applyProfile = useCallback((p: UserProfile | null) => {
    if (p) {
      setUser({ id: p.id, email: p.email });
      setProfile(p);
      return;
    }
    setUser(null);
    setProfile(null);
    localStorage.removeItem('access_token');
  }, []);

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      applyProfile(null);
      return;
    }

    try {
      const p = await getProfileById('me');
      applyProfile(p);
    } catch {
      applyProfile(null);
    }
  }, [applyProfile]);

  useEffect(() => {
    if (!hasAccessToken()) return;

    let cancelled = false;
    getProfileById('me')
      .then((p) => {
        if (cancelled) return;
        applyProfile(p);
      })
      .catch(() => {
        if (cancelled) return;
        applyProfile(null);
      })
      .finally(() => {
        if (!cancelled) setIsAuthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  const signIn = useCallback(
    async (payload: Parameters<AuthContextValue['signIn']>[0]) => {
      await signInWithEmail(payload);
      await loadProfile();
    },
    [loadProfile],
  );

  const signUp = useCallback(
    async (payload: Parameters<AuthContextValue['signUp']>[0]) => {
      const result = await signUpWithEmail(payload);
      await loadProfile();
      return result;
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isAuthLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [user, profile, isAuthLoading, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
