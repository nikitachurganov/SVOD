import type { PaymentInfo, SubscriptionHistoryItem } from '../../types/billing';
import { formatDay, formatPrice } from './billingFormat';
import { seatsWord } from './seatPricing';

/** «1 день», «2 дня», «5 дней» */
export const daysWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'дней';
  if (rest10 === 1) return 'день';
  if (rest10 >= 2 && rest10 <= 4) return 'дня';
  return 'дней';
};

export interface Described {
  title: string;
  /** The second line: what exactly came of it */
  detail?: string;
}

const TERM_TEXT: Record<string, string> = { month: 'на месяц', year: 'на год' };

/** What a payment was for, in words: the plan and its seats, a payment for more seats, a pack of credits */
export const describePayment = (payment: PaymentInfo): Described => {
  if (payment.term === 'seats_add') {
    return {
      title: 'Доплата за места',
      detail: `Мест в команде стало ${payment.seats}. Срок подписки не менялся.`,
    };
  }
  if (payment.term === 'addon') {
    return {
      title: 'Дополнительный пакет кредитов',
      detail: `Общий для команды, действует ${payment.days} ${daysWord(payment.days)}.`,
    };
  }
  if (payment.plan_code === 'pack') {
    return { title: 'Разовый доступ «Исследование»', detail: `На ${payment.days} ${daysWord(payment.days)}.` };
  }
  const term = TERM_TEXT[payment.term];
  const seats = payment.seats > 1 ? `${payment.seats} ${seatsWord(payment.seats)}` : '1 место';
  return { title: 'Тариф «Исследователь»', detail: [seats, term].filter(Boolean).join(', ') };
};

/** What a refund took back, so the person is not left to guess why the plan is gone */
export const describeRefund = (payment: PaymentInfo): string | null => {
  if (payment.refunded_kopecks <= 0) return null;
  const full = payment.refunded_kopecks >= payment.amount_kopecks;
  const sum = formatPrice(payment.refunded_kopecks);
  if (payment.term === 'addon') {
    return full ? `Возврат ${sum}: пакет кредитов отозван.` : `Возврат ${sum}: пакет остался у вас.`;
  }
  if (payment.term === 'seats_add') return `Возврат ${sum}: добавленные места сняты.`;
  return full
    ? `Возврат ${sum}: оплаченные этим платежом дни сняты.`
    : `Возврат ${sum}: оплаченный период закончен.`;
};

/** A date to end a sentence with: «27 ноября 2026 г.» already has its dot */
export const dayForSentence = (iso: string | null | undefined): string => formatDay(iso).replace(/\.$/, '');

const detailText = (item: SubscriptionHistoryItem, key: string): string | null => {
  const value = item.details[key];
  return value === null || value === undefined ? null : String(value);
};

const planName = (code: string | null): string => {
  if (code === 'pack') return 'Разовый доступ «Исследование»';
  if (code === 'researcher') return 'Тариф «Исследователь»';
  return 'Платный тариф';
};

/** One line of the journal of the plan, in the person's words */
export const describeHistory = (item: SubscriptionHistoryItem): Described => {
  switch (item.kind) {
    case 'trial_started':
      return {
        title: 'Начат пробный период',
        detail: `До ${dayForSentence(detailText(item, 'ends_at'))}, потом вы вернётесь на «Старт».`,
      };
    case 'manual_grant': {
      const until = dayForSentence(detailText(item, 'until'));
      const extended = detailText(item, 'extended') === '1';
      return {
        title: `${planName(detailText(item, 'plan'))} ${extended ? 'продлён' : 'подключён'}`,
        detail: `Действует до ${until}.`,
      };
    }
    case 'seats_added':
      return {
        title: 'Добавлены места',
        detail: `Было ${detailText(item, 'from')}, стало ${detailText(item, 'to')}.`,
      };
    case 'refund_revoked': {
      const result = detailText(item, 'result');
      if (detailText(item, 'seats_to') !== null) {
        return {
          title: 'После возврата сняты места',
          detail: `Было ${detailText(item, 'seats_from')}, стало ${detailText(item, 'seats_to')}.`,
        };
      }
      if (result === 'shortened') {
        return {
          title: 'После возврата срок сокращён',
          detail: `Тариф действует до ${dayForSentence(detailText(item, 'period_end'))}.`,
        };
      }
      return { title: 'После возврата тариф закончился', detail: 'Вы вернулись на «Старт», опросы и ответы сохранены.' };
    }
    case 'expired':
      return {
        title: 'Платный тариф закончился',
        detail:
          detailText(item, 'reason') === 'refunded'
            ? 'Из-за возврата платежа. Вы на «Старте», опросы и ответы сохранены.'
            : 'Вы на «Старте», опросы и ответы сохранены.',
      };
    case 'canceled':
      return {
        title: 'Продление отключено',
        detail: `Тариф работает до ${dayForSentence(detailText(item, 'period_end'))}.`,
      };
    case 'resumed':
      return { title: 'Продление снова включено' };
    default:
      return { title: 'Изменение тарифа' };
  }
};
