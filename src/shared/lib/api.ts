import axios from 'axios';
import { announcePaywall, parseBillingError } from './billingErrors';
import { IS_SURVEYS_APP } from '../config/appMode';

const BASE_URL = import.meta.env.VITE_API_URL as string | undefined;

if (!BASE_URL) {
  throw new Error('Missing VITE_API_URL environment variable');
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // The server builds the links of invitations on the address of the front end the request came from
    ...(IS_SURVEYS_APP ? { 'X-App-Service': 'surveys' } : {}),
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * No free paid seat while inviting someone or changing a role: the people page and the invite form explain
 * it themselves and offer to buy a seat or pick the free observer, so the general window would only repeat it.
 */
const SEAT_SCREENS = [
  { method: 'post', path: /^\/organizations\/[^/]+\/invitations$/ },
  { method: 'patch', path: /^\/organizations\/[^/]+\/members\/[^/]+\/role$/ },
];

const handledOnScreen = (limit: string | undefined, method: string | undefined, url: string | undefined): boolean =>
  limit === 'seats' &&
  SEAT_SCREENS.some((screen) => screen.method === method?.toLowerCase() && screen.path.test(url ?? ''));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A wrong password on the sign-in form is not an expired session: let the form show the error
    const isCredentialsRequest = /^\/auth\/(login|register)$/.test(error.config?.url ?? '');
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isCredentialsRequest) {
      localStorage.removeItem('access_token');
      window.location.href = '/auth';
    }
    // A plan limit stopped the action: one window offers the way out, whichever screen asked
    if (axios.isAxiosError(error) && error.response?.status === 402) {
      const billing = parseBillingError(error);
      if (billing && !handledOnScreen(billing.limit, error.config?.method, error.config?.url)) {
        announcePaywall(billing);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
