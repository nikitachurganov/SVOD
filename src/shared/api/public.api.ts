import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface PublicPopularFormSummary {
  id: string;
  name: string;
  short_description: string;
}

export interface PublicFormSummary {
  id: string;
  name: string;
  description: string;
  pages: unknown[];
  is_universal?: boolean;
}

export interface PublicPageData {
  organization_name: string;
  organization_description: string | null;
  forms: PublicFormSummary[];
  popular_forms: PublicPopularFormSummary[];
  universal_form_id: string | null;
}

export interface PublicRequestPayload {
  full_name: string;
  applicant_company: string;
  email?: string | null;
  phone?: string | null;
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

export interface PublicSuggestedFormCard {
  id: string;
  name: string;
  short_description: string;
}

export interface PublicSuggestFormsResponse {
  forms: PublicSuggestedFormCard[];
  hint?: string | null;
  used_llm?: boolean;
}

export const getPublicPageData = async (token: string): Promise<PublicPageData> => {
  const { data } = await publicApi.get<PublicPageData>(`/public/request/${token}`);
  return {
    ...data,
    forms: data.forms ?? [],
    popular_forms: data.popular_forms ?? [],
    universal_form_id: data.universal_form_id ?? null,
  };
};

export const suggestPublicForms = async (
  token: string,
  text: string,
  signal?: AbortSignal,
): Promise<PublicSuggestFormsResponse> => {
  const { data } = await publicApi.post<PublicSuggestFormsResponse>(
    `/public/request/${token}/suggest-forms`,
    { text },
    { signal },
  );
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
