import { Input, Button, Tooltip } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { SidebarOrgActions } from './SidebarOrgActions';
import { SidebarCollapsedOrgPopover } from './SidebarCollapsedOrgPopover';
import { NAV_ITEMS } from './navItems';
import logoUrl from '../../assets/logo.svg';

interface AppSidebarProps {
  selectedKey: string;
  isCollapsed: boolean;
  isDesktop: boolean;
  isMobileOpen: boolean;
  showOrgBlock: boolean;
  onNavigate: (path: string) => void;
  onToggleCollapse: () => void;
}

export const AppSidebar = ({
  selectedKey,
  isCollapsed,
  isDesktop,
  isMobileOpen,
  showOrgBlock,
  onNavigate,
  onToggleCollapse,
}: AppSidebarProps) => {
  const sidebarClass = [
    'app-sidebar',
    !isDesktop && isMobileOpen ? 'app-sidebar--mobile-open' : '',
    isDesktop && isCollapsed ? 'app-sidebar--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (isDesktop && isCollapsed) {
    return (
      <aside className={sidebarClass} aria-label="Боковая навигация">
        <div className="app-sidebar__collapsed-top">
          <Button
            type="text"
            size="small"
            className="app-sidebar__collapse-btn"
            icon={<MenuUnfoldOutlined />}
            aria-label="Развернуть боковую навигацию"
            onClick={onToggleCollapse}
          />
        </div>
        <nav className="app-side-nav-rail" aria-label="Навигация (свёрнута)">
          <div className="app-side-nav-rail__main">
            {NAV_ITEMS.map((item) => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <button
                  type="button"
                  aria-label={item.label}
                  aria-current={selectedKey === item.key ? 'page' : undefined}
                  className={`app-side-nav-rail__item${selectedKey === item.key ? ' app-side-nav-rail__item--active' : ''}`}
                  onClick={() => onNavigate(item.path)}
                >
                  <item.Icon style={{ fontSize: 14 }} />
                </button>
              </Tooltip>
            ))}
          </div>
          {showOrgBlock && <SidebarCollapsedOrgPopover />}
        </nav>
      </aside>
    );
  }

  return (
    <aside className={sidebarClass} aria-label="Боковая навигация">
      <div className="app-sidebar__brand">
        <a href="/" className="app-sidebar__logo" onClick={(e) => { e.preventDefault(); onNavigate('/requests'); }}>
          <img src={logoUrl} alt="СВОД" className="app-sidebar__logo-image" />
        </a>
        <Button
          type="text"
          size="small"
          className="app-sidebar__collapse-btn"
          icon={<MenuFoldOutlined />}
          aria-label="Свернуть боковую навигацию"
          onClick={onToggleCollapse}
        />
      </div>

      <div className="app-sidebar__search">
        <Input
          variant="borderless"
          size="small"
          prefix={<SearchOutlined className="app-sidebar__search-icon" />}
          placeholder="Поиск по сервису"
          className="app-sidebar__search-input"
        />
      </div>

      <nav className="app-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`app-sidebar__nav-item${isActive ? ' app-sidebar__nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.path)}
            >
              <item.Icon style={{ fontSize: 14 }} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {showOrgBlock && (
        <div className="app-sidebar__org">
          <OrganizationSwitcher />
          <SidebarOrgActions />
        </div>
      )}
    </aside>
  );
};
