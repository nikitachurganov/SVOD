import type { SubscriptionInfo } from '../../types/billing';

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
  /** When the tokens come back; null for the free allowance, which is given once */
  resetsAt: string | null;
}

const HIDDEN: AiQuota = {
  visible: false,
  used: 0,
  max: 0,
  remaining: 0,
  exhausted: false,
  low: false,
  resetsAt: null,
};

export const getAiQuota = (subscription: SubscriptionInfo | null): AiQuota => {
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
  };
};
