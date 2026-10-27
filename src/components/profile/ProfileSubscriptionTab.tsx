import { useCallback, useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { PaymentHistory } from '../billing/PaymentHistory';
import { PaymentReturnNotice } from '../billing/PaymentReturnNotice';
import { PlanActions } from '../billing/PlanActions';
import { UsageBar } from '../billing/UsageBar';
import { formatDay, formatPrice, STATUS_LABELS } from '../billing/billingFormat';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import '../billing/billing.css';

/** The person's plan, what is used of it and what can be done: try, pay, ask for an invoice */
export const ProfileSubscriptionTab = () => {
  const { subscription, isLoading, refresh } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  // The payment page sends the person back with ?payment=<id>
  const returnedPayment = searchParams.get('payment');
  const [paymentsReload, setPaymentsReload] = useState(0);

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
              <dt>Стоимость в месяц</dt>
              <dd>{formatPrice(monthlyPrice)}</dd>
            </div>
            <div>
              <dt>{paid ? 'Действует до' : 'Лимиты обновятся'}</dt>
              <dd>{formatDay(subscription.current_period_end)}</dd>
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
              Использование за период
            </h3>
            <UsageBar label="ИИ-действия" metric={usage.ai_actions} />
            <UsageBar label="Ответы" metric={usage.responses} />
            <UsageBar label="Открытые опросы" metric={usage.active_surveys} />
            <UsageBar label="Проекты" metric={usage.projects} />
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
          </>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <PlanActions extendLabel={trialing ? 'Запросить подключение' : 'Запросить продление'} />
        </div>

        <p className="billing-note">
          <Link to="/plans">Сравнить тарифы</Link>
        </p>

        {subscription.billing_enabled ? <PaymentHistory reloadKey={paymentsReload} /> : null}
      </div>
    </section>
  );
};
