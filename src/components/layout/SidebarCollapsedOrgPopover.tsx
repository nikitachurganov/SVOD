import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Popover, PopoverContent } from '@carbon/react';
import { Enterprise } from '@carbon/react/icons';
import { useOrganization } from '../../shared/context/organization.context';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { SidebarOrgActions } from './SidebarOrgActions';

/**
 * В свёрнутом сайдбаре: иконка организации, по клику — переключатель и действия,
 * как в развёрнутой нижней части панели.
 */
export const SidebarCollapsedOrgPopover = () => {
  const { organizations, isLoading } = useOrganization();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (isLoading || organizations.length === 0) {
    return null;
  }

  return (
    <div className="app-side-nav-rail__org">
      <Popover
        open={open}
        onRequestClose={() => setOpen(false)}
        align="bottom-start"
        autoAlign
        caret={false}
        dropShadow
      >
        <button
          type="button"
          className={`app-side-nav-rail__item${open ? ' app-side-nav-rail__item--menu-open' : ''}`}
          aria-label="Организация: переключить и действия"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Enterprise size={20} />
        </button>
        <PopoverContent className="app-sidebar-collapsed-org-popover">
          <OrganizationSwitcher />
          <SidebarOrgActions />
        </PopoverContent>
      </Popover>
    </div>
  );
};
