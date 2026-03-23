import { useState } from 'react';
import { HeaderPanel, Toggle, Modal, Button } from '@carbon/react';
import { useAuth } from '../../shared/context/auth.context';
import { useThemeMode } from '../../shared/context/theme.context';
import { useOrganization } from '../../shared/context/organization.context';
import { buildDisplayName } from '../../shared/utils/userName';
import { deleteOrganization, leaveOrganization } from '../../shared/api/organizations.api';
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
  const { user, profile, signOut } = useAuth();
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

  const email = profile?.email ?? user?.email ?? '';
  const displayName = profile
    ? buildDisplayName({
        lastName: profile.lastName,
        firstName: profile.firstName,
        middleName: profile.middleName,
      }) || 'Пользователь'
    : 'Пользователь';

  const isOwner =
    !!activeOrganization && activeOrganization.owner_user_id === user?.id;
  const isMember = !!activeOrganization && !isOwner;
  const initials = displayName.charAt(0).toUpperCase();

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

  const menuAction = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <HeaderPanel expanded={open} aria-label="Профиль пользователя">
        <div style={{ padding: '1rem', width: 256 }}>
          {/* User info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--cds-border-subtle)',
              marginBottom: '0.5rem',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--cds-interactive)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--cds-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {email || 'Нет email'}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

            <div
              style={{
                borderTop: '1px solid var(--cds-border-subtle)',
                margin: '0.5rem 0',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
              }}
            >
              <span style={{ fontSize: 14 }}>Тёмная тема</span>
              <Toggle
                id="header-theme-toggle"
                size="sm"
                toggled={themeMode === 'dark'}
                onToggle={toggleTheme}
                hideLabel
                labelA=""
                labelB=""
              />
            </div>

            <div
              style={{
                borderTop: '1px solid var(--cds-border-subtle)',
                margin: '0.5rem 0',
              }}
            />

            {isOwner && (
              <ProfileMenuItem danger onClick={handleDeleteOrg}>
                Удалить организацию
              </ProfileMenuItem>
            )}
            {isMember && (
              <ProfileMenuItem danger onClick={handleLeaveOrg}>
                Выйти из организации
              </ProfileMenuItem>
            )}
            <ProfileMenuItem
              onClick={() => {
                onClose();
                void handleSignOut();
              }}
            >
              {isSigningOut ? 'Выход…' : 'Выйти'}
            </ProfileMenuItem>
          </nav>
        </div>
      </HeaderPanel>

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
      style={{
        display: 'block',
        width: '100%',
        padding: '0.5rem 0',
        background: 'none',
        border: 'none',
        textAlign: 'left',
        fontSize: 14,
        cursor: 'pointer',
        color: danger ? 'var(--cds-text-error)' : 'var(--cds-text-primary)',
        transition: 'color 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger
          ? 'var(--cds-text-error)'
          : 'var(--cds-link-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = danger
          ? 'var(--cds-text-error)'
          : 'var(--cds-text-primary)';
      }}
    >
      {children}
    </button>
  );
}
