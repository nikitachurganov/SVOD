import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSubscription, getTeamBilling } from '../api/billing.api';
import { IS_SURVEYS_APP } from '../config/appMode';
import { useAuth } from '../hooks/auth.hooks';
import { PAYWALL_EVENT } from '../lib/billingErrors';
import type { SubscriptionInfo, TeamBillingSummary } from '../../types/billing';
import { OrganizationContext } from './organization.context';
import { SubscriptionContext } from './subscription.context';

/** The summary of a team, or null when the team model is off (the server answers 409) or it failed */
const loadTeam = (organizationId: string | null): Promise<TeamBillingSummary | null> =>
  organizationId ? getTeamBilling(organizationId).catch(() => null) : Promise.resolve(null);

/**
 * The plans exist only in the surveys service; elsewhere this provider holds nothing and asks nothing.
 * In the team model (docs/MONETIZATION_TEAM_SPEC.md) it also holds the plan and the balances of the active
 * team, read again when the active team changes, so every screen shows the team it works in.
 */
export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const organizationId = useContext(OrganizationContext)?.activeOrganization?.id ?? null;
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [team, setTeam] = useState<{ id: string; summary: TeamBillingSummary } | null>(null);
  const [isLoading, setIsLoading] = useState(IS_SURVEYS_APP);

  const refresh = useCallback(async () => {
    if (!IS_SURVEYS_APP) return;
    const [nextSubscription, nextTeam] = await Promise.all([
      getSubscription().catch(() => null),
      loadTeam(organizationId),
    ]);
    // The plan is a convenience in the interface; the server enforces the limits whatever is shown
    if (nextSubscription) setSubscription(nextSubscription);
    setTeam(organizationId && nextTeam ? { id: organizationId, summary: nextTeam } : null);
  }, [organizationId]);

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

  useEffect(() => {
    if (!IS_SURVEYS_APP || !userId || !organizationId) return;
    let cancelled = false;
    void loadTeam(organizationId).then((summary) => {
      if (!cancelled) setTeam(summary ? { id: organizationId, summary } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, organizationId]);

  // A refused action means the numbers on the screen are stale
  useEffect(() => {
    const onPaywall = () => void refresh();
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, [refresh]);

  // An answer that came for the previous team is never shown for the new one
  const teamSummary = team && team.id === organizationId ? team.summary : null;
  const value = useMemo(
    () => ({ subscription, team: teamSummary, isLoading, refresh, replace: setSubscription }),
    [subscription, teamSummary, isLoading, refresh],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};
