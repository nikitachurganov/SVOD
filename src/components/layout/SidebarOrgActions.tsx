import { useState } from 'react';
import { message } from 'antd';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { getOrCreatePublicLink } from '../../shared/api/organizations.api';
import { InviteMemberModal } from '../organization/InviteMemberModal';

/**
 * Owner/member actions for the active org: public request link + invite (owner only).
 * Rendered in the left sidebar below the organization profile row.
 */
export const SidebarOrgActions = () => {
  const { user } = useAuth();
  const { organizations, activeOrganization, isLoading } = useOrganization();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  if (isLoading || organizations.length === 0 || !activeOrganization) {
    return null;
  }

  const isOwner = activeOrganization.owner_user_id === user?.id;

  const handleCopyPublicLink = async () => {
    try {
      const link = await getOrCreatePublicLink(activeOrganization.id);
      const url = `${window.location.origin}/form/${link.token}`;
      await navigator.clipboard.writeText(url);
      messageApi.success({
        content: 'Ссылка для подачи заявки скопирована в буфер обмена.',
        duration: 5,
      });
    } catch {
      // silently fail
    }
  };

  return (
    <>
      {contextHolder}
      <div className="app-sidebar-org-actions">
        <button
          type="button"
          className="app-sidebar-org-actions__link"
          onClick={() => void handleCopyPublicLink()}
        >
          Ссылка на заполнение заявки
        </button>
        {isOwner && (
          <button
            type="button"
            className="app-sidebar-org-actions__link"
            onClick={() => setInviteOpen(true)}
          >
            Ссылка на приглашение
          </button>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        organizationId={activeOrganization.id}
      />
    </>
  );
};
