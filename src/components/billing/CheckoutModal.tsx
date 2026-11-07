import { useEffect, useState } from 'react';
import { Alert, Checkbox, Modal, Radio } from 'antd';
import { useNotifications } from '../../shared/context/notifications.context';
import { billingActionError, createCheckout, getPlans } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import type { PlanRequestTerm, PlansResponse } from '../../types/billing';
import { SeatStepper } from './SeatConfigurator';
import { DEFAULT_SEATS, SEAT_PRICE_RULE, seatsWord, useQuote } from './seatPricing';
import { formatCreditsWithWord, formatPrice } from './billingFormat';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The term chosen when the window opens */
  initialTerm?: PlanRequestTerm;
  /** The team size chosen when the window opens (only while the plan is sold by seats) */
  initialSeats?: number;
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
export const CheckoutModal = ({
  open,
  onClose,
  initialTerm = 'month',
  initialSeats = DEFAULT_SEATS,
}: Props) => {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [term, setTerm] = useState<PlanRequestTerm>('month');
  const [seats, setSeats] = useState(initialSeats);
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
    setTerm(initialTerm);
    setSeats(initialSeats);
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, initialTerm, initialSeats]);

  const { subscription } = useSubscription();
  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');
  // While the plan is sold by seats, its limits are per seat and the price comes from the server's calculator
  const seatMode = Boolean(plans?.seat_pricing_enabled);
  const monthQuote = useQuote('month', seats, seatMode && open);
  const yearQuote = useQuote('year', seats, seatMode && open);
  const teamSeats = seatMode ? seats : 1;
  const researcherTokens = researcher
    ? `, ${formatCreditsWithWord(researcher.limits.ai_tokens_per_period * teamSeats)} ИИ в месяц`
    : '';
  const priceOf = (kind: 'month' | 'year'): string => {
    if (!researcher) return '';
    if (!seatMode) {
      return formatPrice(kind === 'month' ? researcher.price_month_kopecks : researcher.price_year_kopecks);
    }
    const quote = kind === 'month' ? monthQuote : yearQuote;
    if (quote.quote) return formatPrice(quote.quote.total_kopecks);
    return quote.failed ? 'цена недоступна' : '…';
  };
  const seatsLabel = seatMode ? `, ${seats} ${seatsWord(seats)}` : '';
  const renewing = subscription?.plan.code === 'researcher' && subscription.status === 'active';
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
      const { confirmation_url: url } = await createCheckout(
        term,
        seatMode && term !== 'one_off' ? seats : undefined,
      );
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
      {seatMode && plans && term !== 'one_off' ? (
        <div className="seat-config" style={{ marginTop: 0, marginBottom: 12 }}>
          <span className="seat-config__label">Мест в команде</span>
          <SeatStepper value={seats} onChange={setSeats} max={plans.max_seats} disabled={busy} />
        </div>
      ) : null}
      <Radio.Group
        value={term}
        onChange={(event) => setTerm(event.target.value as PlanRequestTerm)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <Radio value="month">
          «Исследователь» на месяц
          {researcher ? ` — ${priceOf('month')}${seatsLabel}${researcherTokens}` : ''}
        </Radio>
        <Radio value="year">
          «Исследователь» на год
          {researcher ? ` — ${priceOf('year')}${seatsLabel}${researcherTokens}` : ''}
        </Radio>
        <Radio value="one_off" disabled={subscribed}>
          Разовый доступ «Исследование»
          {plans
            ? ` — ${formatPrice(plans.pack_price_kopecks)} на ${plans.pack_days} дней, ${formatCreditsWithWord(plans.pack.limits.ai_tokens_per_period)} ИИ`
            : ''}
        </Radio>
      </Radio.Group>
      {seatMode && term !== 'one_off' ? (
        <p className="billing-note">
          {SEAT_PRICE_RULE}
          {renewing ? ' Для действующей подписки итоговая сумма показана на странице оплаты.' : ''}
        </p>
      ) : null}
      <p className="billing-note">
        Подписка не продлевается сама: когда срок подойдёт к концу, мы напомним, и вы оплатите ещё раз. Если
        подписка уже действует, оплаченный срок добавится к ней. Разовый доступ не продлевается: новая
        покупка начинает его заново. Опросы, сбор ответов и обычная аналитика не зависят от кредитов ИИ.
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
