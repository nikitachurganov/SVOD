import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Collapse, Table, Tag } from 'antd';
import type { CollapseProps } from 'antd';
import { Link } from 'react-router-dom';
import { billingActionError, createTeamCheckout, listTeamPayments } from '../../shared/api/billing.api';
import { LEGAL } from '../../shared/config/legal';
import type { TeamBalanceInfo, TeamBillingSummary, TeamOfferInfo, TeamPaymentInfo } from '../../types/billing';
import { formatDay, formatNumber, formatPrice } from './billingFormat';
import './billing.css';

const dateText = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';

const offerLine = (offer: TeamOfferInfo): string =>
  offer.days
    ? `${formatNumber(offer.tokens)} Токенов+ на месяц, мест с владельцем: ${offer.seats}. Читатели — сверх лимита.`
    : `${formatNumber(offer.tokens)} Токенов+ без срока. Можно покупать повторно, в том числе при подписке.`;

const OFFER_TAGLINE: Record<string, string> = {
  pack: 'Разовая докупка: все методики и выгрузка CSV открываются навсегда',
  plus: 'Для небольшой команды: всё для исследования весь оплаченный месяц',
  pro: 'Для команды до 10 человек: больше Токенов+ на всех',
};

const Balance = ({ title, hint, balance }: { title: string; hint: string; balance: TeamBalanceInfo }) => (
  <div className="plan-card__tokens">
    <div>
      <div className="plan-card__tokens-amount">
        {formatNumber(balance.remaining)} <span>{title}</span>
      </div>
      <p className="plan-card__tokens-hint">
        {hint}
        {balance.resets_at ? ` Обновится ${dateText(balance.resets_at)}.` : ''}
      </p>
    </div>
  </div>
);

const OfferCard = ({
  offer,
  action,
}: {
  offer: TeamOfferInfo;
  action: ReactNode;
}) => (
  <article className={`plan-card${offer.kind === 'plus' ? ' plan-card--featured' : ''}`}>
    <div className="plan-card__head">
      <h2 className="plan-card__name">{offer.title}</h2>
      <p className="plan-card__tagline">{OFFER_TAGLINE[offer.kind] ?? ''}</p>
    </div>
    <div className="plan-card__price">
      <span className="plan-card__amount">{formatPrice(offer.price_kopecks)}</span>
      <span className="plan-card__period">{offer.days ? 'в месяц' : 'за покупку'}</span>
    </div>
    <p className="plan-card__tokens-hint" style={{ margin: 0 }}>
      {offerLine(offer)}
    </p>
    {action}
  </article>
);

