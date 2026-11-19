import { Breadcrumb, Button, Tooltip } from 'antd';
import { MenuUnfoldOutlined, ReadOutlined } from '../../shared/ui/materialIcons';
import { Link, useLocation } from 'react-router-dom';
import { CreateResearchButton } from '../../shared/ui/survey/CreateResearchButton';
import logoUrl from '../../assets/logo.svg';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useTour } from '../tour/useTour';
import type { AppBreadcrumbItem } from './appBreadcrumbs';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderProfileMenu } from './HeaderProfileMenu';

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
  /** Standalone surveys: workspace and account controls live in the sidebar. */
  standalone?: boolean;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
  showBrand?: boolean;
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
  showBrand = false,
}: AppContentHeaderProps) => {
  const { start: startTour } = useTour();
  const { pathname } = useLocation();
  const { canEdit, activeOrganization } = useOrganization();

  return (
  <header className={`app-content-header${standalone ? ' research-header' : ''}`} aria-label="Верхняя панель">
    <div className="app-content-header__main">
      <div className="app-content-header__left">
        {showBrand && <Link className="research-header__brand" to="/surveys" aria-label="СВОД — на главную"><img src={logoUrl} alt="СВОД" /></Link>}
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
        {standalone && canEdit && activeOrganization && /^\/surveys\/(?!studies(?:\/|$)|projects(?:\/|$)|templates(?:\/|$)|resources(?:\/|$)|create(?:\/|$)|from-demo(?:\/|$))[^/]+/.test(pathname) && <CreateResearchButton />}
        {showNotifications && !standalone && (
          <HeaderNotifications
            open={notificationsOpen}
            onOpenChange={onNotificationsOpenChange}
            closeProfile={() => onProfileOpenChange(false)}
          />
        )}
        {!standalone && <Tooltip title="Пройти обучение">
          <Button
            type="text"
            icon={<ReadOutlined />}
            aria-label="Пройти обучение"
            onClick={() => void startTour()}
          />
        </Tooltip>}
      </div>
    </div>
    {!standalone && <HeaderProfileMenu
      open={profileOpen}
      onOpenChange={onProfileOpenChange}
      closeNotifications={() => onNotificationsOpenChange(false)}
      initials={initials}
      avatarUrl={avatarUrl}
      resolvedName={resolvedName}
      resolvedEmail={resolvedEmail}
      onCreateOrg={onCreateOrg}
      showCreateOrg={!standalone}
    />}
  </header>
  );
};
