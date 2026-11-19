import { Link } from 'react-router-dom';
import { getAiQuota } from '../../shared/lib/aiQuota';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import {
  AI_ACTION_HINT,
  TEAM_ACTION_HINT,
  formatDay,
  formatQuotaAmount,
  quotaUnitWord,
} from './billingFormat';
import './billing.css';

/** «Осталось 142 из 150 кредитов ИИ» under an AI button; nothing while the service has no plans.
 * In the team model it counts the team's Токены+ (or its free tokens) instead of the person's credits. */
export const AiQuotaNote = ({ className }: { className?: string }) => {
  const { subscription, team } = useSubscription();
  const quota = getAiQuota(subscription, team);
  if (!quota.visible) return null;
  const extra = className ? ` ${className}` : '';

  if (quota.suspended || quota.exhausted) {
    return (
      <p className={`billing-note billing-note--warn${extra}`} role="status">
        {quota.suspended
          ? 'Токены+ команды закончились: работа с ИИ приостановлена до докупки пакета или нового месяца подписки'
          : `${quota.unit === 'credits' ? 'Кредиты ИИ' : 'Токены'} закончились${quota.resetsAt ? `, они обновятся ${formatDay(quota.resetsAt)}` : ''}`}
        . Опросы, сбор ответов и обычная аналитика работают как раньше.{' '}
        <Link to="/plans">{team && !team.can_buy ? 'Тарифы' : quota.suspended ? 'Докупить пакет' : 'Выбрать тариф'}</Link>
      </p>
    );
  }

  return (
    <p className={`billing-note${quota.low ? ' billing-note--warn' : ''}${extra}`} role="status">
      Осталось {formatQuotaAmount(quota.remaining, quota.unit)} из {formatQuotaAmount(quota.max, quota.unit)}{' '}
      {quotaUnitWord(quota.unit)}. {quota.unit === 'credits' ? AI_ACTION_HINT : TEAM_ACTION_HINT}
      {quota.low ? (
        <>
          {' '}
          <Link to="/plans">Тарифы</Link>
        </>
      ) : null}
    </p>
  );
};