/** The team's plan, its balances kept apart, and what can be bought for this team */
export const TeamPlansPanel = ({
  summary,
  onChanged,
}: {
  summary: TeamBillingSummary;
  onChanged?: () => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (kind: string) => {
    setBusy(kind);
    setError(null);
    try {
      const { confirmation_url } = await createTeamCheckout(summary.organization_id, kind, 'plans');
      window.location.assign(confirmation_url);
    } catch (err) {
      setError(billingActionError(err, 'Не удалось начать оплату.'));
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="plans-page__cards">
      <article className="plan-card plan-card--current">
        <div className="plan-card__head">
          <div className="plan-card__title-row">
            <h2 className="plan-card__name">{summary.plan_title ?? 'Бесплатная команда'}</h2>
            <span className="plan-card__badge">Тариф команды</span>
          </div>
          <p className="plan-card__tagline">
            {summary.plan_title
              ? `Мест с учётом владельца: ${summary.seats}. Читатели — сверх лимита. Оплачено до ${dateText(summary.period_end)}.`
              : 'Покупки относятся только к этой команде.'}
          </p>
        </div>
        {summary.ai_mode === 'suspended' ? (
          <Alert
            type="warning"
            showIcon
            title="Токены+ закончились"
            description={
              summary.can_buy
                ? 'Работа с ИИ приостановлена до докупки пакета или нового месяца подписки. Остальные инструменты работают.'
                : 'Работа с ИИ приостановлена до докупки пакета или нового месяца подписки. Попросите владельца команды докупить пакет.'
            }
          />
        ) : null}
        {summary.subscription ? (
          <Balance
            title="Токенов+ до конца периода"
            hint="Остаток месячной квоты сгорает в конце оплаченного месяца."
            balance={summary.subscription}
          />
        ) : null}
        {summary.purchased_tokens > 0 || summary.subscription ? (
          <Balance
            title="купленных Токенов+"
            hint="Без срока действия, сохраняются при продлении и после окончания подписки."
            balance={{ remaining: summary.purchased_tokens, quota: summary.purchased_tokens, resets_at: null }}
          />
        ) : null}
        {summary.ai_mode === 'free' ? (
          <Balance
            title="бесплатных токенов"
            hint="Базовая модель GLM Flash, квота обновляется каждый месяц со дня создания команды."
            balance={summary.free}
          />
        ) : null}
        <p className="plan-card__tokens-hint" style={{ margin: 0 }}>
          {summary.permanent_tools ? 'Все методики и выгрузка CSV открыты навсегда.' : 'Методики: 5 базовых, выгрузка CSV закрыта.'}{' '}
          {summary.features.includes('crosstabs') ? 'Сравнение групп и фильтр качества доступны.' : 'Сравнение групп и фильтр качества — на Plus и Pro.'}
        </p>
        {!summary.can_buy ? (
          <p className="plan-card__tokens-hint" style={{ margin: 0 }}>
            Тариф и пакеты покупает владелец команды.
          </p>
        ) : null}
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </article>

      {summary.offers.map((offer) => (
        <OfferCard
          key={offer.kind}
          offer={offer}
          action={
            <Button
              type={offer.kind === 'plus' ? 'primary' : 'default'}
              loading={busy === offer.kind}
              disabled={!summary.can_buy || !offer.available}
              onClick={() => void buy(offer.kind)}
            >
              {!summary.can_buy
                ? 'Оплачивает владелец'
                : !offer.available
                  ? 'Недоступно при другом тарифе'
                  : summary.plan_code === offer.kind
                    ? 'Продлить на месяц'
                    : offer.days
                      ? 'Подключить'
                      : 'Купить пакет'}
            </Button>
          }
        />
      ))}
    </div>
  );
};

/** The public catalogue of the team model, for a visitor who has not signed in (the page /pricing) */
export const TeamPublicCatalog = ({
  offers,
  freeTokens,
  signedIn,
}: {
  offers: TeamOfferInfo[];
  freeTokens: number;
  signedIn: boolean;
}) => (
  <div className="plans-page__cards">
    <article className="plan-card">
      <div className="plan-card__head">
        <h2 className="plan-card__name">Бесплатно</h2>
        <p className="plan-card__tagline">Попробовать сервис и собрать первые ответы</p>
      </div>
      <div className="plan-card__price">
        <span className="plan-card__amount">0 ₽</span>
        <span className="plan-card__period">навсегда</span>
      </div>
      <p className="plan-card__tokens-hint" style={{ margin: 0 }}>
        {formatNumber(freeTokens)} токенов базовой модели каждый месяц со дня создания команды.
      </p>
      <Link to={signedIn ? '/' : '/auth'}>
        <Button block>{signedIn ? 'Перейти к опросам' : 'Начать бесплатно'}</Button>
      </Link>
    </article>
    {offers.map((offer) => (
      <OfferCard
        key={offer.kind}
        offer={offer}
        action={
          <Link to={signedIn ? '/plans' : '/auth'}>
            <Button block type={offer.kind === 'plus' ? 'primary' : 'default'}>
              {signedIn ? 'Выбрать для команды' : 'Войти и подключить'}
            </Button>
          </Link>
        }
      />
    ))}
  </div>
);

interface Row {
  key: string;
  label: string;
  free: string;
  pack: string;
  plus: string;
  pro: string;
}

const priceOf = (offers: TeamOfferInfo[], kind: string): TeamOfferInfo | undefined =>
  offers.find((offer) => offer.kind === kind);

/** What each offer gives, side by side (docs/MONETIZATION_TEAM_SPEC.md, sections 1–3) */
const comparisonRows = (offers: TeamOfferInfo[], freeTokens: number): Row[] => {
  const tokens = (kind: string) => formatNumber(priceOf(offers, kind)?.tokens ?? 0);
  const seats = (kind: string) => String(priceOf(offers, kind)?.seats ?? '');
  return [
    {
      key: 'tokens',
      label: 'ИИ на команду',
      free: `${formatNumber(freeTokens)} токенов базовой модели`,
      pack: `${tokens('pack')} Токенов+`,
      plus: `${tokens('plus')} Токенов+`,
      pro: `${tokens('pro')} Токенов+`,
    },
    {
      key: 'term',
      label: 'Срок',
      free: 'Каждый месяц со дня создания команды',
      pack: 'Без срока, можно докупать',
      plus: 'На оплаченный месяц, остаток сгорает',
      pro: 'На оплаченный месяц, остаток сгорает',
    },
    {
      key: 'models',
      label: 'Модель ИИ',
      free: 'Базовая (GLM Flash)',
      pack: 'Выбор модели, пока есть Токены+',
      plus: 'Выбор модели, пока есть Токены+',
      pro: 'Выбор модели, пока есть Токены+',
    },
    {
      key: 'seats',
      label: 'Места с владельцем',
      free: '1',
      pack: 'Как у команды',
      plus: `${seats('plus')}, читатели сверх лимита`,
      pro: `${seats('pro')}, читатели сверх лимита`,
    },
    { key: 'collect', label: 'Опросы и ответы', free: 'Без ограничений', pack: 'Без ограничений', plus: 'Без ограничений', pro: 'Без ограничений' },
    { key: 'methods', label: 'Методики и выгрузка CSV', free: '5 базовых, без CSV', pack: 'Все, навсегда', plus: 'Все', pro: 'Все' },
    { key: 'compare', label: 'Сравнение групп и фильтр качества', free: 'Нет', pack: 'Нет', plus: 'Да', pro: 'Да' },
  ];
};

/** The questions people ask before paying, for the team model */
export const TeamPlansFaq = ({ offers, freeTokens }: { offers: TeamOfferInfo[]; freeTokens: number }) => {
  const pack = priceOf(offers, 'pack');
  const items: CollapseProps['items'] = [
    {
      key: 'comparison',
      label: 'Подробное сравнение: что входит в каждый вариант (таблица)',
      children: (
        <div className="plans-page__table" style={{ marginTop: 8 }}>
          <Table<Row>
            rowKey="key"
            pagination={false}
            size="middle"
            dataSource={comparisonRows(offers, freeTokens)}
            columns={[
              { title: '', dataIndex: 'label', key: 'label' },
              { title: 'Бесплатно', dataIndex: 'free', key: 'free', width: 170 },
              { title: 'Пакет', dataIndex: 'pack', key: 'pack', width: 170 },
              { title: 'Plus', dataIndex: 'plus', key: 'plus', width: 170 },
              { title: 'Pro', dataIndex: 'pro', key: 'pro', width: 170 },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'team',
      label: 'Для кого действует покупка?',
      children: (
        <p className="plans-faq__answer">
          Тариф, пакет, места и баланс относятся к одной команде. Если у вас несколько команд, покупка для одной не
          меняет другие. Все опросы команды расходуют общий баланс, выбирать опрос или включать анализ отдельно не нужно.
          Покупает владелец команды.
        </p>
      ),
    },
    {
      key: 'tokens',
      label: 'Что такое Токены+ и как они расходуются?',
      children: (
        <p className="plans-faq__answer">
          Токены+ — единица оплаты ИИ. 1 000 токенов базовой модели стоят 200 Токенов+, сильной модели — 1 000. Сначала
          расходуется квота подписки, затем купленные пакеты. Квота подписки сгорает в конце оплаченного месяца, пакеты
          действуют без срока.
        </p>
      ),
    },
    {
      key: 'ended',
      label: 'Что будет, когда подписка закончится или Токены+ кончатся?',
      children: (
        <p className="plans-faq__answer">
          Сравнение групп и фильтр качества закрываются, опросы и ответы остаются. Если команда покупала пакет, все
          методики и выгрузка CSV остаются навсегда, а купленные Токены+ можно тратить дальше. Если в оплаченный месяц
          закончились и квота, и пакеты, работа с ИИ приостанавливается до докупки пакета
          {pack ? ` за ${formatPrice(pack.price_kopecks)}` : ''} или нового месяца подписки.
        </p>
      ),
    },
    {
      key: 'activation',
      label: 'Как и когда активируется доступ после оплаты?',
      children: (
        <p className="plans-faq__answer">
          Сервис {LEGAL.serviceName} — это цифровая облачная платформа, доставка физических носителей не осуществляется.
          Тариф или пакет начисляется команде на{' '}
          <a href={LEGAL.siteUrl} target="_blank" rel="noreferrer">
            {LEGAL.siteUrl.replace(/^https?:\/\//, '')}
          </a>{' '}
          автоматически сразу после успешного платежа. При оплате по счёту — в течение одного рабочего дня с момента
          поступления средств.
        </p>
      ),
    },
    {
      key: 'recurring',
      label: 'Будут ли списываться деньги автоматически?',
      children: (
        <p className="plans-faq__answer">
          Нет, автопродления нет. Вы оплачиваете один месяц Plus или Pro либо разовый пакет. Продлить подписку можно
          самостоятельно на странице «Тарифы»: новый месяц добавляется к оплаченному сроку, квота обновляется полностью.
        </p>
      ),
    },
    {
      key: 'refund',
      label: 'Как вернуть деньги, если сервис не подошёл?',
      children: (
        <p className="plans-faq__answer">
          Отправьте заявку на <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Возврат денежных средств потребителю
          осуществляется в течение 10 календарных дней в соответствии со ст. 32 Закона РФ «О защите прав потребителей».
          Подробный порядок — в <Link to="/legal#refund">Условиях возврата</Link>.
        </p>
      ),
    },
    {
      key: 'invoice',
      label: 'Можно ли оплатить по безналичному расчёту (по счёту для юрлиц)?',
      children: (
        <p className="plans-faq__answer">
          Да. Отправьте реквизиты организации, название команды и выбранный вариант на{' '}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Мы подготовим счёт и начислим тариф команде в течение
          одного рабочего дня после поступления оплаты.
        </p>
      ),
    },
  ];
  return (
    <section className="plans-page__faq">
      <h2 className="plans-page__section-title">Частые вопросы и сравнение</h2>
      <Collapse bordered={false} items={items} className="plans-faq__collapse" />
    </section>
  );
};

const PURCHASE_TITLE: Record<string, string> = {
  team_pack: 'Разовый пакет, 500 000 Токенов+',
  plus: 'Plus, 1 месяц',
  pro: 'Pro, 1 месяц',
};

/** The purchases of the team, each one apart (a repeated confirmation of one payment is still one row) */
export const TeamPaymentHistory = ({ organizationId }: { organizationId: string }) => {
  const [rows, setRows] = useState<{ id: string; items: TeamPaymentInfo[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTeamPayments(organizationId)
      .then((items) => {
        if (!cancelled) setRows({ id: organizationId, items });
      })
      .catch(() => {
        if (!cancelled) setRows({ id: organizationId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const items = rows && rows.id === organizationId ? rows.items : null;
  return (
    <section>
      <h2 className="plans-page__section-title">Покупки команды</h2>
      <Table<TeamPaymentInfo>
        rowKey="id"
        size="small"
        pagination={false}
        loading={items === null}
        dataSource={items ?? []}
        locale={{ emptyText: 'Покупок пока нет' }}
        columns={[
          { title: 'Дата', key: 'date', render: (_, row) => formatDay(row.paid_at ?? row.created_at) },
          { title: 'Что куплено', key: 'what', render: (_, row) => PURCHASE_TITLE[row.plan_code] ?? row.plan_code },
          { title: 'Сумма', key: 'amount', render: (_, row) => formatPrice(row.amount_kopecks) },
          {
            title: '',
            key: 'refund',
            render: (_, row) => (row.refunded_kopecks > 0 ? <Tag>Возврат {formatPrice(row.refunded_kopecks)}</Tag> : null),
          },
        ]}
      />
    </section>
  );
};
