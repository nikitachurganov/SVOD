import { Avatar } from 'antd';
import type { PublicOrganizationInfo } from '../../shared/api/public.api';

const orgInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

interface PublicOrgHeaderProps {
  organization: PublicOrganizationInfo | null;
  organizationName: string;
  subtitle?: string;
}

export const PublicOrgHeader = ({
  organization,
  organizationName,
  subtitle,
}: PublicOrgHeaderProps) => {
  const name = organization?.name ?? organizationName;
  const logoUrl = organization?.logo_url;

  return (
    <header className="public-form-flow__header">
      <div className="public-form-flow__org">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="public-form-flow__org-logo" />
        ) : (
          <Avatar size={40} className="public-form-flow__org-avatar">
            {orgInitials(name)}
          </Avatar>
        )}
        <div>
          <div className="public-form-flow__org-name">{name}</div>
          {subtitle ? <div className="public-form-flow__org-subtitle">{subtitle}</div> : null}
        </div>
      </div>
    </header>
  );
};
