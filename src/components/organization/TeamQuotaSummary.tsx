import { Button, Progress } from 'antd';
import { daysWord } from '../billing/billingText';
import { formatCredits, formatDay } from '../billing/billingFormat';
import type { SeatUsage } from '../../types/organization';
import type { TeamBillingSummary } from '../../types/billing';
import { formatNumber } from '../billing/billingFormat';
import { sharePercent } from './participants.utils';
import './team-quota.css';

interface Props {
  usage: SeatUsage;
  /** The owner pays: only they get the way to buy more */
  canBuy: boolean;
  onBuy: () => void;
  /** The caller manages people: they see everybody's spending in the table, the others only their own here */
  manages: boolean;
  /** The team model: the plan and the balances of this team; null in the per-person model */
  team?: TeamBillingSummary | null;
}

/**
 * What the team has paid for and what is left of it: the seats (paid, taken, free), the free observers,
 * the share of the team's plan (its shared pool of AI credits) already used, and the days of the kit price.
 */
export const TeamQuotaSummary = ({ usage, canBuy, onBuy, manages, team = null }: Props) => {
  const limit = usage.seats_limit;
  const free = limit === null ? null : Math.max(limit - usage.seats_used, 0);
  const full = limit !== null && usage.seats_used >= limit;
  const elsewhere = usage.seats_used_elsewhere ?? 0;
  // The pool is absent (null) on the free plan and with an older server that does not send it at all
  const hasPool = typeof usage.ai_pool_max === 'number' && typeof usage.ai_pool_used === 'number';
  const poolMax = usage.ai_pool_max ?? 0;
  const poolUsed = Math.min(usage.ai_pool_used ?? 0, poolMax);
  const poolPercent = sharePercent(poolUsed, poolMax);
  const paid = usage.plan_code !== 'start';

  return (
    <section className="team-quota" aria-label="Квота команды">
      <div className="team-quota__item">
        <span className="team-quota__label">Места</span>
        <strong className="team-quota__value">
          {limit === null
            ? `${usage.seats_used} занято`
            : `Оплачено ${limit} · занято ${usage.seats_used} · свободно ${free}`}
        </strong>
        {limit !== null ? (
          <Progress
            percent={sharePercent(usage.seats_used, limit).value}
            showInfo={false}
            size="small"
            status={full ? 'exception' : 'normal'}
          />
        ) : null}
        <small className="team-quota__hint">
          {elsewhere > 0 && !team ? `Из занятых ${elsewhere} — в других ваших командах. ` : ''}
          {team ? 'Читатели не занимают мест: ' : 'Наблюдатели: '}
          {usage.readers} из {usage.readers_limit}, бесплатно
        </small>
      </div>

      {team ? (
        <div className="team-quota__item">
          <span className="team-quota__label">Тариф команды</span>
          <strong className="team-quota__value">{team.plan_title ?? 'Бесплатный'}</strong>
          {team.subscription ? (
            <>
              <Progress
                percent={sharePercent(team.subscription.quota - team.subscription.remaining, team.subscription.quota).value}
                showInfo={false}
                size="small"
                status={team.ai_mode === 'suspended' ? 'exception' : 'normal'}
              />
              <small className="team-quota__hint">
                {formatNumber(team.subscription.remaining)} из {formatNumber(team.subscription.quota)} Токенов+ до{' '}
                {formatDay(team.subscription.resets_at)}
                {team.purchased_tokens > 0 ? ` · купленных ${formatNumber(team.purchased_tokens)}, без срока` : ''}
                {!manages && typeof usage.ai_spent_me === 'number'
                  ? ` · вы потратили ${formatNumber(usage.ai_spent_me)}`
                  : ''}
              </small>
            </>
          ) : (
            <small className="team-quota__hint">
              {team.purchased_tokens > 0
                ? `Купленных Токенов+: ${formatNumber(team.purchased_tokens)}, без срока`
                : `Бесплатных токенов: ${formatNumber(team.free.remaining)} из ${formatNumber(team.free.quota)}, обновятся ${formatDay(team.free.resets_at)}`}
            </small>
          )}
        </div>
      ) : hasPool ? (
        <div className="team-quota__item">
          <span className="team-quota__label">Тариф команды использован</span>
          <strong className="team-quota__value team-quota__value--big">{poolPercent.text}</strong>
          <Progress
            percent={poolPercent.value}
            showInfo={false}
            size="small"
            status={poolPercent.value >= 90 ? 'exception' : 'normal'}
          />
          <small className="team-quota__hint">
            {formatCredits(poolUsed)} из {formatCredits(poolMax)} кредитов ИИ, обновится{' '}
            {formatDay(usage.ai_pool_resets_at)}
            {!manages && typeof usage.ai_spent_me === 'number'
              ? ` · вы потратили ${formatCredits(usage.ai_spent_me)} (${sharePercent(usage.ai_spent_me, poolMax).text})`
              : ''}
          </small>
        </div>
      ) : (
        <div className="team-quota__item">
          <span className="team-quota__label">Тариф команды</span>
          <strong className="team-quota__value">Бесплатный «Старт»</strong>
          <small className="team-quota__hint">
            Общего пула кредитов ИИ нет: каждый тратит свой бесплатный лимит
          </small>
        </div>
      )}

      <div className="team-quota__item team-quota__item--action">
        {usage.seat_window_days_left > 0 && !team ? (
          <small className="team-quota__offer">
            Места 2 и 3 по цене комплекта (300 ₽) — ещё {usage.seat_window_days_left}{' '}
            {daysWord(usage.seat_window_days_left)}
          </small>
        ) : null}
        {canBuy ? (
          <Button type={full || !paid ? 'primary' : 'default'} onClick={onBuy}>
            {team
              ? team.plan_code === 'pro'
                ? 'Тарифы команды'
                : full
                  ? 'Больше мест — на Plus и Pro'
                  : 'Тарифы команды'
              : paid
                ? 'Докупить места'
                : 'Подключить тариф для команды'}
          </Button>
        ) : null}
      </div>
    </section>
  );
};
