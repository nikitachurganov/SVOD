import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { CheckCircleOutlined, CreditCardOutlined, SendOutlined } from '@ant-design/icons';
import { billingActionError, getPlans, startTrial } from '../../shared/api/billing.api';
import { useNotifications } from '../../shared/context/notifications.context';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { CheckoutModal } from './CheckoutModal';
import { PlanRequestModal } from './PlanRequestModal';
import './billing.css';

interface Props {
  /** The label of the request button when the person already has the paid plan */
  extendLabel?: string;
  /** What is bought: the subscription, or the one-off pack (no trial, its own labels) */
  offer?: 'researcher' | 'pack';
  /** The team size chosen on the plans page; the checkout window opens with it (seat pricing only) */
  seats?: number;
  /** The term chosen there */
  term?: 'month' | 'year';
}

/**
 * How a person gets the paid plan: a free trial once, then a request that an administrator
 * activates after the payment. Shared by the subscription tab and the plans page.
 */
export const PlanActions = ({
  extendLabel = 'Запросить продление',
  offer = 'researcher',
  seats,
  term: chosenTerm,
}: Props) => {
  const { subscription, refresh, replace } = useSubscription();
  const { notifySuccess, notifyError } = useNotifications();
  const [requestOpen, setRequestOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  // Online payment is offered when the server has it switched on; otherwise only the invoice request
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((plans) => {
        if (!cancelled) setPaymentsEnabled(plans.payments_enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!subscription?.billing_enabled) return null;

  const onFreePlan = subscription.plan.code === 'start';
  // A pack is bought again as a new one, not prolonged
  const onPack = subscription.plan.code === 'pack';
  const forPack = offer === 'pack';
  const trialAvailable = !forPack && onFreePlan && !subscription.trial_used;
  const pending = subscription.plan_request;
  // The pack would replace a running subscription that gives far more: the server refuses it too
  const packBlocked =
    forPack &&
    subscription.plan.code === 'researcher' &&
    subscription.status === 'active' &&
    !subscription.trial_ends_at;
  const term = forPack ? 'one_off' : (chosenTerm ?? 'month');

  if (packBlocked) {
    return (
      <Button block disabled>
        Входит в вашу подписку
      </Button>
    );
  }

  const payLabel = forPack
    ? onPack
      ? 'Купить заново'
      : 'Купить доступ'
    : onFreePlan || onPack
      ? 'Оплатить тариф'
      : 'Оплатить продление';
  const requestLabel = forPack || onFreePlan || onPack ? 'Запросить подключение' : extendLabel;

  const handleTrial = async () => {
    setTrialBusy(true);
    try {
      replace(await startTrial());
      notifySuccess('Пробный период начался', 'Все возможности «Исследователя» открыты на две недели');
    } catch (err) {
      notifyError(billingActionError(err, 'Не удалось запустить пробный период'));
    } finally {
      setTrialBusy(false);
    }
  };

  return (
    <>
      <div className="billing-actions">
        {trialAvailable ? (
          <Button type="primary" loading={trialBusy} onClick={() => void handleTrial()}>
            Попробовать 14 дней бесплатно
          </Button>
        ) : null}
        {paymentsEnabled ? (
          <Button
            type={trialAvailable ? 'default' : 'primary'}
            icon={<CreditCardOutlined />}
            onClick={() => setCheckoutOpen(true)}
          >
            {payLabel}
          </Button>
        ) : null}
        {/* The invoice request is only the way to pay while online payment is not switched on */}
        {paymentsEnabled ? null : pending ? (
          <Button icon={<CheckCircleOutlined />} disabled>
            Заявка отправлена
          </Button>
        ) : (
          <Button
            type={trialAvailable ? 'default' : 'primary'}
            icon={<SendOutlined />}
            onClick={() => setRequestOpen(true)}
          >
            {requestLabel}
          </Button>
        )}
      </div>
      {pending && !paymentsEnabled ? (
        <p className="billing-note">
          Мы получили вашу заявку и свяжемся с вами по указанному контакту. Тариф включится после оплаты.
        </p>
      ) : null}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        initialTerm={term}
        initialSeats={seats}
      />
      <PlanRequestModal
        open={requestOpen}
        initialTerm={term}
        onClose={() => setRequestOpen(false)}
        onSent={() => void refresh()}
      />
    </>
  );
};
