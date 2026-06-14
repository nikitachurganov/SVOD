import { Avatar, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { useOrganization } from '../../shared/hooks/organization.hooks';

const ORG_PLAN_LABEL = 'Тариф «Бизнес»';

export const OrganizationSwitcher = () => {
  const { organizations, activeOrganization, isLoading, setActiveOrganizationId } =
    useOrganization();

  if (isLoading || organizations.length === 0 || !activeOrganization) {
    return null;
  }

  const initial = activeOrganization.name.trim().charAt(0).toUpperCase() || '?';

  const menuItems: MenuProps['items'] = organizations.map((org) => ({
    key: org.id,
    label: org.name,
    onClick: () => setActiveOrganizationId(org.id),
  }));

  return (
    <div className="app-sidebar-org-profile-wrap">
      <Dropdown
        menu={{ items: menuItems, selectedKeys: [activeOrganization.id] }}
        trigger={['click']}
        placement="topLeft"
      >
        <button
          type="button"
          className="app-sidebar-org-profile"
          aria-label="Переключить организацию"
          aria-haspopup="listbox"
        >
          <Avatar className="app-sidebar-org-profile__avatar" size={32}>
            {initial}
          </Avatar>
          <span className="app-sidebar-org-profile__text">
            <span className="app-sidebar-org-profile__name">{activeOrganization.name}</span>
            <span className="app-sidebar-org-profile__meta">{ORG_PLAN_LABEL}</span>
          </span>
          <SwapOutlined className="app-sidebar-org-profile__switch" aria-hidden />
        </button>
      </Dropdown>
    </div>
  );
};
