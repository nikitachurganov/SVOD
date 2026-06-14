import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

/** Axios client for public suggest endpoints (no 401 → /auth redirect). */
const suggestApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface YandexAddressSuggestion {
  value: string;
  subtitle?: string;
  formattedAddress?: string;
  providerPayload: unknown;
}

interface BackendYandexSuggestion {
  value?: string;
  country?: string;
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  provider?: string;
  providerPayload?: unknown;
}

const mapBackendItem = (item: BackendYandexSuggestion): YandexAddressSuggestion | null => {
  const value = typeof item.value === 'string' ? item.value.trim() : '';
  if (!value) return null;

  const payload =
    item.providerPayload && typeof item.providerPayload === 'object'
      ? {
          ...(item.providerPayload as Record<string, unknown>),
          parsed: {
            country: item.country,
            region: item.region,
            city: item.city,
            street: item.street,
            house: item.house,
          },
        }
      : {
          parsed: {
            country: item.country,
            region: item.region,
            city: item.city,
            street: item.street,
            house: item.house,
          },
        };

  return {
    value,
    formattedAddress: value,
    providerPayload: payload,
  };
};

const extractErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data;
    if (typeof detail === 'object' && detail !== null && 'detail' in detail) {
      const text = (detail as { detail?: unknown }).detail;
      if (typeof text === 'string') return text;
    }
    if (error.response?.status === 429) {
      return 'Слишком много запросов подсказок. Попробуйте позже.';
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Сервер подсказок недоступен. Проверьте, что backend запущен.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'Не удалось получить подсказки адреса';
};

/** Yandex Geosuggest via backend proxy (browser cannot call Yandex API directly — CORS). */
export const suggestYandexAddress = async (
  text: string,
  options?: { limit?: number; countryRestriction?: string },
): Promise<YandexAddressSuggestion[]> => {
  const trimmed = text.trim();
  if (trimmed.length < 2) return [];

  try {
    const { data } = await suggestApi.get<BackendYandexSuggestion[]>('/suggest/yandex', {
      params: {
        query: trimmed,
        limit: options?.limit ?? 5,
        country: options?.countryRestriction,
      },
    });

    return data
      .map((item) => mapBackendItem(item))
      .filter((item): item is YandexAddressSuggestion => item !== null);
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};
