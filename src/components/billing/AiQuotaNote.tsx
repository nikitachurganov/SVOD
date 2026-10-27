import { Link } from 'react-router-dom';
import { actionsWord, getAiQuota } from '../../shared/lib/aiQuota';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import './billing.css';

/** «Осталось 12 из 15 ИИ-действий» under an AI button; nothing while the service has no plans */
export const AiQuotaNote = ({ className }: { className?: string }) => {
  const { subscription } = useSubscription();
  const quota = getAiQuota(subscription);
  if (!quota.visible) return null;

  if (quota.exhausted) {
    return (
      <p className={`billing-note billing-note--warn${className ? ` ${className}` : ''}`} role="status">
        ИИ-действия на этот период закончились. <Link to="/plans">Выбрать тариф</Link>
      </p>
    );
  }

  return (
    <p
      className={`billing-note${quota.low ? ' billing-note--warn' : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      Осталось {quota.remaining} из {quota.max} ИИ-{actionsWord(quota.max)}. Каждый запрос к ИИ — одно
      действие.
      {quota.low ? (
        <>
          {' '}
          <Link to="/plans">Тарифы</Link>
        </>
      ) : null}
    </p>
  );
};
