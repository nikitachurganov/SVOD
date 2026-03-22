import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth.context';
import {
  getMyOrganizations,
  createOrganization as createOrganizationApi,
  type CreateOrganizationPayload,
} from '../api/organizations.api';
import type { OrganizationResponse } from '../../types/organization';

const ACTIVE_ORG_KEY = 'active_organization_id';

interface OrganizationContextValue {
  organizations: OrganizationResponse[];
  activeOrganization: OrganizationResponse | null;
  isLoading: boolean;
  setActiveOrganizationId: (id: string) => void;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (payload: CreateOrganizationPayload) => Promise<OrganizationResponse>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

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
      const orgs = await getMyOrganizations();
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
    void loadOrganizations();
  }, [loadOrganizations]);

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

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganization,
      isLoading,
      setActiveOrganizationId,
      refreshOrganizations: loadOrganizations,
      createOrganization,
    }),
    [organizations, activeOrganization, isLoading, setActiveOrganizationId, loadOrganizations, createOrganization],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = (): OrganizationContextValue => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used inside <OrganizationProvider>');
  }
  return context;
};
