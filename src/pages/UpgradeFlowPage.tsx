import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Input, Modal, Select, Skeleton } from 'antd';
import {
  ArrowLeftOutlined,
  CloseOutlined,
  CreditCardOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
} from '../shared/ui/materialIcons';
import { ConsentChecklist } from '../components/billing/ConsentChecklist';
import { SeatStepper } from '../components/billing/SeatConfigurator';
import { NOTHING_ACCEPTED, allAccepted, type Accepted } from '../components/billing/consents';
import { formatCreditsWithWord, formatPrice } from '../components/billing/billingFormat';
import { daysWord } from '../components/billing/billingText';
import { payInNewTab } from '../components/billing/payInNewTab';
import { DEFAULT_SEATS, SEAT_PRICE_RULE, seatsWord, useQuote } from '../components/billing/seatPricing';
import {
  crumbsFor,
  flowPath,
  isFlowStep,
  NEW_TEAM,
  readFlow,
  type FlowState,
  type FlowStep,
} from '../components/billing/upgradeFlow';
import { takesSeat, ROLE_LABELS } from '../components/organization/participants.utils';
import { billingActionError, createCheckout, getPlans } from '../shared/api/billing.api';
import { getMembers, listOrgInvitations } from '../shared/api/organizations.api';
import { HOME_PATH } from '../shared/config/appMode';
import { useNotifications } from '../shared/context/notifications.context';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { buildDisplayName } from '../shared/utils/userName';
import type { PlansResponse, QuoteLine, QuoteTerm } from '../types/billing';
import '../components/billing/billing.css';
import '../components/billing/upgrade-modal.css';
import '../components/billing/upgrade-flow.css';

const SETTINGS_PLANS = '/settings?tab=plans';

const TERM_TITLE: Record<QuoteTerm, string> = { month: 'Месяц', year: 'Год' };

interface PriceGroup {
  kind: string;
  count: number;
  unit: number;
}

const KIND_ORDER = ['creator', 'kit', 'other'];

/** The seats of a quote by kind, each kind with its price and number */
const groupLines = (lines: QuoteLine[]): PriceGroup[] =>
  KIND_ORDER.flatMap((kind) => {
    const own = lines.filter((line) => line.kind === kind);
    return own.length > 0 ? [{ kind, count: own.length, unit: own[0].kopecks }] : [];
  });

const groupLabel = (group: PriceGroup): string => {
  if (group.kind === 'creator') return 'Ваше место (владелец)';
  if (group.kind === 'kit') {
    return group.count > 1 ? `Места 2 и 3 по цене комплекта × ${group.count}` : 'Место 2 по цене комплекта';
  }
  return `Остальные места × ${group.count}`;
};

interface SeatRow {
  key: string;
  name: string;
  email: string;
  seat: string;
  paid: boolean;
}

/**
 * The way to a paid plan after the plans themselves: one or a team, the seats of the team with the people
 * who take them, the payment. Full-page steps with a trail on top; the choice lives in the address.
 */
