import { useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { getPayment } from '../../shared/api/billing.api';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import type { PaymentInfo, SubscriptionInfo, TeamBillingSummary } from '../../types/billing';
import { formatCreditsWithWord, formatNumber } from './billingFormat';
import { dayForSentence, daysWord } from './billingText';
import { seatsWord } from './seatPricing';
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
  /** The page the notice is shown on: a link to the same page is left out */
  currentPath?: string;
}

interface Result {
  title: string;
  lines: string[];
  /** Where the person goes next to use what they paid for */
  link?: { to: string; label: string };
}

/** What the payment changed, said in numbers: the plan and its end, the seats, the credits */
const resultOf = (
  payment: PaymentInfo,
  subscription: SubscriptionInfo | null,
  team: TeamBillingSummary | null,
): Result => {
  // The team model (docs/MONETIZATION_TEAM_SPEC.md): a pack or a month of Plus / Pro for one team
  if (payment.plan_code === 'team_pack') {
    return {
      title: 'Оплата прошла, пакет добавлен команде',
      lines: [
        '500 000 Токенов+ без срока действия. Они тратятся после квоты подписки, если она есть.',
        'Все методики и выгрузка CSV открыты для команды навсегда.',
        team ? `Купленных Токенов+ сейчас: ${formatNumber(team.purchased_tokens)}.` : '',
      ],
    };
  }
  if (payment.plan_code === 'plus' || payment.plan_code === 'pro') {
    const title = payment.plan_code === 'plus' ? 'Plus' : 'Pro';
    return {
      title: `Оплата прошла, тариф ${title} включён`,
      lines: [
        team?.period_end ? `Оплачено до ${dayForSentence(team.period_end)}.` : '',
        team?.subscription ? `Токенов+ на месяц: ${formatNumber(team.subscription.quota)}, они общие для команды.` : '',
        `Мест с учётом владельца: ${payment.seats}. Читатели — сверх лимита.`,
      ],
      link: { to: '/participants', label: 'Пригласить людей' },
    };
  }
  const until = subscription ? dayForSentence(subscription.current_period_end) : null;
  if (payment.term === 'seats_add') {
    return {
      title: 'Оплата прошла, места добавлены',
      lines: [
        `Теперь в команде оплачено ${payment.seats} ${seatsWord(payment.seats)}.`,
        until ? `Срок подписки не изменился: до ${until}. Новые места продлеваются вместе со всей командой.` : '',
        'Пригласите людей на новые места в разделе «Участники».',
      ],
      link: { to: '/participants', label: 'Открыть команду' },
    };
  }
  if (payment.term === 'addon') {
    return {
      title: 'Оплата прошла, кредиты добавлены',
      lines: [
        `Пакет действует ${payment.days} ${daysWord(payment.days)} и общий для всей команды.`,
        'Он тратится после месячных кредитов подписки.',
        subscription && subscription.usage.ai_extra_tokens > 0
          ? `Сейчас в пакетах осталось ${formatCreditsWithWord(subscription.usage.ai_extra_tokens)}.`
          : '',
      ],
    };
  }
  if (payment.plan_code === 'pack') {
    return {
      title: 'Оплата прошла, разовый доступ включён',
      lines: [
        until ? `Действует до ${until}.` : '',
        subscription ? `Кредитов ИИ: ${formatCreditsWithWord(subscription.usage.ai_tokens.max)}, действуют весь срок.` : '',
      ],
    };
  }
  return {
    title: 'Оплата прошла, тариф «Исследователь» включён',
    lines: [
      until ? `Действует до ${until}.` : '',
      payment.seats > 1
        ? `Оплачено мест: ${payment.seats}. Владелец, администраторы и редакторы занимают места, наблюдатели бесплатны.`
        : 'Оплачено 1 место: ваше.',
      subscription
        ? `Кредитов ИИ в месяц: ${formatCreditsWithWord(subscription.usage.ai_tokens.max)}, они общие для команды.`
        : '',
    ],
    link: payment.seats > 1 ? { to: '/participants', label: 'Пригласить людей' } : undefined,
  };
};

/** What a person sees after coming back from the payment page: the payment is asked about until it is settled */
export const PaymentReturnNotice = ({ paymentId, onDismiss, onSettled, currentPath }: Props) => {
  const { refresh, subscription, team } = useSubscription();
  const [outcome, setOutcome] = useState<Outcome>('checking');
  const [paid, setPaid] = useState<PaymentInfo | null>(null);

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
          setPaid(payment);
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
    const result = paid ? resultOf(paid, subscription, team) : null;
    return (
      <Alert
        className="billing-alert"
        type="success"
        showIcon
        title={result?.title ?? 'Оплата прошла, тариф включён'}
        description={
          result ? (
            <>
              {result.lines
                .filter(Boolean)
                .map((line) => (
                  <div key={line}>{line}</div>
                ))}
              {result.link && result.link.to !== currentPath ? (
                <Link to={result.link.to}>{result.link.label}</Link>
              ) : null}
            </>
          ) : undefined
        }
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
