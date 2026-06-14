import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useRegisterAuxiliaryPanelCloser } from '../../shared/context/appShellPanels.context';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { getMyInvitations } from '../../shared/api/organizations.api';
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
      const data = await getMyInvitations();
      setPendingCount(data.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyInvitations()
      .then((data) => {
        if (!cancelled) setPendingCount(data.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useRegisterAuxiliaryPanelCloser(() => onOpenChange(false));

  const label =
    pendingCount > 0
      ? `Уведомления, приглашений: ${pendingCount}`
      : 'Уведомления';

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      content={
        <div className="app-header-notifications-popover-content">
          <NotificationsPanelContent
            open={open}
            onAccepted={() => void refreshOrganizations()}
            onInvitationsChanged={() => void refreshCount()}
          />
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
            onOpenChange(!open);
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
