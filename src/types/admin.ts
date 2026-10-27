/** Shapes of the administrator API (backend/app/schemas/admin.py); the server speaks snake_case */

export type AdminTier = 'free' | 'paid' | 'trial' | 'past_due';

export type AdminSortField = 'created_at' | 'last_login_at' | 'email' | 'name' | 'plan_ends_at';

export type PlanRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AdminUserRow {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string;
  phone_number: string;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
  ai_enabled: boolean;
  role: string;
  plan_code: string;
  plan_title: string;
  /** active, trialing, past_due or expired — as it really applies now */
  subscription_status: string;
  plan_ends_at: string | null;
  ai_actions_used: number;
  ai_actions_max: number;
  surveys_count: number;
  responses_count: number;
  deletion_requested_at: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUsersQuery {
  q?: string;
  tier?: AdminTier;
  email_verified?: boolean;
  is_active?: boolean;
  sort: AdminSortField;
  direction: 'asc' | 'desc';
  page: number;
  page_size: number;
}

export interface AdminLimits {
  max_active_surveys: number;
  max_projects: number;
  max_questions: number;
  responses_per_period: number;
  max_analyzed_responses: number;
  ai_actions_per_period: number;
  ai_budget_rub_per_period: number;
}

export type LimitOverrides = Partial<AdminLimits>;

export interface AdminSubscription {
  plan_code: string;
  plan_title: string;
  status: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  trial_used: boolean;
  cancel_at_period_end: boolean;
  limit_overrides: LimitOverrides | null;
  limits: AdminLimits;
}

export interface UsageMetric {
  used: number;
  max: number;
}

export interface AdminUsage {
  ai_actions: UsageMetric;
  responses: UsageMetric;
  active_surveys: UsageMetric;
  projects: UsageMetric;
  locked_responses: number;
  ai_cost_usd_30d: number;
}

export interface AdminEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface AdminAiLogRow {
  id: string;
  action: string;
  calls: number;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number | null;
  status: string;
  survey_id: string | null;
  created_at: string;
}

export interface AdminPlanRequest {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  plan_code: string;
  billing_interval: string;
  contact: string;
  comment: string | null;
  status: PlanRequestStatus;
  created_at: string;
  processed_at: string | null;
  decision_note: string | null;
}

export interface AdminPayment {
  id: string;
  term: string;
  amount_kopecks: number;
  status: string;
  /** The id in the YooKassa cabinet, to find the payment there */
  provider_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_kopecks: number;
  failure_reason: string | null;
  is_test: boolean;
}

export interface AdminUserDetail {
  user: AdminUserRow;
  subscription: AdminSubscription;
  usage: AdminUsage;
  events: AdminEvent[];
  ai_usage: AdminAiLogRow[];
  plan_requests: AdminPlanRequest[];
  payments: AdminPayment[];
}

export interface AdminUserPatch {
  is_active?: boolean;
  ai_enabled?: boolean;
}

export interface AdminGrantPayload {
  plan: string;
  days: number;
  note?: string;
  limit_overrides?: LimitOverrides;
}

export interface AdminStats {
  users: {
    total: number;
    new_7d: number;
    new_30d: number;
    active_30d: number;
    email_verified: number;
    blocked: number;
  };
  plans: { free: number; trial: number; paid: number; past_due: number };
  expected_monthly_revenue_kopecks: number;
  /** What was really paid online in the last 30 days, refunds taken off */
  received_30d_kopecks: number;
  ai_cost_usd_30d: number;
  ai_cost_rub_30d: number;
  /** A ratio: 0.12 is twelve percent of the expected revenue; null while there is no revenue */
  ai_cost_share_of_revenue: number | null;
  pending_plan_requests: number;
}
