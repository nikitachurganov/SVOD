import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useRegisterAuxiliaryPanelCloser } from '../../shared/context/appShellPanels.context';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { getMyInvitations } from '../../shared/api/organizations.api';
import { getNotifications } from '../../shared/api/notifications.api';
import { NotificationsPanelContent } from '../organization/NotificationsPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: 'right' | 'top';
}

/** The bell of the sidebar: the same invitations and notifications as the header one, in a shadcn popover */
export const SidebarNotifications = ({ open, onOpenChange, side }: Props) => {
  const location = useLocation();
  const { refreshOrganizations } = useOrganization();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      const [invitations, notifications] = await Promise.all([getMyInvitations(), getNotifications(1)]);
      setPendingCount(invitations.length + notifications.unread_count);
    } catch {
      // the badge is a hint only
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyInvitations(), getNotifications(1)])
      .then(([invitations, notifications]) => { if (!cancelled) setPendingCount(invitations.length + notifications.unread_count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);

  useRegisterAuxiliaryPanelCloser(() => onOpenChange(false));

  const label = pendingCount > 0 ? `Уведомления, приглашений: ${pendingCount}` : 'Уведомления';
  return <Popover open={open} onOpenChange={(next) => { onOpenChange(next); if (next) void refreshCount(); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} title="Уведомления" className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted">
        <Bell className="h-3.5 w-3.5" />
        {pendingCount > 0 && <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fc8507] px-1 text-[10px] font-bold text-white">{pendingCount > 99 ? '99+' : pendingCount}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent side={side} align="end" sideOffset={8} className="w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl p-0">
      <div className="max-h-[70vh] overflow-y-auto">
        <NotificationsPanelContent open={open} onAccepted={() => void refreshOrganizations()} onInvitationsChanged={() => void refreshCount()} onNotificationsChanged={() => void refreshCount()} />
      </div>
    </PopoverContent>
  </Popover>;
};
