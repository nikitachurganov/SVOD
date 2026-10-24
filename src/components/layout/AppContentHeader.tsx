import { Breadcrumb, Button } from 'antd';
import { MenuUnfoldOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { AppBreadcrumbItem } from './appBreadcrumbs';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderProfileMenu } from './HeaderProfileMenu';
import { HOME_PATH } from '../../shared/config/appMode';
import logoUrl from '../../assets/logo.svg';

interface AppContentHeaderProps {
  breadcrumbs: AppBreadcrumbItem[] | null;
  notificationsOpen: boolean;
  onNotificationsOpenChange: (open: boolean) => void;
  profileOpen: boolean;
  onProfileOpenChange: (open: boolean) => void;
  initials: string;
  resolvedName: string;
  resolvedEmail: string;
  onCreateOrg: () => void;
  /** Invitations and platform notifications; off in the standalone surveys service */
  showNotifications?: boolean;
  /** Standalone surveys service: no sidebar and no organizations, the brand lives here */
  standalone?: boolean;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
}

export const AppContentHeader = ({
  breadcrumbs,
  notificationsOpen,
  onNotificationsOpenChange,
  profileOpen,
  onProfileOpenChange,
  initials,
  resolvedName,
  resolvedEmail,
  onCreateOrg,
  showNotifications = true,
  standalone = false,
  showMobileMenu,
  onMobileMenuClick,
}: AppContentHeaderProps) => (
  <header className="app-content-header" aria-label="Верхняя панель">
    <div className="app-content-header__main">
      <div className="app-content-header__left">
        {standalone && (
          <Link to={HOME_PATH} className="app-header-brand" aria-label="Опросы — на главную">
            <img src={logoUrl} alt="СВОД" className="app-header-brand__logo" />
            <span className="app-header-brand__name">Опросы</span>
          </Link>
        )}
        {showMobileMenu && (
          <Button
            type="text"
            size="small"
            className="app-content-header__menu-btn"
            icon={<MenuUnfoldOutlined />}
            aria-label="Открыть боковую навигацию"
            onClick={onMobileMenuClick}
          />
        )}
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumb
            className="app-content-header__breadcrumb"
            items={breadcrumbs.map((item, index) => ({
              title: item.path ? (
                <Link to={item.path}>{item.title}</Link>
              ) : (
                item.title
              ),
              key: `${item.title}-${index}`,
            }))}
          />
        ) : null}
      </div>
      <div className="app-content-header__right">
        {showNotifications && (
          <HeaderNotifications
            open={notificationsOpen}
            onOpenChange={onNotificationsOpenChange}
            closeProfile={() => onProfileOpenChange(false)}
          />
        )}
      </div>
    </div>
    <HeaderProfileMenu
      open={profileOpen}
      onOpenChange={onProfileOpenChange}
      closeNotifications={() => onNotificationsOpenChange(false)}
      initials={initials}
      resolvedName={resolvedName}
      resolvedEmail={resolvedEmail}
      onCreateOrg={onCreateOrg}
      showCreateOrg={!standalone}
    />
  </header>
);
