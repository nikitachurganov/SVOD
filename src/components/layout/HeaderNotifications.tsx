import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HeaderGlobalAction, Popover, PopoverContent } from '@carbon/react';
import { Notification } from '@carbon/react/icons';
import { useRegisterAuxiliaryPanelCloser } from '../../shared/context/appShellPanels.context';
import { useOrganization } from '../../shared/context/organization.context';
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
    void refreshCount();
  }, [refreshCount, location.pathname]);

  useRegisterAuxiliaryPanelCloser(() => onOpenChange(false));

  const label =
    pendingCount > 0
      ? `Уведомления, приглашений: ${pendingCount}`
      : 'Уведомления';

  return (
    <Popover
      open={open}
      onRequestClose={() => onOpenChange(false)}
      align="bottom-end"
      autoAlign
      caret={false}
      dropShadow
    >
      <span className="app-header-notifications-wrap">
        <HeaderGlobalAction
          aria-label={label}
          tooltipAlignment="end"
          isActive={open}
          onClick={() => {
            closeProfile();
            onOpenChange(!open);
          }}
        >
          <Notification size={20} />
        </HeaderGlobalAction>
        {pendingCount > 0 ? (
          <span className="app-header-notifications-badge" aria-hidden>
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        ) : null}
      </span>
      <PopoverContent className="app-header-notifications-popover-content">
        <NotificationsPanelContent
          open={open}
          onAccepted={() => void refreshOrganizations()}
          onInvitationsChanged={() => void refreshCount()}
        />
      </PopoverContent>
    </Popover>
  );
};
