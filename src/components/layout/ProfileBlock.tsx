import { useState } from 'react';
import { Modal, Toggle } from '@carbon/react';
import { useAuth } from '../../shared/context/auth.context';
import { useThemeMode } from '../../shared/context/theme.context';
import { useOrganization } from '../../shared/context/organization.context';
import {
  deleteOrganization,
  leaveOrganization,
  getOrCreatePublicLink,
} from '../../shared/api/organizations.api';
import { InviteMemberModal } from '../organization/InviteMemberModal';
import { InvitationsDrawer } from '../organization/InvitationsDrawer';
import { MembersModal } from '../organization/MembersModal';

interface HeaderProfilePanelProps {
  open: boolean;
  onClose: () => void;
  onCreateOrg: () => void;
}

export const HeaderProfilePanel = ({
  open,
  onClose,
  onCreateOrg,
}: HeaderProfilePanelProps) => {
  const { user, signOut } = useAuth();
  const { themeMode, toggleTheme } = useThemeMode();
  const { activeOrganization, refreshOrganizations } = useOrganization();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    heading: string;
    body: string;
    danger: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const isOwner =
    !!activeOrganization && activeOrganization.owner_user_id === user?.id;
  const isMember = !!activeOrganization && !isOwner;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleLeaveOrg = () => {
    if (!activeOrganization) return;
    const orgName = activeOrganization.name;
    onClose();
    setConfirmModal({
      heading: 'Выйти из организации',
      body: `Вы уверены, что хотите покинуть «${orgName}»?`,
      danger: true,
      onConfirm: async () => {
        await leaveOrganization(activeOrganization.id);
        await refreshOrganizations();
      },
    });
  };

  const handleDeleteOrg = () => {
    if (!activeOrganization) return;
    const orgName = activeOrganization.name;
    onClose();
    setConfirmModal({
      heading: 'Удалить организацию',
      body: `Вы уверены, что хотите удалить «${orgName}»? Это действие необратимо.`,
      danger: true,
      onConfirm: async () => {
        await deleteOrganization(activeOrganization.id);
        await refreshOrganizations();
      },
    });
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyPublicLink = async () => {
    if (!activeOrganization) return;
    try {
      const link = await getOrCreatePublicLink(activeOrganization.id);
      const url = `${window.location.origin}/public/request/${link.token}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // silently fail
    }
  };

  const menuAction = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <div
        className={`app-header-profile-panel${open ? ' app-header-profile-panel--open' : ''}`}
        role="complementary"
        aria-label="Профиль пользователя"
      >
        <div className="app-header-profile-panel__inner">
          <div className="app-header-profile-panel__body">
            <nav className="app-header-profile-panel__nav" aria-label="Действия профиля">
              <ProfileMenuItem onClick={menuAction(onCreateOrg)}>
                Создать организацию
              </ProfileMenuItem>
              <ProfileMenuItem onClick={menuAction(() => setInvitationsOpen(true))}>
                Приглашения
              </ProfileMenuItem>
              {isOwner && (
                <ProfileMenuItem onClick={menuAction(() => setInviteModalOpen(true))}>
                  Пригласить пользователя
                </ProfileMenuItem>
              )}
              {isOwner && (
                <ProfileMenuItem onClick={menuAction(() => setMembersModalOpen(true))}>
                  Участники
                </ProfileMenuItem>
              )}
              {!!activeOrganization && (
                <ProfileMenuItem onClick={handleCopyPublicLink}>
                  {linkCopied ? 'Ссылка скопирована!' : 'Скопировать ссылку для заявок'}
                </ProfileMenuItem>
              )}

              {isMember && (
                <>
                  <div className="app-header-profile-panel__divider" />
                  <ProfileMenuItem danger onClick={handleLeaveOrg}>
                    Выйти из организации
                  </ProfileMenuItem>
                </>
              )}
            </nav>

            <div className="app-header-profile-panel__bottom">
              <div className="app-header-profile-panel__bottom-row">
                <span className="app-header-profile-panel__bottom-label">Тёмная тема</span>
                <Toggle
                  id="header-profile-theme-toggle"
                  size="sm"
                  toggled={themeMode === 'dark'}
                  onToggle={toggleTheme}
                  hideLabel
                  labelA=""
                  labelB=""
                />
              </div>

              {isOwner && activeOrganization && (
                <button
                  type="button"
                  className="app-header-profile-panel__bottom-action app-header-profile-panel__bottom-action--danger"
                  onClick={handleDeleteOrg}
                >
                  Удалить организацию
                </button>
              )}

              <button
                type="button"
                className="app-header-profile-panel__bottom-action"
                onClick={() => {
                  onClose();
                  void handleSignOut();
                }}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'Выход из системы…' : 'Выйти из системы'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmModal && (
        <Modal
          open
          danger={confirmModal.danger}
          modalHeading={confirmModal.heading}
          primaryButtonText="Подтвердить"
          secondaryButtonText="Отмена"
          onRequestClose={() => setConfirmModal(null)}
          onRequestSubmit={async () => {
            await confirmModal.onConfirm();
            setConfirmModal(null);
          }}
        >
          <p>{confirmModal.body}</p>
        </Modal>
      )}

      <InvitationsDrawer
        open={invitationsOpen}
        onClose={() => setInvitationsOpen(false)}
        onAccepted={() => void refreshOrganizations()}
      />

      {activeOrganization && (
        <>
          <InviteMemberModal
            open={inviteModalOpen}
            onClose={() => setInviteModalOpen(false)}
            organizationId={activeOrganization.id}
          />
          <MembersModal
            open={membersModalOpen}
            onClose={() => setMembersModalOpen(false)}
            organizationId={activeOrganization.id}
            currentUserId={user?.id ?? ''}
          />
        </>
      )}
    </>
  );
};

function ProfileMenuItem({
  children,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        danger
          ? 'app-header-profile-panel__menu-item app-header-profile-panel__menu-item--danger'
          : 'app-header-profile-panel__menu-item'
      }
    >
      {children}
    </button>
  );
}
