import { useEffect, useState } from 'react';
import { getQuote } from '../../shared/api/billing.api';
import type { QuoteResponse, QuoteTerm } from '../../types/billing';
import { formatPrice } from './billingFormat';

/** The kit the price page opens on: the creator and two more places (docs/TARIFFS_FINAL.md, 4.3) */
export const DEFAULT_SEATS = 3;

/** Quotes do not change during a visit, so each (term, seats) pair is asked once */
const quoteCache = new Map<string, QuoteResponse>();

const quoteKey = (term: QuoteTerm, seats: number): string => `${term}:${seats}`;

/**
 * The price of a team of ``seats`` seats from the server's own calculator, so the page never shows a
 * number the payment would not charge. `quote` is null while it loads, and `failed` is true if it could not be read.
 */
export const useQuote = (
  term: QuoteTerm,
  seats: number,
  enabled: boolean,
): { quote: QuoteResponse | null; failed: boolean } => {
  const key = quoteKey(term, seats);
  const [fetched, setFetched] = useState<QuoteResponse | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || quoteCache.has(key)) return;
    let cancelled = false;
    getQuote(term, seats)
      .then((next) => {
        quoteCache.set(key, next);
        if (!cancelled) setFetched(next);
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, term, seats]);

  const cached = quoteCache.get(key);
  const current = cached ?? (fetched && quoteKey(fetched.term, fetched.seats) === key ? fetched : null);
  return { quote: enabled ? current : null, failed: enabled && !current && failedKey === key };
};

/** «Место» agrees with the number: 1 место, 2 места, 5 мест */
export const seatsWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'мест';
  if (rest10 === 1) return 'место';
  if (rest10 >= 2 && rest10 <= 4) return 'места';
  return 'мест';
};

/** The rule of the kit price, said once for every place that shows seats */
export const SEAT_PRICE_RULE =
  'Места 2 и 3 стоят по 300 ₽ в месяц, если купить их сразу или в первые 7 дней после первой оплаты. Позже, как и остальные места, — по 420 ₽ в месяц.';

/** What a year saves, as a sentence; nothing when it saves nothing */
export const yearSavingText = (quote: QuoteResponse | null): string | null =>
  quote && quote.term === 'year' && quote.year_saving_kopecks > 0
    ? `Выгода за год — ${formatPrice(quote.year_saving_kopecks)}`
    : null;
