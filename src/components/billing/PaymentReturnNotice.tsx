import { useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { getPayment } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import './billing.css';

type Outcome = 'checking' | 'succeeded' | 'canceled' | 'problem' | 'slow';

const POLL_MS = 2500;
const RETRY_MS = 4000;
// About two minutes: after that the payment is still being processed, and it will be settled anyway
const MAX_TRIES = 48;

interface Props {
  paymentId: string;
  /** The person closed the notice (or it has said what it had to) */
  onDismiss: () => void;
  /** The plan changed: whatever shows the payments should read them again */
  onSettled: () => void;
}

/** What a person sees after coming back from the payment page: the payment is asked about until it is settled */
export const PaymentReturnNotice = ({ paymentId, onDismiss, onSettled }: Props) => {
  const { refresh } = useSubscription();
  const [outcome, setOutcome] = useState<Outcome>('checking');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const later = (ms: number) => {
      tries += 1;
      if (tries >= MAX_TRIES) {
        setOutcome('slow');
        return;
      }
      timer = setTimeout(() => void poll(), ms);
    };

    const poll = async () => {
      try {
        const payment = await getPayment(paymentId);
        if (cancelled) return;
        if (payment.status === 'new' || payment.status === 'pending') {
          later(POLL_MS);
          return;
        }
        if (payment.status === 'succeeded') {
          setOutcome('succeeded');
          await refresh();
          if (!cancelled) onSettled();
        } else if (payment.status === 'canceled' || payment.status === 'failed') {
          setOutcome('canceled');
        } else {
          setOutcome('problem');
        }
      } catch {
        if (!cancelled) later(RETRY_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, refresh, onSettled]);

  const close = (
    <Button size="small" type="text" onClick={onDismiss}>
      Закрыть
    </Button>
  );

  if (outcome === 'checking') {
    return (
      <Alert
        className="billing-alert"
        type="info"
        icon={<Spin size="small" />}
        showIcon
        title="Проверяем оплату…"
        description="Это обычно занимает несколько секунд."
      />
    );
  }
  if (outcome === 'succeeded') {
    return (
      <Alert
        className="billing-alert"
        type="success"
        showIcon
        title="Оплата прошла, тариф включён"
        action={close}
      />
    );
  }
  if (outcome === 'canceled') {
    return (
      <Alert
        className="billing-alert"
        type="warning"
        showIcon
        title="Оплата не прошла"
        description="Деньги не списаны. Попробуйте ещё раз или оставьте заявку, и мы выставим счёт."
        action={close}
      />
    );
  }
  if (outcome === 'problem') {
    return (
      <Alert
        className="billing-alert"
        type="error"
        showIcon
        title="Платёж нужно проверить вручную"
        description="Напишите нам, мы разберёмся и подключим тариф."
        action={close}
      />
    );
  }
  return (
    <Alert
      className="billing-alert"
      type="info"
      showIcon
      title="Оплата ещё обрабатывается"
      description="Тариф включится сам, как только платёж будет подтверждён, обычно в течение нескольких минут."
      action={close}
    />
  );
};
