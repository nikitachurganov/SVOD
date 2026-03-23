import { OrganizationSwitcher } from './OrganizationSwitcher';
import { ProfileBlock } from './ProfileBlock';

interface Props {
  onCreateOrgClick: () => void;
}

export const SidebarBottomSection = ({ onCreateOrgClick }: Props) => {
  return (
    <div
      style={{
        borderTop: '1px solid var(--cds-border-subtle)',
        flexShrink: 0,
      }}
    >
      <OrganizationSwitcher onCreateClick={onCreateOrgClick} />
      <ProfileBlock onCreateOrgClick={onCreateOrgClick} />
    </div>
  );
};
