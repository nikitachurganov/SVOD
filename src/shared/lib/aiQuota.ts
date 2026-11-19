import type { SubscriptionInfo, TeamBillingSummary } from '../../types/billing';

export interface AiQuota {
  /** False while billing is off or the data has not arrived: nothing is shown or blocked */
  visible: boolean;
  /** AI tokens used and the allowance of the plan */
  used: number;
  max: number;
  remaining: number;
  /** The allowance is used up and the server enforces it: the AI buttons are switched off */
  exhausted: boolean;
  /** Less than a fifth is left */
  low: boolean;
  /** When the tokens come back; null for an allowance that is not renewed */
  resetsAt: string | null;
  /** credits: the person's plan (1 credit = 1 000 tokens); tokens_plus / tokens: the team's balances */
  unit: 'credits' | 'tokens_plus' | 'tokens';
  /** The team model: a paid month with both balances at zero, the AI waits for a pack or the next month */
  suspended: boolean;
}

const HIDDEN: AiQuota = {
  visible: false,
  used: 0,
  max: 0,
  remaining: 0,
  exhausted: false,
  low: false,
  resetsAt: null,
  unit: 'credits',
  suspended: false,
};

/** The team model: Токены+ (the subscription first, then the packs) or, without them, the free tokens */
const teamQuota = (team: TeamBillingSummary): AiQuota => {
  if (team.ai_mode === 'free') {
    const { remaining, quota, resets_at: resetsAt } = team.free;
    return {
      visible: true,
      used: Math.max(quota - remaining, 0),
      max: quota,
      remaining,
      exhausted: team.enforced && remaining <= 0,
      low: quota > 0 && remaining <= quota * 0.2,
      resetsAt,
      unit: 'tokens',
      suspended: false,
    };
  }
  const plan = team.subscription;
  const remaining = (plan?.remaining ?? 0) + team.purchased_tokens;
  const max = (plan?.quota ?? 0) + team.purchased_tokens;
  return {
    visible: true,
    used: Math.max(max - remaining, 0),
    max,
    remaining,
    exhausted: team.enforced && remaining <= 0,
    low: max > 0 && remaining <= max * 0.2,
    resetsAt: plan?.resets_at ?? null,
    unit: 'tokens_plus',
    suspended: team.ai_mode === 'suspended',
  };
};

export const getAiQuota = (
  subscription: SubscriptionInfo | null,
  team: TeamBillingSummary | null = null,
): AiQuota => {
  if (team) return teamQuota(team);
  if (!subscription?.billing_enabled) return HIDDEN;
  const { used, max, resets_at: resetsAt } = subscription.usage.ai_tokens;
  const remaining = Math.max(max - used, 0);
  return {
    visible: true,
    used,
    max,
    remaining,
    exhausted: subscription.enforced && used >= max,
    low: max > 0 && remaining <= max * 0.2,
    resetsAt: resetsAt ?? null,
    unit: 'credits',
    suspended: false,
  };
};
