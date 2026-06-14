import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Popover } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { SidebarOrgActions } from './SidebarOrgActions';

const SidebarCollapsedOrgPopoverInner = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-side-nav-rail__org">
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomLeft"
        arrow={false}
        content={
          <div className="app-sidebar-collapsed-org-popover">
            <OrganizationSwitcher />
            <SidebarOrgActions />
          </div>
        }
      >
        <button
          type="button"
          className={`app-side-nav-rail__item${open ? ' app-side-nav-rail__item--menu-open' : ''}`}
          aria-label="Организация: переключить и действия"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <BankOutlined style={{ fontSize: 20 }} />
        </button>
      </Popover>
    </div>
  );
};

/**
 * В свёрнутом сайдбаре: иконка организации, по клику — переключатель и действия,
 * как в развёрнутой нижней части панели.
 */
export const SidebarCollapsedOrgPopover = () => {
  const { organizations, isLoading } = useOrganization();
  const location = useLocation();

  if (isLoading || organizations.length === 0) {
    return null;
  }

  return <SidebarCollapsedOrgPopoverInner key={location.pathname} />;
};
