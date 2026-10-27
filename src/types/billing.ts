/** Shapes of the billing API (backend/app/schemas/billing.py); the server speaks snake_case */

export type PlanCode = 'start' | 'researcher' | 'unlimited' | (string & {});

export interface PlanLimits {
  max_active_surveys: number;
  max_projects: number;
  max_questions: number;
  responses_per_period: number;
  max_analyzed_responses: number;
  ai_actions_per_period: number;
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
  course_pack_price_kopecks: number;
  course_pack_days: number;
}

export interface UsageMetric {
  used: number;
  max: number;
}

export interface SubscriptionUsage {
  ai_actions: UsageMetric;
  responses: UsageMetric;
  active_surveys: UsageMetric;
  projects: UsageMetric;
  /** Responses received beyond the quota and kept back until the plan grows */
  locked_responses: number;
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
