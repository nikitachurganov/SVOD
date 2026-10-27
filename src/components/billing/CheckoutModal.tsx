import { useEffect, useState } from 'react';
import { Alert, Modal, Radio } from 'antd';
import { billingActionError, createCheckout, getPlans } from '../../shared/api/billing.api';
import type { PlanRequestTerm, PlansResponse } from '../../types/billing';
import { formatPrice } from './billingFormat';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Choosing the term and going to the payment page; the plan is switched on when the payment is settled */
export const CheckoutModal = ({ open, onClose }: Props) => {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [term, setTerm] = useState<PlanRequestTerm>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { confirmation_url: url } = await createCheckout(term);
      // The person leaves for the payment page and comes back to the subscription tab
      window.location.assign(url);
    } catch (err) {
      setError(billingActionError(err, 'Не удалось перейти к оплате. Попробуйте ещё раз.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Оплата тарифа «Исследователь»"
      okText="Перейти к оплате"
      cancelText="Отмена"
      confirmLoading={busy}
      onCancel={busy ? undefined : onClose}
      onOk={() => void pay()}
      destroyOnHidden
    >
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--app-text-secondary)' }}>
        Вы перейдёте на защищённую страницу платёжного сервиса ЮKassa. После оплаты вернётесь сюда, тариф
        включится сразу.
      </p>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Radio.Group
        value={term}
        onChange={(event) => setTerm(event.target.value as PlanRequestTerm)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <Radio value="month">
          На месяц{researcher ? ` — ${formatPrice(researcher.price_month_kopecks)}` : ''}
        </Radio>
        <Radio value="year">
          На год{researcher ? ` — ${formatPrice(researcher.price_year_kopecks)}` : ''}
        </Radio>
        <Radio value="one_off">
          Пакет «Курсовая»
          {plans
            ? ` — ${formatPrice(plans.course_pack_price_kopecks)} на ${plans.course_pack_days} дней`
            : ''}
        </Radio>
      </Radio.Group>
      <p className="billing-note">
        Подписка не продлевается сама: когда срок подойдёт к концу, мы напомним, и вы оплатите ещё раз. Если
        тариф уже действует, оплаченный срок добавится к нему.
      </p>
    </Modal>
  );
};
