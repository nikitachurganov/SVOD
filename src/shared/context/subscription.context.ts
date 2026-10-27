import { createContext } from 'react';
import type { SubscriptionInfo } from '../../types/billing';

export interface SubscriptionContextValue {
  /** The person's plan and usage; null until it arrives (or when the service has no plans) */
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  /** Reads the plan and usage again, e.g. after an AI action used one unit */
  refresh: () => Promise<void>;
  /** Puts a fresher state the server has just returned (after a trial, a cancellation) */
  replace: (next: SubscriptionInfo) => void;
}

export const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