export const UpgradeFlowPage = () => {
  const { step } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const {
    activeOrganization,
    organizations,
    isLoading: orgsLoading,
    createOrganization,
    setActiveOrganizationId,
  } = useOrganization();
  const { notifyInfo } = useNotifications();

  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [accepted, setAccepted] = useState<Accepted>(NOTHING_ACCEPTED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatsModal, setSeatsModal] = useState<number | null>(null);
  const [people, setPeople] = useState<{ orgId: string; rows: SeatRow[] } | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamNameError, setTeamNameError] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxSeats = plans?.max_seats ?? 10;
  const flow = readFlow(searchParams, maxSeats);
  const seatMode = Boolean(plans?.seat_pricing_enabled);
  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');
  const pack = plans?.pack;

  // The seats are bought for one of the person's own teams, or for a new one made right before the payment
  const ownTeams = organizations.filter((org) => org.owner_user_id === user?.id);
  const ownTeam = (id: string | null) => (id ? (ownTeams.find((org) => org.id === id) ?? null) : null);
  const defaultTeamId =
    ownTeam(activeOrganization?.id ?? null)?.id ?? (ownTeams.length > 0 ? ownTeams[0].id : NEW_TEAM);
  const chosenTeam: string =
    flow.org === NEW_TEAM ? NEW_TEAM : (ownTeam(flow.org)?.id ?? defaultTeamId);
  const teamOrgId = flow.who === 'team' && chosenTeam !== NEW_TEAM ? chosenTeam : null;
  const teamTitle = ownTeam(teamOrgId)?.name ?? null;
  const ownerFirstName = profile?.firstName?.trim();
  const newTeamName = teamName ?? (ownerFirstName ? `Команда ${ownerFirstName}` : 'Моя команда');

  useEffect(() => {
    if (!teamOrgId || step !== 'seats') return;
    let cancelled = false;
    Promise.all([getMembers(teamOrgId), listOrgInvitations(teamOrgId)])
      .then(([members, invitations]) => {
        if (cancelled) return;
        const rows: SeatRow[] = members.map((member) => ({
          key: `m:${member.id}`,
          name: buildDisplayName(member.user) || '—',
          email: member.user.email,
          seat: ROLE_LABELS[member.role_tag] ?? 'Участник',
          paid: takesSeat(member.role_tag),
        }));
        invitations
          .filter((invitation) => invitation.status === 'pending')
          .forEach((invitation) =>
            rows.push({
              key: `i:${invitation.id}`,
              name: 'Приглашён',
              email: invitation.email,
              seat: ROLE_LABELS[invitation.role_tag] ?? 'Участник',
              paid: takesSeat(invitation.role_tag),
            }),
          );
        setPeople({ orgId: teamOrgId, rows });
      })
      .catch(() => {
        if (!cancelled) setPeople(null);
      });
    return () => {
      cancelled = true;
    };
  }, [teamOrgId, step]);

  const ownRow: SeatRow = {
    key: 'me',
    name: `${buildDisplayName(profile ?? {})} (вы)`,
    email: profile?.email ?? user?.email ?? '',
    seat: 'Владелец',
    paid: true,
  };
  const personRows: SeatRow[] = teamOrgId && people?.orgId === teamOrgId ? people.rows : [ownRow];
  const occupied = Math.max(personRows.filter((row) => row.paid).length, 1);

  const quoting = seatMode && flow.offer === 'researcher';
  const monthQuote = useQuote('month', flow.seats, quoting);
  const yearQuote = useQuote('year', flow.seats, quoting);
  const quoteFor = (kind: QuoteTerm) => (kind === 'month' ? monthQuote : yearQuote);

  const priceFor = (kind: QuoteTerm): number | null => {
    if (flow.offer === 'pack') return plans ? plans.pack_price_kopecks : null;
    if (!researcher) return null;
    if (!seatMode) return kind === 'month' ? researcher.price_month_kopecks : researcher.price_year_kopecks;
    return quoteFor(kind).quote?.total_kopecks ?? null;
  };
  const priceText = (kind: QuoteTerm): string => {
    const value = priceFor(kind);
    if (value !== null) return formatPrice(value);
    return quoting && quoteFor(kind).failed ? 'цена недоступна' : '…';
  };

  const crumbs = crumbsFor(flow, seatMode);

  if (loadFailed) {
    return (
      <div className="upgrade-flow">
        <div className="upgrade-flow__main">
          <Alert
            type="error"
            showIcon
            title="Не удалось загрузить тарифы"
            description="Закройте страницу и откройте её снова."
            action={<Button onClick={() => navigate(HOME_PATH)}>На главную</Button>}
          />
        </div>
      </div>
    );
  }
  if (!plans || !researcher || !pack || orgsLoading) {
    return (
      <div className="upgrade-flow">
        <div className="upgrade-flow__main">
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      </div>
    );
  }
  // Nothing to buy online: the plans page explains what to do instead
  if (!plans.payments_enabled || !isFlowStep(step)) return <Navigate to={SETTINGS_PLANS} replace />;
  // Without seats (or for the pack) there is nothing to choose before the payment
  if ((!seatMode || flow.offer === 'pack') && step !== 'checkout') {
    return <Navigate to={flowPath('checkout', flow)} replace />;
  }
  if (step === 'seats' && flow.who === 'solo') return <Navigate to={flowPath('who', flow)} replace />;
  // A team's payment needs the team itself: it is chosen (or made) on the seats page
  if (step === 'checkout' && flow.offer === 'researcher' && flow.who === 'team' && !teamOrgId) {
    return <Navigate to={flowPath('seats', flow)} replace />;
  }

  const go = (next: FlowStep, state: FlowState = flow, replace = false) =>
    navigate(flowPath(next, state), { replace });
  const back = () => {
    const index = crumbs.findIndex((crumb) => crumb.step === step);
    if (index > 0) go(crumbs[index - 1].step);
    else navigate(-1);
  };
  const setSeats = (seats: number) => go('seats', { ...flow, seats }, true);
  const setTerm = (term: QuoteTerm) => go(step, { ...flow, term }, true);

  const free = Math.max(flow.seats - occupied, 0);
  const total = priceFor(flow.offer === 'pack' ? 'month' : flow.term);
  const chosenQuote = quoting ? quoteFor(flow.term).quote : null;
  const creditsPerPeriod = researcher.limits.ai_tokens_per_period * (seatMode ? flow.seats : 1);
  const kitOffer = flow.seats < 3;

  const pay = async () => {
    if (!allAccepted(accepted)) return;
    setBusy(true);
    setError(null);
    try {
      const term = flow.offer === 'pack' ? 'one_off' : flow.term;
      const usedTab = await payInNewTab(() =>
        createCheckout(
          term,
          seatMode && flow.offer === 'researcher' ? flow.seats : undefined,
          teamOrgId ? 'participants' : 'plans',
        ),
      );
      if (usedTab) {
        notifyInfo('Оплата открыта в новой вкладке', 'После оплаты тариф включится сразу.');
        if (teamOrgId) {
          // The people are invited from the team's own page: open the team the seats were bought for
          setActiveOrganizationId(teamOrgId);
          navigate('/participants');
        } else {
          navigate(SETTINGS_PLANS);
        }
      }
    } catch (err) {
      setError(billingActionError(err, 'Не удалось перейти к оплате. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
    }
  };

  const summary = (
    <aside className="upgrade-summary upgrade-summary--sticky" aria-label="Состав заказа">
      <h2 className="upgrade-summary__title">{flow.offer === 'pack' ? pack.title : 'Исследователь'}</h2>
      {flow.offer === 'researcher' && flow.who === 'team' ? (
        <p className="upgrade-summary__team">
          {teamTitle ? `Команда «${teamTitle}»` : `Новая команда «${newTeamName.trim() || '…'}»`}
        </p>
      ) : null}
      {flow.offer === 'researcher' ? (
        <div className="upgrade-radios" role="radiogroup" aria-label="Срок">
          {(['year', 'month'] as QuoteTerm[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={flow.term === kind}
              disabled={busy}
              className={`upgrade-radio${flow.term === kind ? ' upgrade-radio--selected' : ''}`}
              onClick={() => setTerm(kind)}
            >
              <span className="upgrade-radio__dot" aria-hidden />
              <span className="upgrade-radio__name">
                {TERM_TITLE[kind]}
                {kind === 'year' ? <span className="upgrade-term__tag">выгоднее</span> : null}
              </span>
              <span className="upgrade-radio__price">{priceText(kind)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="billing-note" style={{ marginTop: 0 }}>
          Разовый доступ на {plans.pack_days} {daysWord(plans.pack_days)}, без автопродления.
        </p>
      )}
      {chosenQuote
        ? groupLines(chosenQuote.lines).map((group) => (
            <div className="upgrade-summary__row" key={group.kind}>
              <span>{groupLabel(group)}</span>
              <span>{formatPrice(group.unit * group.count)}</span>
            </div>
          ))
        : null}
      {flow.offer === 'researcher' && seatMode ? (
        <div className="upgrade-summary__row upgrade-summary__row--muted">
          <span>
            {flow.seats} {seatsWord(flow.seats)}
          </span>
          <span />
        </div>
      ) : null}
      <div className="upgrade-summary__row upgrade-summary__row--total">
        <span>К оплате</span>
        <span>{total === null ? '…' : formatPrice(total)}</span>
      </div>
      {flow.offer === 'researcher' && yearQuote.quote && yearQuote.quote.year_saving_kopecks > 0 ? (
        <p className="upgrade-summary__saving">
          Выгода за год — {formatPrice(yearQuote.quote.year_saving_kopecks)}
        </p>
      ) : null}
      <p className="billing-note">
        {flow.offer === 'researcher'
          ? `${formatCreditsWithWord(creditsPerPeriod)} ИИ в месяц${seatMode ? ' на всю команду' : ''}`
          : `${formatCreditsWithWord(pack.limits.ai_tokens_per_period)} ИИ на весь срок`}
      </p>
    </aside>
  );

  const whoStep = (
    <div className="upgrade-flow__narrow">
      <h1 className="upgrade-flow__title">Для кого вы подключаете «Исследователь»?</h1>
      <div className="upgrade-options" role="radiogroup" aria-label="Для кого тариф">
        <button
          type="button"
          role="radio"
          aria-checked={flow.who === 'solo'}
          className={`upgrade-option${flow.who === 'solo' ? ' upgrade-option--selected' : ''}`}
          onClick={() => go('who', { ...flow, who: 'solo' }, true)}
        >
          <UserOutlined className="upgrade-option__icon" aria-hidden />
          <strong>Только я</strong>
          <span>Людей можно пригласить позже</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={flow.who === 'team'}
          className={`upgrade-option${flow.who === 'team' ? ' upgrade-option--selected' : ''}`}
          onClick={() => go('who', { ...flow, who: 'team', seats: Math.max(flow.seats, DEFAULT_SEATS) }, true)}
        >
          <TeamOutlined className="upgrade-option__icon" aria-hidden />
          <strong>Я и моя команда</strong>
          <span>Места для нескольких человек</span>
        </button>
      </div>
      <Button
        type="primary"
        size="large"
        block
        onClick={() => go(flow.who === 'solo' ? 'checkout' : 'seats')}
      >
        {flow.who === 'solo' ? 'Далее: оплата' : 'Далее: места и оплата'}
      </Button>
    </div>
  );

  /** «Далее: оплата» on the seats page: a new team is made first, so the payment is for a team that exists */
  const toCheckout = async () => {
    if (chosenTeam !== NEW_TEAM) {
      go('checkout', { ...flow, org: chosenTeam });
      return;
    }
    const name = newTeamName.trim();
    if (!name) {
      setTeamNameError('Введите название команды');
      return;
    }
    if (name.length > 255) {
      setTeamNameError('Не более 255 символов');
      return;
    }
    setCreatingTeam(true);
    setError(null);
    try {
      const created = await createOrganization({ name });
      // Replace the address: «back» from the payment comes to this team, not to a second new one
      go('seats', { ...flow, org: created.id }, true);
      go('checkout', { ...flow, org: created.id });
    } catch {
      setTeamNameError('Не удалось создать команду. Попробуйте ещё раз.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const teamPicker = (
    <div className="upgrade-team">
      <label className="upgrade-team__label" htmlFor="upgrade-team-name">
        {ownTeams.length > 0 ? 'Команда' : 'Название команды'}
      </label>
      {ownTeams.length > 0 ? (
        <Select<string>
          id={chosenTeam === NEW_TEAM ? undefined : 'upgrade-team-name'}
          className="upgrade-team__select"
          value={chosenTeam}
          disabled={creatingTeam}
          onChange={(value) => go('seats', { ...flow, org: value }, true)}
          options={[
            ...ownTeams.map((org) => ({ value: org.id, label: org.name })),
            { value: NEW_TEAM, label: 'Новая команда…' },
          ]}
        />
      ) : null}
      {chosenTeam === NEW_TEAM ? (
        <>
          <Input
            id="upgrade-team-name"
            className="upgrade-team__input"
            value={newTeamName}
            maxLength={255}
            disabled={creatingTeam}
            status={teamNameError ? 'error' : undefined}
            placeholder="Например, «Исследования продукта»"
            onChange={(event) => {
              setTeamName(event.target.value);
              setTeamNameError(null);
            }}
          />
          <small className={teamNameError ? 'upgrade-team__error' : 'upgrade-team__hint'}>
            {teamNameError ?? 'Команда появится сразу, людей пригласите после оплаты в разделе «Участники».'}
          </small>
        </>
      ) : null}
    </div>
  );

  const seatsStep = (
    <div className="upgrade-flow__wide">
      <h1 className="upgrade-flow__title">
        Места для {teamTitle ? `команды «${teamTitle}»` : 'вашей команды'}
      </h1>
      <p className="upgrade-flow__lead">
        Место занимают владелец, администраторы и редакторы. Наблюдатели места не занимают и бесплатны.
      </p>
      <div className="upgrade-layout">
        <div>
          {teamPicker}
          {kitOffer ? (
            <div className="upgrade-offer">
              <div>
                <strong>Добавьте 2 человек по скидке</strong>
                <p>
                  Места 2 и 3 стоят 300 ₽ вместо 420 ₽ в месяц. Скидка действует сейчас и ещё 7 дней после первой
                  оплаты.
                </p>
              </div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setSeats(3)}>
                Добавить 2 места
              </Button>
            </div>
          ) : null}
          <div className="upgrade-table" role="table" aria-label="Люди и места команды">
            <div className="upgrade-table__head" role="row">
              <span role="columnheader">Участник</span>
              <span role="columnheader">Место</span>
            </div>
            {personRows.map((row) => (
              <div className="upgrade-table__row" role="row" key={row.key}>
                <span className="upgrade-table__who" role="cell">
                  <strong>{row.name}</strong>
                  <small>{row.email}</small>
                </span>
                <span className="upgrade-table__seat" role="cell">
                  {row.paid ? `Занимает место · ${row.seat}` : `Бесплатно · ${row.seat}`}
                </span>
              </div>
            ))}
            {Array.from({ length: free }, (_, index) => (
              <div className="upgrade-table__row upgrade-table__row--free" role="row" key={`free:${index}`}>
                <span className="upgrade-table__who" role="cell">
                  <strong>Свободное место</strong>
                  <small>Назначите, когда пригласите человека</small>
                </span>
                <span className="upgrade-table__seat" role="cell">
                  Оплачено, не занято
                </span>
              </div>
            ))}
            <div className="upgrade-table__foot">
              <Button icon={<PlusOutlined />} onClick={() => setSeatsModal(flow.seats)}>
                Добавить места на будущее
              </Button>
              <span>
                Сейчас: {occupied} занято, {free} свободно
              </span>
            </div>
          </div>
          <p className="billing-note">{SEAT_PRICE_RULE}</p>
          <div className="upgrade-footer">
            <Button icon={<ArrowLeftOutlined />} onClick={back}>
              Назад
            </Button>
            <Button
              type="primary"
              size="large"
              disabled={!monthQuote.quote}
              loading={creatingTeam}
              onClick={() => void toCheckout()}
            >
              {chosenTeam === NEW_TEAM ? 'Создать команду и перейти к оплате' : 'Далее: оплата'}
            </Button>
          </div>
        </div>
        {summary}
      </div>
      <Modal
        open={seatsModal !== null}
        title="Добавить или убрать места"
        okText="Подтвердить"
        cancelText="Отмена"
        width={420}
        onCancel={() => setSeatsModal(null)}
        onOk={() => {
          if (seatsModal !== null) setSeats(Math.max(seatsModal, occupied));
          setSeatsModal(null);
        }}
        destroyOnHidden
      >
        <p className="billing-note" style={{ marginTop: 0 }}>
          Места можно купить заранее: они пригодятся, когда вы позовёте людей. Меньше, чем уже занято ({occupied}),
          сделать нельзя.
        </p>
        <div className="upgrade-seats">
          <span className="upgrade-seats__label">Мест в команде</span>
          <SeatStepper
            value={seatsModal ?? flow.seats}
            onChange={setSeatsModal}
            min={occupied}
            max={maxSeats}
          />
        </div>
      </Modal>
    </div>
  );

  const checkoutStep = (
    <div className="upgrade-flow__wide">
      <h1 className="upgrade-flow__title">Оплата</h1>
      <p className="upgrade-flow__lead">
        Защищённая страница платёжного сервиса ЮKassa откроется в новой вкладке. Подписка не продлевается сама:
        когда срок подойдёт к концу, мы напомним, и вы оплатите ещё раз.
      </p>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <div className="upgrade-layout">
        <div className="upgrade-card upgrade-card--plain">
          <ConsentChecklist accepted={accepted} onChange={setAccepted} disabled={busy} />
          <Button
            type="primary"
            size="large"
            block
            icon={<CreditCardOutlined />}
            loading={busy}
            disabled={!allAccepted(accepted) || total === null}
            onClick={() => void pay()}
            style={{ marginTop: 20 }}
          >
            Перейти к оплате
          </Button>
          <div className="upgrade-footer upgrade-footer--start">
            <Button icon={<ArrowLeftOutlined />} disabled={busy} onClick={back}>
              Назад
            </Button>
          </div>
        </div>
        {summary}
      </div>
    </div>
  );

  return (
    <div className="upgrade-flow">
      <header className="upgrade-flow__bar">
        <Button type="text" icon={<CloseOutlined />} onClick={() => navigate(HOME_PATH)}>
          Отмена
        </Button>
        <nav className="upgrade-flow__crumbs" aria-label="Шаги оплаты">
          {crumbs.map((crumb, index) => (
            <span
              key={crumb.step}
              className={`upgrade-flow__crumb${crumb.step === step ? ' upgrade-flow__crumb--current' : ''}`}
              aria-current={crumb.step === step ? 'step' : undefined}
            >
              {index > 0 ? <span aria-hidden> › </span> : null}
              {crumb.label}
            </span>
          ))}
        </nav>
        <span />
      </header>
      <main className="upgrade-flow__main">
        {step === 'who' ? whoStep : null}
        {step === 'seats' ? seatsStep : null}
        {step === 'checkout' ? checkoutStep : null}
      </main>
    </div>
  );
};
