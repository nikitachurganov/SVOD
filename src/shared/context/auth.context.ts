import { createContext } from 'react';
import type { UserProfile } from '../../types/profile';
import type { SignInPayload, SignUpPayload, SignUpResult } from '../api/auth.api';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  isAuthLoading: boolean;
  signIn: (payload: SignInPayload) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
