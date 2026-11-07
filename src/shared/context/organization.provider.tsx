import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../hooks/auth.hooks';
import {
  getMyOrganizations,
  getPersonalOrganization,
  createOrganization as createOrganizationApi,
  type CreateOrganizationPayload,
} from '../api/organizations.api';
import { IS_SURVEYS_APP } from '../config/appMode';
import type { OrganizationResponse } from '../../types/organization';
import { OrganizationContext, type OrganizationContextValue } from './organization.context';

const ACTIVE_ORG_KEY = 'active_organization_id';

/**
 * The standalone surveys service opens in the user's own workspace (the server creates it on first call);
 * the teams the person created or joined follow it in the list.
 */
const fetchOrganizations = async (): Promise<OrganizationResponse[]> => {
  if (!IS_SURVEYS_APP) return getMyOrganizations();
  const personal = await getPersonalOrganization();
  const all = await getMyOrganizations().catch(() => [personal]);
  return [personal, ...all.filter((org) => org.id !== personal.id)];
};

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ORG_KEY),
  );
  const [isLoading, setIsLoading] = useState(false);

  const loadOrganizations = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      return;
    }
    setIsLoading(true);
    try {
      const orgs = await fetchOrganizations();
      setOrganizations(orgs);

      if (orgs.length > 0) {
        const savedId = localStorage.getItem(ACTIVE_ORG_KEY);
        const savedExists = orgs.some((o) => o.id === savedId);
        if (!savedExists) {
          const firstId = orgs[0].id;
          setActiveOrgId(firstId);
          localStorage.setItem(ACTIVE_ORG_KEY, firstId);
        }
      } else {
        setActiveOrgId(null);
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      queueMicrotask(() => {
        if (!cancelled) setOrganizations([]);
      });
      return () => {
        cancelled = true;
      };
    }

    fetchOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        setOrganizations(orgs);
        if (orgs.length > 0) {
          const savedId = localStorage.getItem(ACTIVE_ORG_KEY);
          const savedExists = orgs.some((o) => o.id === savedId);
          if (!savedExists) {
            const firstId = orgs[0].id;
            setActiveOrgId(firstId);
            localStorage.setItem(ACTIVE_ORG_KEY, firstId);
          }
        } else {
          setActiveOrgId(null);
          localStorage.removeItem(ACTIVE_ORG_KEY);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOrganizations([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setActiveOrganizationId = useCallback((id: string) => {
    setActiveOrgId(id);
    localStorage.setItem(ACTIVE_ORG_KEY, id);
  }, []);

  const createOrganization = useCallback(
    async (payload: CreateOrganizationPayload) => {
      const org = await createOrganizationApi(payload);
      setOrganizations((prev) => [org, ...prev]);
      setActiveOrgId(org.id);
      localStorage.setItem(ACTIVE_ORG_KEY, org.id);
      return org;
    },
    [],
  );

  const activeOrganization = useMemo(
    () => organizations.find((o) => o.id === activeOrgId) ?? null,
    [organizations, activeOrgId],
  );

  // An answer without a role (an old server) is not a reason to take the buttons away
  const canEdit = activeOrganization !== null && activeOrganization.my_role !== 'reader';

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganization,
      isLoading,
      canEdit,
      setActiveOrganizationId,
      refreshOrganizations: loadOrganizations,
      createOrganization,
    }),
    [
      organizations,
      activeOrganization,
      isLoading,
      canEdit,
      setActiveOrganizationId,
      loadOrganizations,
      createOrganization,
    ],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
