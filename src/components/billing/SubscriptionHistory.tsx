import { useEffect, useState } from 'react';
import { getSubscriptionHistory } from '../../shared/api/billing.api';
import type { SubscriptionHistoryItem } from '../../types/billing';
import { formatDay } from './billingFormat';
import { describeHistory } from './billingText';
import './billing.css';

/** What happened to the plan, newest first: paid, seats added, ended, refunded. Nothing is drawn while empty. */
export const SubscriptionHistory = ({ reloadKey }: { reloadKey: number }) => {
  const [items, setItems] = useState<SubscriptionHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSubscriptionHistory()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (items.length === 0) return null;

  return (
    <>
      <h3 className="profile-page__section-title" style={{ marginTop: 24 }}>
        Что происходило с тарифом
      </h3>
      <ul className="billing-history">
        {items.map((item, index) => {
          const { title, detail } = describeHistory(item);
          return (
            <li key={`${item.created_at}-${item.kind}-${index}`} className="billing-history__item">
              <span className="billing-history__date">{formatDay(item.created_at)}</span>
              <div>
                <div className="billing-history__title">{title}</div>
                {detail ? <div className="billing-note billing-note--tight">{detail}</div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
};
