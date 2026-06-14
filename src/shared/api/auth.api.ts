import api from '../lib/api';

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phoneNumber: string;
  password: string;
}

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export const signInWithEmail = async ({
  email,
  password,
}: SignInPayload): Promise<void> => {
  const { data } = await api.post<TokenResponse>('/auth/login', {
    email,
    password,
  });
  localStorage.setItem('access_token', data.access_token);
};

export const signUpWithEmail = async ({
  firstName,
  lastName,
  middleName,
  email,
  phoneNumber,
  password,
}: SignUpPayload): Promise<SignUpResult> => {
  const { data } = await api.post<TokenResponse>('/auth/register', {
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName?.trim() || null,
    email,
    phone_number: phoneNumber,
    password,
  });
  localStorage.setItem('access_token', data.access_token);
  return { requiresEmailConfirmation: false };
};

export const signOut = async (): Promise<void> => {
  localStorage.removeItem('access_token');
};
