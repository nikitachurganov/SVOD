import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { Link } from 'react-router-dom';
import { getSeatUsage } from '../../shared/api/organizations.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import type { SeatUsage } from '../../types/organization';
import type { SubscriptionInfo } from '../../types/billing';
import { seatsWord } from './seatPricing';
import './billing.css';

interface Props {
  subscription: SubscriptionInfo;
  /** The plan is sold by seats: the paid seats are shown against the people who take them */
  seatMode: boolean;
}

/**
 * The rules of the plan said in plain words, and how the paid seats are used now: who pays, who takes
 * a seat, what is shared by the team and when it ends.
 */
export const SubscriptionHowItWorks = ({ subscription, seatMode }: Props) => {
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const ownsTeam = !!activeOrganization && activeOrganization.owner_user_id === user?.id;
  const teamId = ownsTeam ? activeOrganization.id : null;
  const [usage, setUsage] = useState<{ teamId: string; value: SeatUsage } | null>(null);

  useEffect(() => {
    if (!seatMode || !teamId) return;
    let cancelled = false;
    getSeatUsage(teamId)
      .then((value) => {
        if (!cancelled) setUsage({ teamId, value });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [seatMode, teamId, subscription.seats]);

  const shown = usage && usage.teamId === teamId ? usage.value : null;
  const over = shown !== null && shown.seats_limit !== null && shown.seats_used > shown.seats_limit;
  const free = shown ? Math.max((shown.seats_limit ?? shown.seats_used) - shown.seats_used, 0) : 0;

  return (
    <>
      <h3 className="profile-page__section-title" style={{ marginTop: 24 }}>
        Как устроена подписка
      </h3>
      {seatMode && shown && shown.billing_enabled && activeOrganization ? (
        <Alert
          className="billing-alert"
          type={over ? 'warning' : 'info'}
          showIcon
          title={
            shown.seats_limit !== null
              ? `Занято мест в команде «${activeOrganization.name}»: ${shown.seats_used} из ${shown.seats_limit}`
              : `Занято мест в команде «${activeOrganization.name}»: ${shown.seats_used}`
          }
          description={
            <>
              {over
                ? 'Людей больше, чем оплаченных мест. Добавьте места или освободите их в разделе «Команда». '
                : `Свободно: ${free} ${seatsWord(free)}. `}
              <Link to="/participants">Открыть команду</Link>
            </>
          }
        />
      ) : null}
      <ul className="billing-how">
        <li>Подписку оплачиваете вы, она привязана к вашему аккаунту и действует во всех командах, где вы владелец.</li>
        <li>
          Место занимают владелец, администраторы и редакторы, а также приглашение, на которое ещё не ответили.
          Читатели места не занимают.
        </li>
        <li>
          Кредиты ИИ даются на каждое оплаченное место, а тратятся из общего запаса команды. Месячные кредиты
          обновляются вместе с продлением, дополнительный пакет тратится после них.
        </li>
        <li>
          Срок один на всю команду. Место, добавленное посреди срока, оплачивается за оставшиеся дни и дальше
          продлевается вместе с остальными.
        </li>
        <li>Если подписка закончится, вы вернётесь на «Старт»: опросы и ответы сохранятся, лишние опросы закроются.</li>
      </ul>
    </>
  );
};
