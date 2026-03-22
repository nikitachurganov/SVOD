import { theme } from 'antd';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { ProfileBlock } from './ProfileBlock';

interface Props {
  onCreateOrgClick: () => void;
}

export const SidebarBottomSection = ({ onCreateOrgClick }: Props) => {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        flexShrink: 0,
      }}
    >
      <OrganizationSwitcher onCreateClick={onCreateOrgClick} />
      <ProfileBlock onCreateOrgClick={onCreateOrgClick} />
    </div>
  );
};
