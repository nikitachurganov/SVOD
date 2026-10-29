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
}

/**
 * How a person gets the paid plan: a free trial once, then a request that an administrator
 * activates after the payment. Shared by the subscription tab and the plans page.
 */
export const PlanActions = ({ extendLabel = 'Запросить продление' }: Props) => {
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
  const trialAvailable = onFreePlan && !subscription.trial_used;
  const pending = subscription.plan_request;

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
            {onFreePlan || onPack ? 'Оплатить тариф' : 'Оплатить продление'}
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
            {onFreePlan || onPack ? 'Запросить подключение' : extendLabel}
          </Button>
        )}
      </div>
      {pending && !paymentsEnabled ? (
        <p className="billing-note">
          Мы получили вашу заявку и свяжемся с вами по указанному контакту. Тариф включится после оплаты.
        </p>
      ) : null}
      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
      <PlanRequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onSent={() => void refresh()}
      />
    </>
  );
};
