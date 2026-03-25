import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface PublicFormSummary {
  id: string;
  name: string;
  description: string;
  pages: unknown[];
}

export interface PublicPageData {
  organization_name: string;
  organization_description: string | null;
  forms: PublicFormSummary[];
}

export interface PublicRequestPayload {
  full_name: string;
  email: string;
  phone: string;
  form_id: string;
  title: string;
  data: unknown;
  form_snapshot: unknown;
}

export interface PublicRequestCreated {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export const getPublicPageData = async (token: string): Promise<PublicPageData> => {
  const { data } = await publicApi.get<PublicPageData>(`/public/request/${token}`);
  return data;
};

export const submitPublicRequest = async (
  token: string,
  payload: PublicRequestPayload,
): Promise<PublicRequestCreated> => {
  const { data } = await publicApi.post<PublicRequestCreated>(
    `/public/request/${token}`,
    payload,
  );
  return data;
};

export interface PublicLinkResponse {
  id: string;
  organization_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}
