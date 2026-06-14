import { Breadcrumb, Button } from 'antd';
import { MenuUnfoldOutlined } from '@ant-design/icons';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderProfileMenu } from './HeaderProfileMenu';

interface AppContentHeaderProps {
  breadcrumbs: { title: string }[];
  notificationsOpen: boolean;
  onNotificationsOpenChange: (open: boolean) => void;
  profileOpen: boolean;
  onProfileOpenChange: (open: boolean) => void;
  initials: string;
  resolvedName: string;
  resolvedEmail: string;
  onCreateOrg: () => void;
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
  showMobileMenu,
  onMobileMenuClick,
}: AppContentHeaderProps) => (
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
        <Breadcrumb
          className="app-content-header__breadcrumb"
          items={breadcrumbs.map((item, index) => ({
            title: item.title,
            key: `${item.title}-${index}`,
          }))}
        />
      </div>
      <HeaderNotifications
        open={notificationsOpen}
        onOpenChange={onNotificationsOpenChange}
        closeProfile={() => onProfileOpenChange(false)}
      />
    </div>
    <HeaderProfileMenu
      open={profileOpen}
      onOpenChange={onProfileOpenChange}
      closeNotifications={() => onNotificationsOpenChange(false)}
      initials={initials}
      resolvedName={resolvedName}
      resolvedEmail={resolvedEmail}
      onCreateOrg={onCreateOrg}
    />
  </header>
);
