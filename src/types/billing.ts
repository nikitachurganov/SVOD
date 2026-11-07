/** Shapes of the billing API (backend/app/schemas/billing.py); the server speaks snake_case */

export type PlanCode = 'start' | 'pack' | 'researcher' | 'unlimited' | (string & {});

export interface PlanLimits {
  max_active_surveys: number;
  max_projects: number;
  max_questions: number;
  responses_per_period: number;
  max_analyzed_responses: number;
  /** AI allowance in tokens (prompt + completion); the only limit the plans really differ in */
  ai_tokens_per_period: number;
}

export interface PlanInfo {
  code: PlanCode;
  title: string;
  price_month_kopecks: number;
  price_year_kopecks: number;
  limits: PlanLimits;
  /** crosstabs, csv_export, quality_filter, all_methodologies */
  features: string[];
}

export interface PlansResponse {
  plans: PlanInfo[];
  /** True: the person can pay online; false: only a request for an invoice is offered */
  payments_enabled: boolean;
  /** The one-off pack: a fixed AI allowance for a fixed time, no auto-renewal */
  pack: PlanInfo;
  pack_price_kopecks: number;
  pack_days: number;
  /** True: the Researcher plan is sold by seats and `limits` are per seat; false: one price per person */
  seat_pricing_enabled: boolean;
  max_seats: number;
  /** The extra pack of Токены+ on top of a running plan */
  addon_price_kopecks: number;
  addon_tokens: number;
  addon_days: number;
}

export type QuoteTerm = 'month' | 'year';

export interface QuoteLine {
  /** creator, kit or other */
  kind: 'creator' | 'kit' | 'other' | (string & {});
  kopecks: number;
}

export interface QuoteResponse {
  term: QuoteTerm;
  seats: number;
  lines: QuoteLine[];
  subtotal_kopecks: number;
  total_kopecks: number;
  /** What a year saves against twelve months */
  year_saving_kopecks: number;
}

/** What extra seats cost for the rest of the paid period */
export interface SeatAdditionQuote {
  seats: number;
  amount_kopecks: number;
  days_left: number;
}

export interface UsageMetric {
  used: number;
  max: number;
  /** When the counter starts over; null for what is never renewed (the free AI allowance) */
  resets_at?: string | null;
}

export interface SubscriptionUsage {
  ai_tokens: UsageMetric;
  responses: UsageMetric;
  active_surveys: UsageMetric;
  projects: UsageMetric;
  /** Responses received beyond the quota and kept back until the plan grows */
  locked_responses: number;
  /** Токены+ left in the extra packs bought on top of the quota */
  ai_extra_tokens: number;
}

export type PlanRequestTerm = 'month' | 'year' | 'one_off';

export interface PlanRequestInfo {
  id: string;
  plan_code: PlanCode;
  billing_interval: PlanRequestTerm | string;
  status: string;
  created_at: string;
}

export interface SubscriptionInfo {
  /** False: billing is switched off and nobody is limited */
  billing_enabled: boolean;
  /** False in shadow mode: usage is counted, nothing is blocked */
  enforced: boolean;
  plan: PlanInfo;
  /** active, trialing, past_due or expired */
  status: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  trial_used: boolean;
  cancel_at_period_end: boolean;
  deletion_scheduled: boolean;
  deletion_at: string | null;
  usage: SubscriptionUsage;
  plan_request: PlanRequestInfo | null;
  /** Paid seats of the team */
  seats: number;
  /** The 7 days after the first payment when seats are added at the kit price; null outside it */
  seat_window_ends_at: string | null;
  seat_window_days_left: number;
}

export interface CheckoutResponse {
  payment_id: string;
  /** The payment page of the provider the person is sent to */
  confirmation_url: string;
}

export type PaymentStatus = 'new' | 'pending' | 'succeeded' | 'canceled' | 'failed' | 'mismatch';

export interface PaymentInfo {
  id: string;
  term: PlanRequestTerm | string;
  amount_kopecks: number;
  status: PaymentStatus | string;
  created_at: string;
  paid_at: string | null;
  refunded_kopecks: number;
  is_test: boolean;
}

export interface PlanRequestPayload {
  plan_code: PlanCode;
  billing_interval: PlanRequestTerm;
  contact: string;
  comment?: string;
}
