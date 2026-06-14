import { createContext } from 'react';
import type { CreateOrganizationPayload } from '../api/organizations.api';
import type { OrganizationResponse } from '../../types/organization';

export interface OrganizationContextValue {
  organizations: OrganizationResponse[];
  activeOrganization: OrganizationResponse | null;
  isLoading: boolean;
  setActiveOrganizationId: (id: string) => void;
  refreshOrganizations: () => Promise<void>;
  createOrganization: (payload: CreateOrganizationPayload) => Promise<OrganizationResponse>;
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);
