import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Segmented, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getPlans } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import type { PlanInfo, PlansResponse, QuoteTerm } from '../../types/billing';
import { FEATURE_LABELS, formatCreditsWithWord, formatPrice } from './billingFormat';
import { daysWord } from './billingText';
import { useQuote } from './seatPricing';
import { flowPath, type FlowState } from './upgradeFlow';
import './billing.css';
import './upgrade-modal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

const methodologyLine = (plan: PlanInfo): string =>
  plan.features.includes('all_methodologies') ? 'Все методики опросов' : '5 базовых методик';

/** What the plan adds to the one before it (the methodologies have their own line in the card) */
const extraLines = (base: PlanInfo, plan: PlanInfo): string[] =>
  plan.features
    .filter((feature) => feature !== 'all_methodologies' && !base.features.includes(feature))
    .map((feature) => FEATURE_LABELS[feature]);

/**
 * The plans side by side, from the plan tag of the workspace: the first step of the way to a paid plan.
 * The person looks at the plans, picks one and a term (a month or a year); everything after that (one or
 * a team, seats, payment) is a full-page flow, see UpgradeFlowPage.
 */
export const UpgradeModal = ({ open, onClose }: Props) => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [term, setTerm] = useState<QuoteTerm>('year');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (cancelled) return;
        setPlans(next);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const seatMode = Boolean(plans?.seat_pricing_enabled);
  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');
  const start = plans?.plans.find((plan) => plan.code === 'start');
  const pack = plans?.pack;
  const current = subscription?.billing_enabled ? subscription.plan.code : null;
  const subscribed =
    subscription?.plan.code === 'researcher' && subscription.status === 'active' && !subscription.trial_ends_at;

  // The price of one seat for a year, to show it per month next to the monthly price
  const soloYear = useQuote('year', 1, seatMode && open);
  const yearTotal = !researcher
    ? null
    : seatMode
      ? (soloYear.quote?.total_kopecks ?? null)
      : researcher.price_year_kopecks;
  const shownPerMonth =
    !researcher || (term === 'year' && yearTotal === null)
      ? null
      : term === 'month'
        ? researcher.price_month_kopecks
        : Math.round((yearTotal ?? 0) / 12);

  const openStep = (step: 'who' | 'seats' | 'checkout', state: FlowState) => {
    onClose();
    navigate(flowPath(step, state));
  };

  const chooseResearcher = () => {
    const base: FlowState = { offer: 'researcher', term, who: 'solo', seats: 1 };
    if (!seatMode) return openStep('checkout', base);
    if (subscribed) {
      // A running subscription is prolonged for the team it has
      const seats = Math.max(subscription?.seats ?? 1, 1);
      return seats > 1 ? openStep('seats', { ...base, who: 'team', seats }) : openStep('checkout', base);
    }
    return openStep('who', base);
  };
  const choosePack = () => openStep('checkout', { offer: 'pack', term, who: 'solo', seats: 1 });

  const body =
    !plans || !start || !researcher || !pack ? (
      loadFailed ? (
        <Alert
          type="error"
          showIcon
          title="Не удалось загрузить тарифы"
          description="Закройте окно и откройте его снова."
        />
      ) : (
        <Skeleton active paragraph={{ rows: 8 }} />
      )
    ) : (
      <div className="upgrade-plans">
        <article className={`upgrade-card${current === 'start' ? ' upgrade-card--current' : ''}`}>
          <h3 className="plan-card__name">{start.title}</h3>
          <p className="plan-card__tagline">Попробовать сервис и собрать первые ответы</p>
          <div className="plan-card__price">
            <span className="plan-card__amount">0 ₽</span>
            <span className="plan-card__period">навсегда</span>
          </div>
          <div className="upgrade-card__cta">
            <Button block disabled>
              {current === 'start' ? 'Текущий тариф' : 'Бесплатно навсегда'}
            </Button>
          </div>
          <ul className="plan-card__list">
            <li>{formatCreditsWithWord(start.limits.ai_tokens_per_period)} ИИ один раз при регистрации</li>
            <li>Опросы и ответы без ограничений</li>
            <li>{methodologyLine(start)}</li>
            <li>Базовые графики и таблицы</li>
          </ul>
        </article>

        <article
          className={`upgrade-card upgrade-card--featured${current === 'researcher' ? ' upgrade-card--current' : ''}`}
        >
          <div className="upgrade-card__title-row">
            <h3 className="plan-card__name">{researcher.title}</h3>
            <span className="upgrade-card__badge">{current === 'researcher' ? 'Ваш тариф' : 'Самый популярный'}</span>
          </div>
          <p className="plan-card__tagline">Для тех, кто исследует постоянно, одному или командой</p>
          <Segmented<QuoteTerm>
            block
            size="small"
            value={term}
            onChange={setTerm}
            options={[
              { label: 'Месяц', value: 'month' },
              { label: 'Год · выгоднее', value: 'year' },
            ]}
          />
          <div className="plan-card__price">
            <span className="plan-card__amount">{shownPerMonth === null ? '…' : formatPrice(shownPerMonth)}</span>
            <span className="plan-card__period">в месяц{seatMode ? ' за первое место' : ''}</span>
          </div>
          {term === 'year' && yearTotal !== null ? (
            <p className="billing-note" style={{ margin: '0 0 4px' }}>
              {formatPrice(yearTotal)} за год при оплате сразу
            </p>
          ) : null}
          <div className="upgrade-card__cta">
            <Button type="primary" block onClick={chooseResearcher}>
              {subscribed ? 'Продлить тариф' : 'Выбрать тариф'}
            </Button>
          </div>
          <ul className="plan-card__list">
            <li>
              {formatCreditsWithWord(researcher.limits.ai_tokens_per_period)} ИИ в месяц
              {seatMode ? ' на каждое место' : ''}
            </li>
            <li>Кредиты обновляются каждый месяц</li>
            {extraLines(start, researcher).map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>{methodologyLine(researcher)}</li>
            {seatMode ? <li>Места для команды: читатели бесплатны</li> : null}
          </ul>
        </article>

        <article className={`upgrade-card${current === 'pack' ? ' upgrade-card--current' : ''}`}>
          <h3 className="plan-card__name">{pack.title}</h3>
          <p className="plan-card__tagline">Одно исследование под ключ, без подписки</p>
          <div className="plan-card__price">
            <span className="plan-card__amount">{formatPrice(plans.pack_price_kopecks)}</span>
            <span className="plan-card__period">
              разово, на {plans.pack_days} {daysWord(plans.pack_days)}
            </span>
          </div>
          <div className="upgrade-card__cta">
            <Button block disabled={subscribed} onClick={choosePack}>
              {subscribed ? 'Входит в вашу подписку' : current === 'pack' ? 'Купить заново' : 'Купить доступ'}
            </Button>
          </div>
          <ul className="plan-card__list">
            <li>
              {formatCreditsWithWord(pack.limits.ai_tokens_per_period)} ИИ на {plans.pack_days}{' '}
              {daysWord(plans.pack_days)}
            </li>
            {extraLines(start, pack).map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Без автопродления: заплатили один раз</li>
          </ul>
        </article>
      </div>
    );

  return (
    <Modal open={open} title="Выберите тариф" footer={null} width={1040} onCancel={onClose} destroyOnHidden>
      {body}
    </Modal>
  );
};
