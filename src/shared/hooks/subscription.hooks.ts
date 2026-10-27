import { useContext } from 'react';
import {
  SubscriptionContext,
  type SubscriptionContextValue,
} from '../context/subscription.context';

const NO_PLANS: SubscriptionContextValue = {
  subscription: null,
  isLoading: false,
  refresh: async () => {},
  replace: () => {},
};

/** Components that can also live outside the surveys service get «no plans» instead of an error */
export const useSubscription = (): SubscriptionContextValue =>
  useContext(SubscriptionContext) ?? NO_PLANS;
