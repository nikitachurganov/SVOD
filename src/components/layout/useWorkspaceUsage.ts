import { useEffect, useState } from 'react';
import { getSeatUsage } from '../../shared/api/organizations.api';
import type { SeatUsage } from '../../types/organization';

/** The switcher and the plan card ask the same thing at the same time: one request answers both */
const FRESH_MS = 15_000;
const recent = new Map<string, { at: number; request: Promise<SeatUsage> }>();

const usageOf = (orgId: string): Promise<SeatUsage> => {
  const known = recent.get(orgId);
  if (known && Date.now() - known.at < FRESH_MS) return known.request;
  const request = getSeatUsage(orgId);
  recent.set(orgId, { at: Date.now(), request });
  // A failed answer must not be served again
  request.catch(() => recent.delete(orgId));
  return request;
};

/**
 * Places and the AI pool of the active workspace, for those who manage it (the owner and the admins).
 * Null while it loads, for everybody else, and when the tariffs are switched off.
 */
export const useWorkspaceUsage = (orgId: string | null): { orgId: string; usage: SeatUsage } | null => {
  const [state, setState] = useState<{ orgId: string; usage: SeatUsage } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    usageOf(orgId)
      .then((usage) => {
        if (!cancelled) setState(usage.billing_enabled ? { orgId, usage } : null);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state && state.orgId === orgId ? state : null;
};
