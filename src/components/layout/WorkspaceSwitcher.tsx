import { useEffect, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { Icon } from '@iconify/react';
import type { MenuProps } from 'antd';
import { PlusOutlined, TeamOutlined } from '../../shared/ui/materialIcons';
import { useNavigate } from 'react-router-dom';
import { getPlans } from '../../shared/api/billing.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { UpgradeModal } from '../billing/UpgradeModal';
import { useWorkspaceUsage } from './useWorkspaceUsage';
import { BEFORE_WORKSPACE_CHANGE } from '../../shared/hooks/useResearchUnsavedChanges';

interface Props {
  onCreateTeam: () => void;
  placement?: 'bottomRight' | 'bottomLeft' | 'topLeft';
  /** Fill the width of the container (the side panel) instead of fitting the name */
  block?: boolean;
}

/** The plan of the workspace as the small tag next to its name; the free plan is the quiet one */
const PLAN_TAGS: Record<string, { label: string; paid: boolean }> = {
  start: { label: 'Старт', paid: false },
  unlimited: { label: 'Без лимитов', paid: true },
  pack: { label: 'Исследование', paid: true },
  researcher: { label: 'Исследователь', paid: true },
};

const AVATAR_COLORS = ['#e8b931', '#4c9be8', '#5cc08a', '#d9738c', '#9b7fe6', '#e08a4a'];

/** The same name always gets the same colour */
const avatarColor = (name: string): string => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

/** Two chevrons, one over the other: the switcher opens a list to choose from, not just a menu down */
const ChevronsUpDown = () => (
  <Icon
    icon="material-symbols:unfold-more-rounded"
    className="workspace-switcher__arrow"
    width="14"
    height="14"
    aria-hidden
  />
);

/**
 * Standalone surveys service: which team the person is in, the way to the team's people and settings,
 * and the way to start a new team.
 */
export const WorkspaceSwitcher = ({ onCreateTeam, placement = 'bottomRight', block = false }: Props) => {
  const navigate = useNavigate();
  const { organizations, activeOrganization, isLoading, setActiveOrganizationId } = useOrganization();
  const activeId = activeOrganization?.id ?? null;
  // The plan of the active workspace (the owner's plan); the tag is left out while it is unknown
  // or when the tariffs are switched off
  const shown = useWorkspaceUsage(activeId);
  // Whether the payment can be made online right now; without it the tag of a free plan is only a label
  const [canPay, setCanPay] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((plans) => {
        if (!cancelled) setCanPay(plans.payments_enabled);
      })
      .catch(() => {
        if (!cancelled) setCanPay(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading || !activeOrganization) return null;

  const name = activeOrganization.name;
  const tag = shown ? PLAN_TAGS[shown.usage.plan_code] : undefined;
  // The plan belongs to the person who pays, so only the owner of the workspace can change it: on the free
  // plan the tag opens the plans, on a paid one the page of the plan and its quota
  const isOwner = Boolean(user) && activeOrganization.owner_user_id === user?.id;
  const tagAction: 'buy' | 'manage' | null = !tag || !isOwner ? null : tag.paid ? 'manage' : canPay ? 'buy' : null;
  const canUpgrade = tagAction === 'buy';

  const items: MenuProps['items'] = [
    {
      type: 'group',
      label: 'Рабочие пространства',
      children: organizations.map((org) => {
        // The active workspace is the freshest (it is re-read after a payment); the others come with the list
        const code = org.id === activeId && shown ? shown.usage.plan_code : org.plan_code;
        const planTag = code ? PLAN_TAGS[code] : undefined;
        return {
          key: `org:${org.id}`,
          icon: <TeamOutlined />,
          label: (
            <span className="workspace-menu-item">
              <span className="workspace-menu-item__name" title={org.name}>{org.name}</span>
              {planTag ? (
                <span className={`workspace-switcher__plan${planTag.paid ? ' workspace-switcher__plan--paid' : ''}`}>
                  {planTag.label}
                </span>
              ) : null}
            </span>
          ),
        };
      }),
    },
    { type: 'divider' },
    { key: 'people', icon: <TeamOutlined />, label: 'Участники команды' },
    { key: 'settings', label: 'Настройки пространства' },
    ...(isOwner ? [{ key: 'plan', label: 'Тариф и квота' }] : []),
    { key: 'create', icon: <PlusOutlined />, label: 'Создать команду' },
  ];

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'create') onCreateTeam();
    else if (key === 'people') navigate('/participants');
    else if (key === 'settings') navigate('/settings');
    else if (key === 'plan') navigate('/settings?tab=plans');
    else if (key.startsWith('org:')) {
      if (key === `org:${activeOrganization.id}`) return;
      if (!window.dispatchEvent(new Event(BEFORE_WORKSPACE_CHANGE, { cancelable: true }))) return;
      setActiveOrganizationId(key.slice('org:'.length));
      // A page of the previous workspace (a survey, a project) does not exist in the next one
      navigate('/surveys');
    }
  };

  return (
    <>
      <Dropdown
        classNames={{ root: 'app-menu-dropdown workspace-dropdown' }}
        styles={{ root: { width: menuWidth } }}
        onOpenChange={(open) => {
          if (open) setMenuWidth(Math.max(240, switcherRef.current?.getBoundingClientRect().width ?? 0));
        }}
        menu={{ items, onClick, selectedKeys: [`org:${activeOrganization.id}`] }}
        trigger={['click']}
        placement={placement}
      >
        <div ref={switcherRef} className={`workspace-switcher${block ? ' workspace-switcher--block' : ''}`}>
          <button
            type="button"
            className="workspace-switcher__main"
            aria-label="Рабочее пространство"
            aria-haspopup="menu"
          >
            <span
              className="workspace-switcher__avatar"
              style={{ background: avatarColor(name) }}
              aria-hidden
            >
              {name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="workspace-switcher__name">{name}</span>
          </button>
          {tag ? (
            tagAction ? (
              <button
                type="button"
                className={`workspace-switcher__plan workspace-switcher__plan--action${tag.paid ? ' workspace-switcher__plan--paid' : ''}`}
                title={tagAction === 'buy' ? 'Выбрать тариф' : 'Тариф и квота'}
                aria-label={
                  tagAction === 'buy' ? `Тариф «${tag.label}»: выбрать тариф` : `Тариф «${tag.label}»: тариф и квота`
                }
                onClick={(event) => {
                  // The tag leads to the plans; the list of workspaces is opened by the rest of the switcher
                  event.stopPropagation();
                  if (tagAction === 'buy') setUpgradeOpen(true);
                  else navigate('/settings?tab=plans');
                }}
              >
                {tag.label}
              </button>
            ) : (
              <span
                className={`workspace-switcher__plan${tag.paid ? ' workspace-switcher__plan--paid' : ''}`}
              >
                {tag.label}
              </span>
            )
          ) : null}
          <ChevronsUpDown />
        </div>
      </Dropdown>
      {canUpgrade ? <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} /> : null}
    </>
  );
};
