import { createContext } from 'react';
import type { SubscriptionInfo, TeamBillingSummary } from '../../types/billing';

export interface SubscriptionContextValue {
  /** The person's plan and usage; null until it arrives (or when the service has no plans) */
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  /** Reads the plan and usage again, e.g. after an AI action used one unit */
  refresh: () => Promise<void>;
  /** The team model: the plan and the balances of the active team; null while the model is off */
  team: TeamBillingSummary | null;
  /** Puts a fresher state the server has just returned (after a trial, a cancellation) */
  replace: (next: SubscriptionInfo) => void;
}

export const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
