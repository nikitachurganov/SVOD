import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useRegisterAuxiliaryPanelCloser } from '../../shared/context/appShellPanels.context';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { getMyInvitations } from '../../shared/api/organizations.api';
import { getNotifications } from '../../shared/api/notifications.api';
import { NotificationsPanelContent } from '../organization/NotificationsPanel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeProfile: () => void;
}

export const HeaderNotifications = ({
  open,
  onOpenChange,
  closeProfile,
}: Props) => {
  const location = useLocation();
  const { refreshOrganizations } = useOrganization();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      const [invitations, notifications] = await Promise.all([
        getMyInvitations(),
        getNotifications(1),
      ]);
      setPendingCount(invitations.length + notifications.unread_count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyInvitations(), getNotifications(1)])
      .then(([invitations, notifications]) => {
        if (!cancelled) setPendingCount(invitations.length + notifications.unread_count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useRegisterAuxiliaryPanelCloser(() => onOpenChange(false));

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) void refreshCount();
  };

  const label =
    pendingCount > 0
      ? `Уведомления, приглашений: ${pendingCount}`
      : 'Уведомления';

  return (
    <Popover
      classNames={{ root: 'app-header-notifications-popover' }}
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      content={
        <div className="app-header-notifications-popover-content">
          {/* Scrolling lives on this inner box, not the rounded/shadowed outer one —
              otherwise the native scrollbar renders as a straight bar cutting across
              the rounded corners. The outer box's overflow:hidden clips it cleanly. */}
          <div className="app-header-notifications-popover-scroll">
            <NotificationsPanelContent
              open={open}
              onAccepted={() => void refreshOrganizations()}
              onInvitationsChanged={() => void refreshCount()}
              onNotificationsChanged={() => void refreshCount()}
            />
          </div>
        </div>
      }
    >
      <span className="app-header-notifications-wrap">
        <button
          type="button"
          className={`app-header__action-btn${open ? ' app-header__action-btn--active' : ''}`}
          aria-label={label}
          onClick={() => {
            closeProfile();
            handleOpenChange(!open);
          }}
        >
          <BellOutlined style={{ fontSize: 16 }} />
        </button>
        {pendingCount > 0 ? (
          <span className="app-header-notifications-badge" aria-hidden>
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        ) : null}
      </span>
    </Popover>
  );
};
