import type { SubscriptionInfo } from '../../types/billing';

export interface AiQuota {
  /** False while billing is off or the data has not arrived: nothing is shown or blocked */
  visible: boolean;
  used: number;
  max: number;
  remaining: number;
  /** The limit is reached and the server enforces it: the AI buttons are switched off */
  exhausted: boolean;
  /** Less than a fifth is left */
  low: boolean;
}

const HIDDEN: AiQuota = { visible: false, used: 0, max: 0, remaining: 0, exhausted: false, low: false };

export const getAiQuota = (subscription: SubscriptionInfo | null): AiQuota => {
  if (!subscription?.billing_enabled) return HIDDEN;
  const { used, max } = subscription.usage.ai_actions;
  const remaining = Math.max(max - used, 0);
  return {
    visible: true,
    used,
    max,
    remaining,
    exhausted: subscription.enforced && used >= max,
    low: max > 0 && remaining <= max * 0.2,
  };
};

/** «1 действие», «2 действия», «5 действий» */
export const actionsWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'действий';
  if (rest10 === 1) return 'действие';
  if (rest10 >= 2 && rest10 <= 4) return 'действия';
  return 'действий';
};
