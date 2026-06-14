import { useContext } from 'react';
import {
  OrganizationContext,
  type OrganizationContextValue,
} from '../context/organization.context';

export const useOrganization = (): OrganizationContextValue => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used inside <OrganizationProvider>');
  }
  return context;
};
