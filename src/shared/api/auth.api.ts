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
  phoneNumber?: string;
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
    phone_number: phoneNumber?.trim() || '',
    password,
  });
  localStorage.setItem('access_token', data.access_token);
  return { requiresEmailConfirmation: false };
};

export interface AccountActivationInfo {
  email: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone_number: string;
  organization_name: string;
  inviter_name: string | null;
  job_title: string | null;
  expires_at: string | null;
}

export interface ActivateAccountPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  phoneNumber?: string;
  password: string;
}

/** Public: data of an account an organization owner created for this person */
export const getAccountActivation = async (token: string): Promise<AccountActivationInfo> => {
  const { data } = await api.get<AccountActivationInfo>(`/auth/activation/${encodeURIComponent(token)}`);
  return data;
};

/** Public: set a password, activate the account and log in */
export const activateAccount = async (
  token: string,
  { firstName, lastName, middleName, phoneNumber, password }: ActivateAccountPayload,
): Promise<void> => {
  const { data } = await api.post<TokenResponse>(`/auth/activation/${encodeURIComponent(token)}`, {
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName?.trim() || null,
    phone_number: phoneNumber?.trim() || '',
    password,
  });
  localStorage.setItem('access_token', data.access_token);
};

export const signOut = async (): Promise<void> => {
  localStorage.removeItem('access_token');
};
