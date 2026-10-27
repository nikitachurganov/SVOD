import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSubscription } from '../api/billing.api';
import { IS_SURVEYS_APP } from '../config/appMode';
import { useAuth } from '../hooks/auth.hooks';
import { PAYWALL_EVENT } from '../lib/billingErrors';
import type { SubscriptionInfo } from '../../types/billing';
import { SubscriptionContext } from './subscription.context';

/** The plans exist only in the surveys service; elsewhere this provider holds nothing and asks nothing */
export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(IS_SURVEYS_APP);

  const refresh = useCallback(async () => {
    if (!IS_SURVEYS_APP) return;
    try {
      setSubscription(await getSubscription());
    } catch {
      // The plan is a convenience in the interface; the server enforces the limits whatever is shown
    }
  }, []);

  useEffect(() => {
    if (!IS_SURVEYS_APP || !userId) return;
    let cancelled = false;
    getSubscription()
      .then((next) => {
        if (!cancelled) setSubscription(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A refused action means the numbers on the screen are stale
  useEffect(() => {
    const onPaywall = () => void refresh();
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, [refresh]);

  const value = useMemo(
    () => ({ subscription, isLoading, refresh, replace: setSubscription }),
    [subscription, isLoading, refresh],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};
