import { Link } from 'react-router-dom';
import { getAiQuota } from '../../shared/lib/aiQuota';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { AI_ACTION_HINT, formatCredits, formatDay } from './billingFormat';
import './billing.css';

/** «Осталось 142 из 150 кредитов ИИ» under an AI button; nothing while the service has no plans */
export const AiQuotaNote = ({ className }: { className?: string }) => {
  const { subscription } = useSubscription();
  const quota = getAiQuota(subscription);
  if (!quota.visible) return null;

  if (quota.exhausted) {
    return (
      <p className={`billing-note billing-note--warn${className ? ` ${className}` : ''}`} role="status">
        Кредиты ИИ закончились
        {quota.resetsAt ? `, они обновятся ${formatDay(quota.resetsAt)}` : ''}. Опросы, сбор ответов и обычная
        аналитика работают как раньше. <Link to="/plans">Выбрать тариф</Link>
      </p>
    );
  }

  return (
    <p
      className={`billing-note${quota.low ? ' billing-note--warn' : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      Осталось {formatCredits(quota.remaining)} из {formatCredits(quota.max)} кредитов ИИ. {AI_ACTION_HINT}
      {quota.low ? (
        <>
          {' '}
          <Link to="/plans">Тарифы</Link>
        </>
      ) : null}
    </p>
  );
};
