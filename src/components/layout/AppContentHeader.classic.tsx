// The production design (src/shared/config/design.ts): this screen as it was before the redesign (ace7f37).
// Shown while IS_CLASSIC; the new design uses the file without `.classic`. Delete together once the new one is the only one.
import { Breadcrumb, Button, Tooltip } from 'antd';
import { MenuUnfoldOutlined, ReadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
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
  /** Standalone surveys service: the brand and the workspace switcher live in its side panel, the account stays here */
  standalone?: boolean;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
}

export const AppContentHeaderClassic = ({
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
