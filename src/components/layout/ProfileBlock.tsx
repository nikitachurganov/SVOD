import { useState } from 'react';
import { App as AntApp, Avatar, Button, Dropdown, Switch, Typography, theme } from 'antd';
import {
  EllipsisOutlined,
  PlusOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useAuth } from '../../shared/context/auth.context';
import { useThemeMode } from '../../shared/context/theme.context';
import { useOrganization } from '../../shared/context/organization.context';
import { buildDisplayName } from '../../shared/utils/userName';
import { deleteOrganization, leaveOrganization } from '../../shared/api/organizations.api';
import { InviteMemberModal } from '../organization/InviteMemberModal';
import { InvitationsDrawer } from '../organization/InvitationsDrawer';
import { MembersModal } from '../organization/MembersModal';

const { Text } = Typography;

interface Props {
  onCreateOrgClick: () => void;
}

export const ProfileBlock = ({ onCreateOrgClick }: Props) => {
  const { token } = theme.useToken();
  const { notification, modal } = AntApp.useApp();
  const { user, profile, signOut } = useAuth();
  const { themeMode, toggleTheme } = useThemeMode();
  const { activeOrganization, refreshOrganizations } = useOrganization();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);

  const email = profile?.email ?? user?.email ?? '';
  const avatarUrl = profile?.avatarUrl ?? null;
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
    modal.confirm({
      title: 'Выйти из организации',
      content: `Вы уверены, что хотите покинуть «${orgName}»?`,
      okText: 'Выйти',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await leaveOrganization(activeOrganization.id);
          await refreshOrganizations();
          notification.success({ message: `Вы вышли из организации «${orgName}»` });
        } catch {
          notification.error({ message: 'Не удалось выйти из организации' });
        }
      },
    });
  };

  const handleDeleteOrg = () => {
    if (!activeOrganization) return;
    const orgName = activeOrganization.name;
    modal.confirm({
      title: 'Удалить организацию',
      content: `Вы уверены, что хотите удалить «${orgName}»? Это действие необратимо.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteOrganization(activeOrganization.id);
          await refreshOrganizations();
          notification.success({ message: `Организация «${orgName}» удалена` });
        } catch {
          notification.error({ message: 'Не удалось удалить организацию' });
        }
      },
    });
  };

  const profileMenuItems: MenuProps['items'] = [
    { key: 'create-org', icon: <PlusOutlined />, label: 'Создать организацию' },
    { key: 'settings', label: 'Настройки' },
    { type: 'divider' },
    { key: 'invitations', label: 'Приглашения' },
    ...(isOwner
      ? [
          {
            key: 'invite-user',
            icon: <UserAddOutlined />,
            label: 'Пригласить пользователя',
          },
          {
            key: 'manage-members',
            icon: <TeamOutlined />,
            label: 'Участники',
          },
          { key: 'delete-org', label: 'Удалить организацию', danger: true },
        ]
      : []),
    ...(isMember
      ? [{ key: 'leave-org', label: 'Выйти из организации', danger: true }]
      : []),
    { type: 'divider' },
    {
      key: 'theme',
      label: (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            minWidth: 140,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>Тема</span>
          <Switch
            checked={themeMode === 'dark'}
            onChange={toggleTheme}
            size="small"
            aria-label={themeMode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          />
        </div>
      ),
    },
    { key: 'support', label: 'Поддержка' },
    { key: 'feedback', label: 'Обратная связь' },
    { type: 'divider' },
    { key: 'logout', label: 'Выйти' },
  ];

  const handleProfileMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'logout':
        void handleSignOut();
        break;
      case 'create-org':
        onCreateOrgClick();
        break;
      case 'invitations':
        setInvitationsOpen(true);
        break;
      case 'invite-user':
        setInviteModalOpen(true);
        break;
      case 'manage-members':
        setMembersModalOpen(true);
        break;
      case 'leave-org':
        handleLeaveOrg();
        break;
      case 'delete-org':
        handleDeleteOrg();
        break;
    }
  };

  return (
    <>
      <div
        style={{
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar src={avatarUrl ?? undefined} icon={<UserOutlined />} size={36}>
          {!avatarUrl ? displayName.charAt(0).toUpperCase() : null}
        </Avatar>

        <div style={{ minWidth: 0, flex: 1 }}>
          <Text
            strong
            style={{ color: token.colorTextLightSolid, fontSize: 13, display: 'block' }}
            ellipsis={{ tooltip: displayName }}
          >
            {displayName}
          </Text>
          <Text
            style={{
              color: token.colorTextLightSolid,
              opacity: 0.75,
              fontSize: 12,
              display: 'block',
            }}
            ellipsis={{ tooltip: email }}
          >
            {email || 'Нет email'}
          </Text>
        </div>

        <Dropdown
          trigger={['click']}
          menu={{
            items: profileMenuItems,
            onClick: handleProfileMenuClick,
          }}
        >
          <Button
            type="text"
            icon={<EllipsisOutlined />}
            aria-label="Меню профиля"
            style={{ color: token.colorTextLightSolid }}
            loading={isSigningOut}
          />
        </Dropdown>
      </div>

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
