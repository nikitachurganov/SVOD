import { Link } from 'react-router-dom';
import { getAiQuota } from '../../shared/lib/aiQuota';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { formatDay, formatTokens } from './billingFormat';
import './billing.css';

/** «Осталось 142 тыс. из 150 тыс. токенов ИИ» under an AI button; nothing while the service has no plans */
export const AiQuotaNote = ({ className }: { className?: string }) => {
  const { subscription } = useSubscription();
  const quota = getAiQuota(subscription);
  if (!quota.visible) return null;

  if (quota.exhausted) {
    return (
      <p className={`billing-note billing-note--warn${className ? ` ${className}` : ''}`} role="status">
        Токены ИИ закончились
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
      Осталось {formatTokens(quota.remaining)} из {formatTokens(quota.max)} токенов ИИ. Запросы к ИИ расходуют
      токены по объёму текста.
      {quota.low ? (
        <>
          {' '}
          <Link to="/plans">Тарифы</Link>
        </>
      ) : null}
    </p>
  );
};
