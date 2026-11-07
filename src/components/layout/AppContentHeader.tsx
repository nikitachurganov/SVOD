import { Breadcrumb, Button, Tooltip } from 'antd';
import { MenuUnfoldOutlined, ReadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTour } from '../tour/useTour';
import type { AppBreadcrumbItem } from './appBreadcrumbs';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderProfileMenu } from './HeaderProfileMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { HOME_PATH } from '../../shared/config/appMode';
import logoUrl from '../../assets/logo.svg';

interface AppContentHeaderProps {
  breadcrumbs: AppBreadcrumbItem[] | null;
  notificationsOpen: boolean;
  onNotificationsOpenChange: (open: boolean) => void;
  profileOpen: boolean;
  onProfileOpenChange: (open: boolean) => void;
  initials: string;
  avatarUrl?: string | null;
  resolvedName: string;
  resolvedEmail: string;
  onCreateOrg: () => void;
  /** Invitations to a team and decisions on join requests */
  showNotifications?: boolean;
  /** Standalone surveys service: no sidebar, the brand and the workspace switcher live here */
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
  avatarUrl,
  resolvedName,
  resolvedEmail,
  onCreateOrg,
  showNotifications = true,
  standalone = false,
  showMobileMenu,
  onMobileMenuClick,
}: AppContentHeaderProps) => {
  const { start: startTour } = useTour();

  return (
  <header className="app-content-header" aria-label="Верхняя панель">
    {standalone && (
      <div className="app-header-brand">
        <Link to={HOME_PATH} className="app-header-brand__link" aria-label="СВОД Опросы — на главную">
          <img src={logoUrl} alt="СВОД" className="app-header-brand__logo" />
          <span className="app-header-brand__name">Опросы</span>
        </Link>
      </div>
    )}
    <div className="app-content-header__main">
      <div className="app-content-header__left">
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
        {standalone && <WorkspaceSwitcher onCreateTeam={onCreateOrg} />}
        {showNotifications && (
          <HeaderNotifications
            open={notificationsOpen}
            onOpenChange={onNotificationsOpenChange}
            closeProfile={() => onProfileOpenChange(false)}
          />
        )}
        <Tooltip title="Пройти обучение">
          <Button
            type="text"
            icon={<ReadOutlined />}
            aria-label="Пройти обучение"
            onClick={() => void startTour()}
          />
        </Tooltip>
      </div>
    </div>
    <HeaderProfileMenu
      open={profileOpen}
      onOpenChange={onProfileOpenChange}
      closeNotifications={() => onNotificationsOpenChange(false)}
      initials={initials}
      avatarUrl={avatarUrl}
      resolvedName={resolvedName}
      resolvedEmail={resolvedEmail}
      onCreateOrg={onCreateOrg}
      showCreateOrg={!standalone}
    />
  </header>
  );
};
