import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export type PublicLinkErrorCode =
  | 'link_not_found'
  | 'link_inactive'
  | 'organization_unavailable'
  | 'unknown';

export interface PublicOrganizationInfo {
  id: string;
  name: string;
  logo_url?: string | null;
  description?: string | null;
}

export interface PublicLinkInfo {
  active: boolean;
  custom_title?: string | null;
  custom_description?: string | null;
}

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
  field_count?: number;
}

export interface PublicPageData {
  organization_name: string;
  organization_description: string | null;
  forms: PublicFormSummary[];
  popular_forms: PublicPopularFormSummary[];
  universal_form_id: string | null;
  organization?: PublicOrganizationInfo | null;
  link?: PublicLinkInfo | null;
}

export interface PublicRequestPayload {
  full_name: string;
  applicant_company?: string | null;
  email: string;
  phone?: string | null;
  form_id: string;
  title: string;
  data: unknown;
  form_snapshot: unknown;
  applicant_description?: string | null;
}

export interface PublicRequestCreated {
  id: string;
  title: string;
  status: string;
  created_at: string;
  request_id?: string;
  request_number?: string;
}

export interface PublicSuggestedFormCard {
  id: string;
  name: string;
  short_description: string;
  field_count: number;
  relevance_score: number;
  reason: string;
}

export interface PublicSuggestFormsResponse {
  forms: PublicSuggestedFormCard[];
  suggestions?: PublicSuggestedFormCard[];
  hint?: string | null;
  used_llm?: boolean;
}

export interface PublicLinkResponse {
  id: string;
  organization_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

export interface PublicApiError {
  status?: number;
  code: PublicLinkErrorCode;
  message: string;
}

const ERROR_MESSAGES: Record<PublicLinkErrorCode, { title: string; description: string }> = {
  link_not_found: {
    title: 'Ссылка не найдена',
    description: 'Обратитесь к администратору организации за новой ссылкой.',
  },
  link_inactive: {
    title: 'Эта ссылка больше не активна',
    description: 'Обратитесь к администратору организации за новой ссылкой.',
  },
  organization_unavailable: {
    title: 'Организация недоступна',
    description: 'Обратитесь к администратору организации за новой ссылкой.',
  },
  unknown: {
    title: 'Ссылка недействительна',
    description: 'Не удалось загрузить данные. Обратитесь к администратору организации.',
  },
};

export const mapPublicApiError = (err: unknown): PublicApiError => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    const code =
      typeof detail === 'string' && detail in ERROR_MESSAGES
        ? (detail as PublicLinkErrorCode)
        : 'unknown';
    const mapped = ERROR_MESSAGES[code];
    if (status === 429) {
      return {
        status,
        code: 'unknown',
        message: typeof detail === 'string' ? detail : 'Слишком много запросов. Подождите и попробуйте снова.',
      };
    }
    return {
      status,
      code,
      message: mapped.description,
    };
  }
  return {
    code: 'unknown',
    message: err instanceof Error ? err.message : ERROR_MESSAGES.unknown.description,
  };
};

export const getPublicLinkErrorView = (code: PublicLinkErrorCode) => ERROR_MESSAGES[code];

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
  description: string,
  signal?: AbortSignal,
): Promise<PublicSuggestFormsResponse> => {
  const { data } = await publicApi.post<PublicSuggestFormsResponse>(
    `/public/request/${token}/suggest-forms`,
    { description },
    { signal },
  );
  const forms = data.forms ?? data.suggestions ?? [];
  return {
    ...data,
    forms: forms.map((form) => ({
      ...form,
      field_count: form.field_count ?? 0,
      relevance_score: form.relevance_score ?? 0,
      reason: form.reason ?? '',
    })),
  };
};

export const submitPublicRequest = async (
  token: string,
  payload: PublicRequestPayload,
): Promise<PublicRequestCreated> => {
  const { data } = await publicApi.post<PublicRequestCreated>(
    `/public/request/${token}`,
    payload,
  );
  return {
    ...data,
    request_id: data.request_id ?? data.id,
    request_number: data.request_number ?? data.id,
  };
};
