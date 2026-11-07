import { useEffect, useState } from 'react';
import { Alert, Button, Modal } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { addSeats, billingActionError, buyAddon, getSeatAdditionQuote } from '../../shared/api/billing.api';
import { useNotifications } from '../../shared/context/notifications.context';
import type { PlansResponse, SeatAdditionQuote, SubscriptionInfo } from '../../types/billing';
import { SeatStepper } from './SeatConfigurator';
import { SEAT_PRICE_RULE, seatsWord } from './seatPricing';
import { formatCredits, formatCreditsWithWord, formatDay, formatPrice } from './billingFormat';
import { payInNewTab } from './payInNewTab';
import './billing.css';

interface Props {
  subscription: SubscriptionInfo;
  plans: PlansResponse;
}

/** «1 день», «2 дня», «5 дней» */
const daysWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'дней';
  if (rest10 === 1) return 'день';
  if (rest10 >= 2 && rest10 <= 4) return 'дня';
  return 'дней';
};

interface DialogProps {
  current: number;
  max: number;
  windowDaysLeft: number;
  periodEnd: string;
  onClose: () => void;
}

interface Answer {
  seats: number;
  quote?: SeatAdditionQuote;
  error?: string;
}

/** Choosing how many seats the team gets; the sum for the rest of the paid period is shown before paying */
const AddSeatsDialog = ({ current, max, windowDaysLeft, periodEnd, onClose }: DialogProps) => {
  const { notifyInfo } = useNotifications();
  const [target, setTarget] = useState(current + 1);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSeatAdditionQuote(target)
      .then((quote) => {
        if (!cancelled) setAnswer({ seats: target, quote });
      })
      .catch((err) => {
        if (!cancelled) {
          setAnswer({ seats: target, error: billingActionError(err, 'Не удалось узнать сумму. Попробуйте позже.') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const shown = answer?.seats === target ? answer : null;
  const quote = shown?.quote;

  const pay = async () => {
    setBusy(true);
    setPayError(null);
    try {
      const usedTab = await payInNewTab(() => addSeats(target));
      if (usedTab) {
        notifyInfo('Оплата открыта в новой вкладке', 'После оплаты новые места появятся сразу.');
        onClose();
      }
    } catch (err) {
      setPayError(billingActionError(err, 'Не удалось перейти к оплате. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Добавить места"
      okText="Перейти к оплате"
      cancelText="Отмена"
      confirmLoading={busy}
      onCancel={busy ? undefined : onClose}
      onOk={() => void pay()}
      okButtonProps={{ disabled: !quote }}
    >
      {payError ? <Alert type="error" showIcon title={payError} style={{ marginBottom: 16 }} /> : null}
      <div className="seat-config" style={{ marginTop: 0 }}>
        <span className="seat-config__label">Мест в команде было {current}, станет</span>
        <SeatStepper value={target} onChange={setTarget} min={current + 1} max={max} disabled={busy} />
      </div>
      {shown?.error ? <Alert type="warning" showIcon title={shown.error} style={{ marginTop: 12 }} /> : null}
      {quote ? (
        <p style={{ margin: '12px 0 0', fontSize: 15 }}>
          К оплате: <strong>{formatPrice(quote.amount_kopecks)}</strong>
          <span className="billing-note" style={{ display: 'block' }}>
            За {quote.days_left} {daysWord(quote.days_left)} до конца оплаченного срока ({formatDay(periodEnd)}).
            Срок подписки не меняется. Дальше новые места продлеваются вместе со всей командой.
          </span>
        </p>
      ) : shown?.error ? null : (
        <p className="billing-note">Считаем сумму…</p>
      )}
      {windowDaysLeft > 0 ? (
        <p className="billing-note">
          Идут первые 7 дней после оплаты: ещё {windowDaysLeft} {daysWord(windowDaysLeft)} места 2 и 3 можно
          добавить по цене комплекта. {SEAT_PRICE_RULE}
        </p>
      ) : (
        <p className="billing-note">{SEAT_PRICE_RULE}</p>
      )}
      <p className="billing-note" style={{ marginBottom: 0 }}>
        Оплата проходит на странице ЮKassa на условиях{' '}
        <a href="/legal#offer" target="_blank" rel="noreferrer">
          публичной оферты
        </a>
        , которую вы приняли при подключении тарифа.
      </p>
    </Modal>
  );
};

/**
 * The team side of the subscription: paid seats, the 7-day window, the extra pack of credits and the
 * buttons that buy more of them. Shown only while the plan is sold by seats.
 */
export const SeatsPanel = ({ subscription, plans }: Props) => {
  const { notifyInfo, notifyError } = useNotifications();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addonBusy, setAddonBusy] = useState(false);

  const running = subscription.status === 'active' && !subscription.trial_ends_at;
  const isResearcher = subscription.plan.code === 'researcher';
  const canAddSeats = plans.payments_enabled && running && isResearcher && subscription.seats < plans.max_seats;
  // The extra pack is bought on top of a running subscription or the pack «Исследование»
  const canBuyAddon = plans.payments_enabled && running && (isResearcher || subscription.plan.code === 'pack');
  const extra = subscription.usage.ai_extra_tokens;
  const windowLeft = subscription.seat_window_days_left;
  const perSeat = plans.plans.find((plan) => plan.code === 'researcher')?.limits.ai_tokens_per_period ?? 0;

  const handleAddon = async () => {
    setAddonBusy(true);
    try {
      const usedTab = await payInNewTab(buyAddon);
      if (usedTab) notifyInfo('Оплата открыта в новой вкладке', 'После оплаты кредиты появятся сразу.');
    } catch (err) {
      notifyError(billingActionError(err, 'Не удалось перейти к оплате. Попробуйте ещё раз.'));
    } finally {
      setAddonBusy(false);
    }
  };

  return (
    <>
      <h3 className="profile-page__section-title" style={{ marginTop: 24 }}>
        Команда и кредиты
      </h3>
      <dl className="profile-page__facts">
        {isResearcher ? (
          <div>
            <dt>Оплачено мест</dt>
            <dd>
              {subscription.seats} {seatsWord(subscription.seats)}
            </dd>
          </div>
        ) : null}
        {isResearcher ? (
          <div>
            <dt>Кредитов на место</dt>
            <dd>{formatCredits(perSeat)} в месяц</dd>
          </div>
        ) : null}
        <div>
          <dt>Дополнительный пакет</dt>
          <dd>{extra > 0 ? `осталось ${formatCreditsWithWord(extra)}` : 'нет'}</dd>
        </div>
      </dl>
      {windowLeft > 0 && isResearcher ? (
        <p className="billing-note">
          Ещё {windowLeft} {daysWord(windowLeft)} места 2 и 3 можно добавить по 300 ₽ в месяц. После этого каждое
          новое место стоит 420 ₽.
        </p>
      ) : null}
      <div className="billing-actions" style={{ marginTop: 12 }}>
        {canAddSeats ? (
          <Button icon={<PlusOutlined />} onClick={() => setDialogOpen(true)}>
            Добавить места
          </Button>
        ) : null}
        {canBuyAddon ? (
          <Button icon={<ThunderboltOutlined />} loading={addonBusy} onClick={() => void handleAddon()}>
            Докупить {formatCreditsWithWord(plans.addon_tokens)} за {formatPrice(plans.addon_price_kopecks)}
          </Button>
        ) : null}
      </div>
      {canBuyAddon ? (
        <p className="billing-note">
          Дополнительный пакет действует {plans.addon_days} дней и расходуется после месячных кредитов. Он общий для
          всей команды.
        </p>
      ) : null}
      {dialogOpen ? (
        <AddSeatsDialog
          current={subscription.seats}
          max={plans.max_seats}
          windowDaysLeft={windowLeft}
          periodEnd={subscription.current_period_end}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
};
