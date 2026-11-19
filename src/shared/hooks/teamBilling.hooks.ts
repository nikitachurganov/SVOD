import { useEffect, useState } from 'react';
import { getPlans } from '../api/billing.api';
import type { TeamBillingSummary } from '../../types/billing';
import { useSubscription } from './subscription.hooks';

/** The plan and the balances of the active team, or null while the team model is off or no team is chosen.
 * Kept by SubscriptionProvider, so every screen sees the same numbers and they refresh together. */
export const useTeamBilling = (): { summary: TeamBillingSummary | null; reload: () => void } => {
  const { team, refresh } = useSubscription();
  return { summary: team, reload: () => void refresh() };
};

/** True once the catalogue says the plans belong to teams; the public pages (the offer, the refund terms,
 * the price list) choose their text by it. False while it is loading or when it cannot be read. */
export const useTeamModelEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((plans) => {
        if (!cancelled) setEnabled(Boolean(plans.team_billing_enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
};
