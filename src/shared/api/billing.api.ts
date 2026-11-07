import api from '../lib/api';
import type {
  CheckoutResponse,
  PaymentInfo,
  PlanRequestInfo,
  PlanRequestPayload,
  PlanRequestTerm,
  PlansResponse,
  QuoteResponse,
  QuoteTerm,
  SeatAdditionQuote,
  SubscriptionInfo,
} from '../../types/billing';

let plansRequest: Promise<PlansResponse> | null = null;

/** The catalogue changes with a release, not during a visit: it is fetched once per page load */
export const getPlans = (): Promise<PlansResponse> => {
  if (!plansRequest) {
    plansRequest = api
      .get<PlansResponse>('/billing/plans')
      .then(({ data }) => data)
      .catch((err) => {
        plansRequest = null;
        throw err;
      });
  }
  return plansRequest;
};

export const getSubscription = async (): Promise<SubscriptionInfo> => {
  const { data } = await api.get<SubscriptionInfo>('/billing/subscription');
  return data;
};

export const startTrial = async (): Promise<SubscriptionInfo> => {
  const { data } = await api.post<SubscriptionInfo>('/billing/trial');
  return data;
};

export const cancelSubscription = async (): Promise<SubscriptionInfo> => {
  const { data } = await api.post<SubscriptionInfo>('/billing/cancel');
  return data;
};

export const resumeSubscription = async (): Promise<SubscriptionInfo> => {
  const { data } = await api.post<SubscriptionInfo>('/billing/resume');
  return data;
};

/** Starts an online payment; the answer is the provider's page to send the person to */
export const createCheckout = async (
  term: PlanRequestTerm,
  seats?: number,
): Promise<CheckoutResponse> => {
  const { data } = await api.post<CheckoutResponse>(
    '/billing/checkout',
    seats && seats > 1 ? { term, seats } : { term },
  );
  return data;
};

/** The price of a team for a month or a year, from the same calculator as the payment */
export const getQuote = async (term: QuoteTerm, seats: number): Promise<QuoteResponse> => {
  const { data } = await api.get<QuoteResponse>('/billing/quote', { params: { term, seats } });
  return data;
};

/** What the extra seats cost now; the same sum the payment is made for */
export const getSeatAdditionQuote = async (seats: number): Promise<SeatAdditionQuote> => {
  const { data } = await api.get<SeatAdditionQuote>('/billing/seats/quote', { params: { seats } });
  return data;
};

/** Pays for more seats in the middle of the period; `seats` is how many the team has afterwards */
export const addSeats = async (seats: number): Promise<CheckoutResponse> => {
  const { data } = await api.post<CheckoutResponse>('/billing/seats', { seats });
  return data;
};

/** Buys the extra pack of Токены+ on top of a running plan */
export const buyAddon = async (): Promise<CheckoutResponse> => {
  const { data } = await api.post<CheckoutResponse>('/billing/addon');
  return data;
};

export const getPayment = async (paymentId: string): Promise<PaymentInfo> => {
  const { data } = await api.get<PaymentInfo>(`/billing/payments/${paymentId}`);
  return data;
};

export const listPayments = async (): Promise<PaymentInfo[]> => {
  const { data } = await api.get<PaymentInfo[]>('/billing/payments');
  return data;
};

export const createPlanRequest = async (payload: PlanRequestPayload): Promise<PlanRequestInfo> => {
  const { data } = await api.post<PlanRequestInfo>('/billing/plan-requests', payload);
  return data;
};

/** The server explains its refusals in `detail.message` (Russian) or by `detail.code`; the fallback is the last resort */
export const billingActionError = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && /[а-яё]/i.test(detail)) return detail;
  if (detail && typeof detail === 'object') {
    const { message, code } = detail as { message?: unknown; code?: unknown };
    if (typeof message === 'string') return message;
    switch (code) {
      case 'plan_request_pending':
        return 'Заявка уже отправлена: мы свяжемся с вами по указанному контакту.';
      case 'trial_used':
        return 'Пробный период уже использован.';
      case 'already_subscribed':
        return 'У вас уже подключён платный тариф.';
      case 'nothing_to_cancel':
      case 'nothing_to_resume':
        return 'Сейчас нет платного тарифа, с которым это можно сделать.';
      case 'deletion_scheduled':
        return 'Аккаунт запланирован к удалению: отменить удаление можно в разделе «Профиль».';
      case 'billing_disabled':
        return 'Тарифы пока не включены.';
      case 'payments_disabled':
        return 'Онлайн-оплата пока не подключена. Оставьте заявку, и мы выставим счёт.';
      case 'seats_unavailable':
        return 'Покупка мест пока недоступна.';
      case 'invalid_seats':
        return 'Выберите от 2 до 10 мест. Для большей команды напишите нам.';
      case 'no_active_subscription':
        return 'Сначала подключите платный тариф: места добавляются к действующей подписке.';
      case 'seats_by_request':
        return 'Для этой подписки места добавляются по заявке: напишите нам.';
      case 'nothing_to_pay':
        return 'Сейчас доплачивать нечего: подписка уже оплачена за нужное число мест.';
      case 'addon_unavailable':
        return 'Дополнительный пакет пока недоступен.';
      case 'payment_provider_unavailable':
      case 'payment_provider_rejected':
        return 'Не удалось создать платёж. Попробуйте позже или оставьте заявку.';
      default:
        break;
    }
  }
  return fallback;
};
