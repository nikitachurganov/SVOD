import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { PaymentHistory } from '../billing/PaymentHistory';
import { PaymentReturnNotice } from '../billing/PaymentReturnNotice';
import { PlanActions } from '../billing/PlanActions';
import { SeatsPanel } from '../billing/SeatsPanel';
import { UsageBar } from '../billing/UsageBar';
import { AI_ACTION_HINT, formatCredits, formatDay, formatPrice, STATUS_LABELS } from '../billing/billingFormat';
import { getPlans } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import type { PlansResponse } from '../../types/billing';
import '../billing/billing.css';

/** The person's plan, what is used of it and what can be done: try, pay, ask for an invoice */
export const ProfileSubscriptionTab = () => {
  const { subscription, isLoading, refresh } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  // The payment page sends the person back with ?payment=<id>
  const returnedPayment = searchParams.get('payment');
  const [paymentsReload, setPaymentsReload] = useState(0);
  // The catalogue says whether the plan is sold by seats; without it the tab looks as it always did
  const [plans, setPlans] = useState<PlansResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissReturn = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('payment');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);
  const onPaymentSettled = useCallback(() => setPaymentsReload((value) => value + 1), []);

  if (isLoading && !subscription) {
    return (
      <section className="profile-page__panel" aria-label="Подписка">
        <Skeleton active paragraph={{ rows: 6 }} />
      </section>
    );
  }

  if (!subscription) {
    return (
      <section className="profile-page__panel" aria-label="Подписка">
        <div className="profile-page__section">
          <h3 className="profile-page__section-title">Текущая подписка</h3>
          <Alert
            type="info"
            showIcon
            title="Данные о тарифе недоступны"
            description="Тарифы работают в сервисе опросов. Если вы уже там, обновите страницу."
            action={
              <Button size="small" onClick={() => void refresh()}>
                Повторить
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  const { plan, usage } = subscription;
  const paid = plan.code !== 'start' && plan.code !== 'unlimited';
  const trialing = subscription.status === 'trialing';
  const monthlyPrice = plan.price_month_kopecks;
  const isPack = plan.code === 'pack';
  const seatMode = Boolean(plans?.seat_pricing_enabled);
  const aiResets = usage.ai_tokens.resets_at;
  // The pack's credits burn at the end of its term, the subscription's come back, the free ones are given once
  const aiNote = !aiResets
    ? 'Бесплатные кредиты даются один раз и не обновляются.'
    : isPack
      ? `Кредиты действуют до ${formatDay(aiResets)}.`
      : `Кредиты обновятся ${formatDay(aiResets)}.`;

  return (
    <section className="profile-page__panel" aria-labelledby="profile-subscription-title">
      <div className="profile-page__section">
        <h3 id="profile-subscription-title" className="profile-page__section-title">
          Текущая подписка
        </h3>

        {returnedPayment ? (
          <div style={{ marginBottom: 12 }}>
            <PaymentReturnNotice
              paymentId={returnedPayment}
              onDismiss={dismissReturn}
              onSettled={onPaymentSettled}
            />
          </div>
        ) : null}

        {!subscription.billing_enabled ? (
          <Alert
            type="info"
            showIcon
            title="Сервис пока работает без ограничений"
            description="Тарифы ещё не включены: лимитов нет, платить не нужно."
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <div className="profile-page__plan">
          <div>
            <span className="profile-page__plan-label">Тариф</span>
            <strong className="profile-page__plan-name">
              {plan.title}{' '}
              {trialing ? <Tag color="gold">Пробный период</Tag> : paid ? <Tag color="blue">Платный</Tag> : null}
            </strong>
          </div>
          <dl className="profile-page__facts">
            <div>
              <dt>Статус</dt>
              <dd>{paid ? (STATUS_LABELS[subscription.status] ?? subscription.status) : 'Бесплатный'}</dd>
            </div>
            <div>
              <dt>{isPack ? 'Стоимость' : 'Стоимость в месяц'}</dt>
              <dd>{isPack ? 'Разово' : seatMode && paid ? 'Зависит от числа мест' : formatPrice(monthlyPrice)}</dd>
            </div>
            <div>
              <dt>{paid ? 'Действует до' : 'Кредиты ИИ'}</dt>
              <dd>
                {paid
                  ? formatDay(subscription.current_period_end)
                  : subscription.billing_enabled
                    ? 'Даются один раз'
                    : '—'}
              </dd>
            </div>
          </dl>
        </div>

        {trialing ? (
          <p className="billing-note">
            Пробный период закончится {formatDay(subscription.trial_ends_at)}, потом вы вернётесь на «Старт».
            Все опросы и ответы сохранятся.
          </p>
        ) : null}
        {subscription.deletion_scheduled ? (
          <Alert
            className="billing-alert"
            type="warning"
            showIcon
            title={`Аккаунт будет удалён ${formatDay(subscription.deletion_at)}`}
            description="Когда закончится оплаченный период. Отменить удаление можно в разделе «Профиль»."
          />
        ) : null}

        {subscription.billing_enabled ? (
          <>
            <h3 className="profile-page__section-title" style={{ marginTop: 24 }}>
              Использование
            </h3>
            <div className="billing-usage-group">
              <UsageBar label="Кредиты ИИ" metric={usage.ai_tokens} format={formatCredits} />
              <p className="billing-note billing-usage-group__note">
                {aiNote} {AI_ACTION_HINT} Когда кредиты закончатся, опросы и обычная аналитика продолжат работать.
              </p>
            </div>
            {usage.locked_responses > 0 ? (
              <Alert
                className="billing-alert"
                type="warning"
                showIcon
                title={`Ответов сверх лимита: ${usage.locked_responses}`}
                description="Они сохранены, но скрыты из результатов. Их откроет повышение тарифа."
              />
            ) : null}
            {!subscription.enforced ? (
              <p className="billing-note">
                Сейчас лимиты только считаются и ничего не блокируют: так мы проверяем, что тарифы подходят.
              </p>
            ) : null}
            {seatMode && plans && paid ? <SeatsPanel subscription={subscription} plans={plans} /> : null}
          </>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <PlanActions
            extendLabel={trialing ? 'Запросить подключение' : 'Запросить продление'}
            seats={seatMode && paid ? subscription.seats : undefined}
          />
        </div>

        <p className="billing-note">
          <Link to="/plans">Сравнить тарифы</Link>
        </p>

        {subscription.billing_enabled ? <PaymentHistory reloadKey={paymentsReload} /> : null}
      </div>
    </section>
  );
};
