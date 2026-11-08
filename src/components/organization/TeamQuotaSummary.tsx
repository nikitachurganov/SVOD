import { Button, Progress } from 'antd';
import { daysWord } from '../billing/billingText';
import { formatCredits, formatDay } from '../billing/billingFormat';
import type { SeatUsage } from '../../types/organization';
import './team-quota.css';

interface Props {
  usage: SeatUsage;
  /** The owner pays: only they get the way to buy more */
  canBuy: boolean;
  onBuy: () => void;
}

const percent = (used: number, max: number): number => (max > 0 ? Math.min(Math.round((used / max) * 100), 100) : 0);

/**
 * What the team has paid for and what is left of it: the seats (taken and free), the free readers,
 * the shared pool of AI credits and the days of the kit price; the numbers the table below is read with.
 */
export const TeamQuotaSummary = ({ usage, canBuy, onBuy }: Props) => {
  const limit = usage.seats_limit;
  const free = limit === null ? null : Math.max(limit - usage.seats_used, 0);
  const full = limit !== null && usage.seats_used >= limit;
  // The pool is absent (null) on the free plan and with an older server that does not send it at all
  const hasPool = typeof usage.ai_pool_max === 'number' && typeof usage.ai_pool_used === 'number';
  const poolMax = usage.ai_pool_max ?? 0;
  const poolLeft = Math.max(poolMax - (usage.ai_pool_used ?? 0), 0);
  const paid = usage.plan_code !== 'start';

  return (
    <section className="team-quota" aria-label="Квота команды">
      <div className="team-quota__item">
        <span className="team-quota__label">Оплаченные места</span>
        <strong className="team-quota__value">
          {limit === null ? `${usage.seats_used} занято` : `${usage.seats_used} из ${limit} занято`}
        </strong>
        {limit !== null ? (
          <Progress
            percent={percent(usage.seats_used, limit)}
            showInfo={false}
            size="small"
            status={full ? 'exception' : 'normal'}
          />
        ) : null}
        <small className="team-quota__hint">
          {free === null ? 'Без ограничений' : free > 0 ? `Свободно: ${free}` : 'Свободных мест нет'}
          {' · '}Читатели: {usage.readers} из {usage.readers_limit}, бесплатно
        </small>
      </div>

      {hasPool ? (
        <div className="team-quota__item">
          <span className="team-quota__label">Кредиты ИИ команды</span>
          <strong className="team-quota__value">
            {formatCredits(poolLeft)} из {formatCredits(poolMax)} осталось
          </strong>
          <Progress
            percent={percent(poolMax - poolLeft, poolMax)}
            showInfo={false}
            size="small"
            status={poolLeft / Math.max(poolMax, 1) < 0.1 ? 'exception' : 'normal'}
          />
          <small className="team-quota__hint">
            Общий пул на всю команду, обновится {formatDay(usage.ai_pool_resets_at)}
          </small>
        </div>
      ) : null}

      <div className="team-quota__item team-quota__item--action">
        {usage.seat_window_days_left > 0 ? (
          <small className="team-quota__offer">
            Места 2 и 3 по цене комплекта (300 ₽) — ещё {usage.seat_window_days_left}{' '}
            {daysWord(usage.seat_window_days_left)}
          </small>
        ) : null}
        {canBuy ? (
          <Button type={full || !paid ? 'primary' : 'default'} onClick={onBuy}>
            {paid ? 'Докупить места' : 'Выбрать тариф'}
          </Button>
        ) : null}
      </div>
    </section>
  );
};
