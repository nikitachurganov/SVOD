import { useEffect, useState } from 'react';
import { Alert, Checkbox, Modal, Radio } from 'antd';
import { useNotifications } from '../../shared/context/notifications.context';
import { billingActionError, createCheckout, getPlans } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import type { PlanRequestTerm, PlansResponse } from '../../types/billing';
import { formatPrice, formatTokens } from './billingFormat';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ConsentKey = 'offer' | 'privacy' | 'personalData';

const CONSENTS: { key: ConsentKey; before: string; link: string; to: string }[] = [
  { key: 'offer', before: 'Я принимаю условия', link: 'публичной оферты', to: '/legal#offer' },
  { key: 'privacy', before: 'Я ознакомлен(а) с', link: 'политикой конфиденциальности', to: '/legal#privacy' },
  {
    key: 'personalData',
    before: 'Я даю',
    link: 'согласие на обработку персональных данных',
    to: '/legal#consent',
  },
];

const NOTHING_ACCEPTED: Record<ConsentKey, boolean> = { offer: false, privacy: false, personalData: false };

/** Choosing the term and going to the payment page; the plan is switched on when the payment is settled */
export const CheckoutModal = ({ open, onClose }: Props) => {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [term, setTerm] = useState<PlanRequestTerm>('month');
  const { notifyInfo } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each document is accepted on its own, and anew every time the window is opened
  const [accepted, setAccepted] = useState<Record<ConsentKey, boolean>>(NOTHING_ACCEPTED);
  const agreed = CONSENTS.every(({ key }) => accepted[key]);

  useEffect(() => {
    if (!open) return;
    setAccepted(NOTHING_ACCEPTED);
    setError(null);
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

  const { subscription } = useSubscription();
  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');
  const researcherTokens = researcher
    ? `, ${formatTokens(researcher.limits.ai_tokens_per_period)} токенов ИИ в месяц`
    : '';
  // The pack would replace a running subscription that gives far more: the server refuses it too
  const subscribed =
    subscription?.plan.code === 'researcher' && subscription.status === 'active' && !subscription.trial_ends_at;

  const pay = async () => {
    if (!agreed) return;
    // The tab is opened right in the click: a window opened after the request would be taken for a
    // pop-up and blocked. It is sent to the payment page once the address is known.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    try {
      const { confirmation_url: url } = await createCheckout(term);
      if (tab) {
        tab.location.href = url;
        notifyInfo('Оплата открыта в новой вкладке', 'После оплаты тариф включится сразу.');
        onClose();
      } else {
        // Pop-ups are blocked: the payment page replaces this one
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      setError(billingActionError(err, 'Не удалось перейти к оплате. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Оплата тарифа"
      okText="Перейти к оплате"
      cancelText="Отмена"
      confirmLoading={busy}
      onCancel={busy ? undefined : onClose}
      onOk={() => void pay()}
      okButtonProps={{ disabled: !agreed }}
      destroyOnHidden
    >
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--app-text-secondary)' }}>
        Защищённая страница платёжного сервиса ЮKassa откроется в новой вкладке. После оплаты тариф
        включится сразу.
      </p>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Radio.Group
        value={term}
        onChange={(event) => setTerm(event.target.value as PlanRequestTerm)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <Radio value="month">
          «Исследователь» на месяц
          {researcher ? ` — ${formatPrice(researcher.price_month_kopecks)}${researcherTokens}` : ''}
        </Radio>
        <Radio value="year">
          «Исследователь» на год
          {researcher ? ` — ${formatPrice(researcher.price_year_kopecks)}${researcherTokens}` : ''}
        </Radio>
        <Radio value="one_off" disabled={subscribed}>
          Разовый доступ «Исследование»
          {plans
            ? ` — ${formatPrice(plans.pack_price_kopecks)} на ${plans.pack_days} дней, ${formatTokens(plans.pack.limits.ai_tokens_per_period)} токенов ИИ`
            : ''}
        </Radio>
      </Radio.Group>
      <p className="billing-note">
        Подписка не продлевается сама: когда срок подойдёт к концу, мы напомним, и вы оплатите ещё раз. Если
        подписка уже действует, оплаченный срок добавится к ней. Разовый доступ не продлевается: новая
        покупка начинает его заново. Опросы, сбор ответов и обычная аналитика не зависят от токенов.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CONSENTS.map(({ key, before, link, to }) => (
          <Checkbox
            key={key}
            checked={accepted[key]}
            disabled={busy}
            onChange={(event) => setAccepted((current) => ({ ...current, [key]: event.target.checked }))}
          >
            {before}{' '}
            <a href={to} target="_blank" rel="noreferrer">
              {link}
            </a>
          </Checkbox>
        ))}
      </div>
      <p className="billing-note" style={{ marginBottom: 0 }}>
        Реквизиты исполнителя —{' '}
        <a href="/legal#contacts" target="_blank" rel="noreferrer">
          здесь
        </a>
        .
      </p>
    </Modal>
  );
};
