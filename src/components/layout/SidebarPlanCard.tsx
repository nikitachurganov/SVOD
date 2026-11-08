import { RightOutlined } from '@ant-design/icons';
import { formatCredits } from '../billing/billingFormat';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useWorkspaceUsage } from './useWorkspaceUsage';

interface Props {
  onNavigate: (path: string) => void;
}

/**
 * «Your plan and usage» under the sections of the side panel: the places and the AI left of the workspace
 * in a line, and the way to the page with the details. Shown to those who manage the workspace.
 */
export const SidebarPlanCard = ({ onNavigate }: Props) => {
  const { activeOrganization } = useOrganization();
  const { user } = useAuth();
  const shown = useWorkspaceUsage(activeOrganization?.id ?? null);
  if (!shown || !activeOrganization) return null;

  const { usage } = shown;
  const inTeam = !activeOrganization.is_personal;
  const isOwner = activeOrganization.owner_user_id === user?.id;
  // The pool is absent (null) on the free plan and with an older server that does not send it at all
  const poolLeft =
    typeof usage.ai_pool_max === 'number' && typeof usage.ai_pool_used === 'number'
      ? Math.max(usage.ai_pool_max - usage.ai_pool_used, 0)
      : null;

  const parts: string[] = [];
  if (inTeam && usage.seats_limit !== null) parts.push(`Места ${usage.seats_used} из ${usage.seats_limit}`);
  if (poolLeft !== null) parts.push(`ИИ ${formatCredits(poolLeft)}`);

  const full = usage.seats_limit !== null && usage.seats_used >= usage.seats_limit;
  const low = poolLeft !== null && usage.ai_pool_max ? poolLeft / usage.ai_pool_max < 0.1 : false;
  // The owner pays, so the details of the plan are with them; an admin sees the people and the places
  const target = isOwner || !inTeam ? '/settings?tab=plans' : '/participants';

  return (
    <button
      type="button"
      className={`sidebar-plan-card${full || low ? ' sidebar-plan-card--warn' : ''}`}
      onClick={() => onNavigate(target)}
    >
      <span className="sidebar-plan-card__text">
        <strong>Ваш тариф и квота</strong>
        <small>{parts.length > 0 ? parts.join(' · ') : 'Что входит в тариф'}</small>
      </span>
      <RightOutlined aria-hidden />
    </button>
  );
};
