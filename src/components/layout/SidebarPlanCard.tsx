import { RightOutlined } from '../../shared/ui/materialIcons';
import { formatCredits, formatQuotaAmount, quotaUnitWord } from '../billing/billingFormat';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useWorkspaceUsage } from './useWorkspaceUsage';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { getAiQuota, type AiQuota } from '../../shared/lib/aiQuota';

interface Props {
  onNavigate: (path: string) => void;
  showAiQuota?: boolean;
}

const QuotaProgress = ({ quota }: { quota: AiQuota }) => {
  const percent = quota.max > 0 ? Math.min(100, Math.max(0, quota.used / quota.max * 100)) : 0;
  const label = percent > 0 && percent < 0.1 ? '<0,1' : percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return (
    <span className="sidebar-plan-card__quota">
      <span className="sidebar-plan-card__quota-label"><span>{quota.suspended ? 'ИИ приостановлен' : 'Использовано ИИ'}</span><span>{label}%</span></span>
      <span className="sidebar-plan-card__track" role="progressbar" aria-label={`Использовано ${quotaUnitWord(quota.unit)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${label}% использовано`}><span style={{ width: `${percent}%` }} /></span>
      <small>Осталось {formatQuotaAmount(quota.remaining, quota.unit)} из {formatQuotaAmount(quota.max, quota.unit)} {quotaUnitWord(quota.unit)}</small>
    </span>
  );
};

/**
 * «Your plan and usage» under the sections of the side panel: the places and the AI left of the workspace
 * in a line, and the way to the page with the details. Shown to those who manage the workspace.
 */
export const SidebarPlanCard = ({ onNavigate, showAiQuota = false }: Props) => {
  const { activeOrganization } = useOrganization();
  const { user } = useAuth();
  const shown = useWorkspaceUsage(activeOrganization?.id ?? null);
  const { subscription, team } = useSubscription();
  const quota = getAiQuota(subscription, team);
  if (!activeOrganization) return null;
  if (team) {
    // The team model: the plan, the places and the balances are the team's own
    const seats = shown?.usage.seats_limit != null ? `Места ${shown.usage.seats_used} из ${shown.usage.seats_limit}` : null;
    const full = shown?.usage.seats_limit != null && shown.usage.seats_used >= shown.usage.seats_limit;
    return (
      <button
        type="button"
        className={`sidebar-plan-card${quota.low || quota.suspended || full ? ' sidebar-plan-card--warn' : ''}`}
        onClick={() => onNavigate(team.can_buy || !shown ? '/plans' : '/participants')}
      >
        <span className="sidebar-plan-card__text">
          <strong>Тариф: {team.plan_title ?? 'бесплатный'}</strong>
          {seats && <small>{seats}</small>}
          {quota.visible && <QuotaProgress quota={quota} />}
        </span>
        <RightOutlined aria-hidden />
      </button>
    );
  }
  if (!shown) {
    if (!showAiQuota || !quota.visible) return null;
    return (
      <button type="button" className={`sidebar-plan-card${quota.low ? ' sidebar-plan-card--warn' : ''}`} onClick={() => onNavigate('/plans')}>
        <span className="sidebar-plan-card__text"><strong>Кредиты ИИ</strong><QuotaProgress quota={quota} /></span>
        <RightOutlined aria-hidden />
      </button>
    );
  }

  const { usage } = shown;
  const isOwner = activeOrganization.owner_user_id === user?.id;
  // The pool is absent (null) on the free plan and with an older server that does not send it at all
  const poolLeft =
    typeof usage.ai_pool_max === 'number' && typeof usage.ai_pool_used === 'number'
      ? Math.max(usage.ai_pool_max - usage.ai_pool_used, 0)
      : null;

  const parts: string[] = [];
  if (usage.seats_limit !== null) parts.push(`Места ${usage.seats_used} из ${usage.seats_limit}`);
  if (!(showAiQuota && quota.visible) && poolLeft !== null) parts.push(`ИИ ${formatCredits(poolLeft)}`);

  const full = usage.seats_limit !== null && usage.seats_used >= usage.seats_limit;
  const low = poolLeft !== null && usage.ai_pool_max ? poolLeft / usage.ai_pool_max < 0.1 : false;
  // The owner pays, so the details of the plan are with them; an admin sees the people and the places
  const target = isOwner ? '/settings?tab=plans' : '/participants';

  return (
    <button
      type="button"
      className={`sidebar-plan-card${full || low || (showAiQuota && quota.low) ? ' sidebar-plan-card--warn' : ''}`}
      onClick={() => onNavigate(target)}
    >
      <span className="sidebar-plan-card__text">
        <strong>Ваш тариф и квота</strong>
        {parts.length > 0 && <small>{parts.join(' · ')}</small>}
        {showAiQuota && quota.visible ? <QuotaProgress quota={quota} /> : parts.length === 0 && <small>Что входит в тариф</small>}
      </span>
      <RightOutlined aria-hidden />
    </button>
  );
};
