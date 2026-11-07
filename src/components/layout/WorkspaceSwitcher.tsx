import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined, PlusOutlined, SettingOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import type { OrganizationResponse } from '../../types/organization';

interface Props {
  onCreateTeam: () => void;
}

const PERSONAL_LABEL = 'Личное пространство';

const workspaceName =(org: OrganizationResponse): string => (org.is_personal ? PERSONAL_LABEL : org.name);

/**
 * Standalone surveys service: which workspace the person is in (their own or one of their teams),
 * the way to the team's people and settings, and the way to start a new team.
 */
export const WorkspaceSwitcher = ({ onCreateTeam }: Props) => {
  const navigate = useNavigate();
  const { organizations, activeOrganization, isLoading, setActiveOrganizationId } = useOrganization();

  if (isLoading || !activeOrganization) return null;

  const inTeam = !activeOrganization.is_personal;

  const items: MenuProps['items'] = [
    {
      type: 'group',
      label: 'Рабочие пространства',
      children: organizations.map((org) => ({
        key: `org:${org.id}`,
        icon: org.is_personal ? <UserOutlined /> : <TeamOutlined />,
        label: workspaceName(org),
      })),
    },
    { type: 'divider' },
    ...(inTeam
      ? [
          { key: 'participants', icon: <TeamOutlined />, label: 'Участники команды' },
          { key: 'settings', icon: <SettingOutlined />, label: 'Настройки команды' },
        ]
      : []),
    { key: 'create', icon: <PlusOutlined />, label: 'Создать команду' },
  ];

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'create') onCreateTeam();
    else if (key === 'participants') navigate('/participants');
    else if (key === 'settings') navigate('/settings/organization');
    else if (key.startsWith('org:')) {
      setActiveOrganizationId(key.slice('org:'.length));
      // A page of the previous workspace (a survey, a project) does not exist in the next one
      navigate('/surveys');
    }
  };

  return (
    <Dropdown
      classNames={{ root: 'app-menu-dropdown' }}
      menu={{ items, onClick, selectedKeys: [`org:${activeOrganization.id}`] }}
      trigger={['click']}
      placement="bottomRight"
    >
      <button type="button" className="workspace-switcher" aria-label="Рабочее пространство" aria-haspopup="menu">
        {inTeam ? <TeamOutlined aria-hidden /> : <UserOutlined aria-hidden />}
        <span className="workspace-switcher__name">{workspaceName(activeOrganization)}</span>
        <DownOutlined className="workspace-switcher__arrow" aria-hidden />
      </button>
    </Dropdown>
  );
};
