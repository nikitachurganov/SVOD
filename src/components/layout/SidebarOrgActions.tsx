import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, ToastNotification } from '@carbon/react';
import { useAuth } from '../../shared/context/auth.context';
import { useOrganization } from '../../shared/context/organization.context';
import { getOrCreatePublicLink } from '../../shared/api/organizations.api';
import { InviteMemberModal } from '../organization/InviteMemberModal';

/**
 * Owner/member actions for the active org: public request link + invite (owner only).
 * Rendered in the left sidebar below the organization switcher.
 */
export const SidebarOrgActions = () => {
  const { user } = useAuth();
  const { organizations, activeOrganization, isLoading } = useOrganization();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyToast, setCopyToast] = useState<{ id: number } | null>(null);

  if (isLoading || organizations.length === 0 || !activeOrganization) {
    return null;
  }

  const isOwner = activeOrganization.owner_user_id === user?.id;

  const handleCopyPublicLink = async () => {
    try {
      const link = await getOrCreatePublicLink(activeOrganization.id);
      const url = `${window.location.origin}/form/${link.token}`;
      await navigator.clipboard.writeText(url);
      setCopyToast({ id: Date.now() });
    } catch {
      // silently fail
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <Button
          kind="ghost"
          size="sm"
          onClick={() => void handleCopyPublicLink()}
          style={{ width: '100%', maxWidth: '100%', justifyContent: 'flex-start' }}
        >
          Скопировать ссылку для заявок
        </Button>
        {isOwner && (
          <Button
            kind="ghost"
            size="sm"
            onClick={() => setInviteOpen(true)}
            style={{ width: '100%', maxWidth: '100%', justifyContent: 'flex-start' }}
          >
            Пригласить пользователя
          </Button>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        organizationId={activeOrganization.id}
      />

      {copyToast &&
        createPortal(
          <div className="app-sidebar-copy-toast-anchor">
            <ToastNotification
              key={copyToast.id}
              kind="success"
              lowContrast
              title="Ссылка скопирована"
              subtitle="Ссылка для подачи заявки скопирована в буфер обмена."
              timeout={5000}
              onClose={() => setCopyToast(null)}
              aria-label="Закрыть уведомление"
            />
          </div>,
          document.body,
        )}
    </>
  );
};
