import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Skeleton, Table } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { CollapseProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { PlanActions } from '../components/billing/PlanActions';
import {
  FEATURE_LABELS,
  collectsWithoutLimits,
  formatNumber,
  formatPrice,
} from '../components/billing/billingFormat';
import { getPlans } from '../shared/api/billing.api';
import { LEGAL } from '../shared/config/legal';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useSubscription } from '../shared/hooks/subscription.hooks';
import type { PlanInfo, PlansResponse } from '../types/billing';
import '../components/billing/billing.css';

interface Row {
  key: string;
  label: string;
  start: string;
  pack: string;
  researcher: string;
}

const yesNo = (value: boolean): string => (value ? 'Да' : 'Нет');

const buildRows = (start: PlanInfo, pack: PlanInfo, researcher: PlanInfo, packDays: number): Row[] => {
  const cells = (pick: (plan: PlanInfo) => string) => ({
    start: pick(start),
    pack: pick(pack),
    researcher: pick(researcher),
  });
  return [
    {
      key: 'ai_tokens',
      label: 'Токены ИИ',
      ...cells((plan) => formatNumber(plan.limits.ai_tokens_per_period)),
    },
    {
      key: 'ai_window',
      label: 'Как выдаются токены',
      start: 'Один раз при регистрации',
      pack: `На ${packDays} дней, потом сгорают`,
      researcher: 'Обновляются каждый месяц',
    },
    {
      key: 'collecting',
      label: 'Опросы, проекты и ответы',
      ...cells((plan) => (collectsWithoutLimits(plan.limits) ? 'Без ограничений' : 'По лимитам тарифа')),
    },
    {
      key: 'methodologies',
      label: 'Методики опросов',
      ...cells((plan) => (plan.features.includes('all_methodologies') ? 'Все' : '5 базовых')),
    },
    ...['csv_export', 'quality_filter', 'crosstabs'].map((feature) => ({
      key: feature,
      label: FEATURE_LABELS[feature],
      ...cells((plan) => yesNo(plan.features.includes(feature))),
    })),
  ];
};

/** What the plan adds to the one before it: the card says «everything from X, plus» and lists only these */
const extraLines = (base: PlanInfo, plan: PlanInfo): string[] =>
  plan.features
    .filter((feature) => !base.features.includes(feature))
    .map((feature) => FEATURE_LABELS[feature]);

const methodologyLine = (plan: PlanInfo): string =>
  plan.features.includes('all_methodologies') ? 'Все методики опросов' : '5 базовых методик';

/** The AI allowance is what the plans differ in, so it stands under the price in every card */
const TokensRow = ({ amount, when, hint }: { amount: number; when: string; hint: string }) => (
  <div className="plan-card__tokens">
    <ThunderboltOutlined className="plan-card__tokens-icon" aria-hidden />
    <div>
      <div className="plan-card__tokens-amount">
        {formatNumber(amount)} <span>токенов ИИ {when}</span>
      </div>
      <p className="plan-card__tokens-hint">{hint}</p>
    </div>
  </div>
);

/**
 * The plans side by side; what is not in the catalogue is not promised here.
 * Also the public price list (`/pricing`), which the payment provider checks before connecting payments.
 */
export const PlansPage = () => {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="plans-page">
        <Alert type="error" showIcon title="Не удалось загрузить тарифы" description="Обновите страницу." />
      </div>
    );
  }
  if (!plans) {
    return (
      <div className="plans-page">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  const start = plans.plans.find((plan) => plan.code === 'start');
  const researcher = plans.plans.find((plan) => plan.code === 'researcher');
  const pack = plans.pack;
  if (!start || !researcher || !pack) {
    return (
      <div className="plans-page">
        <Alert type="info" showIcon title="Тарифы пока недоступны" />
      </div>
    );
  }

  const current = subscription?.billing_enabled ? subscription.plan.code : null;
  const cardClass = (code: string, featured = false): string =>
    ['plan-card', featured ? 'plan-card--featured' : '', current === code ? 'plan-card--current' : '']
      .filter(Boolean)
      .join(' ');
  const columns: ColumnsType<Row> = [
    { title: '', dataIndex: 'label', key: 'label' },
    { title: start.title, dataIndex: 'start', key: 'start', width: 180 },
    { title: pack.title, dataIndex: 'pack', key: 'pack', width: 180 },
    { title: researcher.title, dataIndex: 'researcher', key: 'researcher', width: 180 },
  ];

  const faqItems: CollapseProps['items'] = [
    {
      key: 'comparison',
      label: 'Подробное сравнение: что входит в каждый тариф (таблица)',
      children: (
        <div className="plans-page__table" style={{ marginTop: 8 }}>
          <Table<Row>
            rowKey="key"
            columns={columns}
            dataSource={buildRows(start, pack, researcher, plans.pack_days)}
            pagination={false}
            size="middle"
          />
        </div>
      ),
    },
    {
      key: 'activation',
      label: 'Как и когда активируется доступ после оплаты?',
      children: (
        <p className="plans-faq__answer">
          Сервис {LEGAL.serviceName} — это цифровая облачная платформа, доставка физических носителей не осуществляется.
          Доступ к оплаченному тарифу открывается в вашем личном кабинете на{' '}
          <a href={LEGAL.siteUrl} target="_blank" rel="noreferrer">
            {LEGAL.siteUrl.replace(/^https?:\/\//, '')}
          </a>{' '}
          автоматически сразу после успешного проведения платежа. При оплате по счёту доступ активируется в течение одного
          рабочего дня с момента поступления средств.
        </p>
      ),
    },
    {
      key: 'payment-methods',
      label: 'Безопасна ли оплата и получу ли я чек?',
      children: (
        <p className="plans-faq__answer">
          Оплата проходит на защищённой странице платёжного сервиса ЮKassa. К оплате принимаются банковские карты
          (МИР, Visa, Mastercard) и Система быстрых платежей (СБП). Платёжные данные защищены по международному
          стандарту PCI DSS. Сразу после списания официальный электронный чек самозанятого (по Федеральному закону
          № 422-ФЗ) поступит на вашу электронную почту.
        </p>
      ),
    },
    {
      key: 'recurring',
      label: 'Будут ли списываться деньги автоматически?',
      children: (
        <p className="plans-faq__answer">
          Нет, автопродления и скрытых списаний нет. Вы оплачиваете только выбранный период (1 месяц, 1 год
          или разовый доступ «Исследование»). Перед окончанием оплаченного срока мы заранее пришлём напоминание на email,
          и при желании вы сможете продлить тариф самостоятельно.
        </p>
      ),
    },
    {
      key: 'refund',
      label: 'Как вернуть деньги, если сервис не подошёл?',
      children: (
        <p className="plans-faq__answer">
          Если оплаченная услуга не была оказана или вы решили отказаться от подписки, отправьте заявку на{' '}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Возврат денежных средств потребителю осуществляется в
          течение 10 календарных дней в соответствии со ст. 32 Закона РФ «О защите прав потребителей». Подробный порядок —
          в <Link to="/legal#refund">Условиях возврата</Link>.
        </p>
      ),
    },
    {
      key: 'invoice',
      label: 'Можно ли оплатить по безналичному расчёту (по счёту для юрлиц)?',
      children: (
        <p className="plans-faq__answer">
          Да, мы работаем с юридическими лицами и ИП. Отправьте реквизиты вашей организации и название выбранного тарифа
          на <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Мы подготовим счёт и активируем доступ в течение одного
          рабочего дня после поступления оплаты.
        </p>
      ),
    },
  ];

  return (
    <div className="plans-page">
      <div>
        <h1 className="plans-page__title">Тарифы</h1>
        {user ? (
          <p className="plans-page__lead">
            Текущий тариф и остаток токенов доступны в разделе{' '}
            <Link to="/profile?tab=subscription">«Подписка»</Link>.
          </p>
        ) : null}
      </div>

      <div className="plans-page__cards">
        <article className={cardClass('start')}>
          <div className="plan-card__head">
            <div className="plan-card__title-row">
              <h2 className="plan-card__name">{start.title}</h2>
              {current === 'start' ? <span className="plan-card__badge">Ваш тариф</span> : null}
            </div>
            <p className="plan-card__tagline">Попробовать сервис и собрать первые ответы</p>
          </div>
          <div className="plan-card__price">
            <span className="plan-card__amount">0 ₽</span>
            <span className="plan-card__period">навсегда</span>
          </div>
          <TokensRow
            amount={start.limits.ai_tokens_per_period}
            when="один раз при регистрации"
            hint="Чтобы попробовать ИИ-конструктор и резюме"
          />
          <div className="plan-card__cta">
            {!user ? (
              <Link to="/auth" state={{ from: '/plans' }}>
                <Button block>Начать бесплатно</Button>
              </Link>
            ) : (
              <Button block disabled>
                {current === 'start' ? 'Ваш текущий тариф' : 'Бесплатно навсегда'}
              </Button>
            )}
          </div>
          <div className="plan-card__features">
            <p className="plan-card__features-title">Что входит:</p>
            <ul className="plan-card__list">
              <li>Опросы и ответы без ограничений</li>
              <li>{methodologyLine(start)}</li>
              <li>Базовые графики и таблицы</li>
            </ul>
          </div>
        </article>

        <article className={cardClass('pack')}>
          <div className="plan-card__head">
            <div className="plan-card__title-row">
              <h2 className="plan-card__name">{pack.title}</h2>
              {current === 'pack' ? <span className="plan-card__badge">Ваш тариф</span> : null}
            </div>
            <p className="plan-card__tagline">Одно исследование под ключ, без подписки</p>
          </div>
          <div className="plan-card__price">
            <span className="plan-card__amount">{formatPrice(plans.pack_price_kopecks)}</span>
            <span className="plan-card__period">разово, на {plans.pack_days} дней</span>
          </div>
          <TokensRow
            amount={pack.limits.ai_tokens_per_period}
            when={`на ${plans.pack_days} дней`}
            hint="Хватит примерно на 15–20 полных исследований с глубоким чатом"
          />
          <div className="plan-card__cta">
            {user ? (
              <PlanActions offer="pack" />
            ) : (
              <Link to="/auth" state={{ from: '/plans' }}>
                <Button block>Войти и купить</Button>
              </Link>
            )}
          </div>
          <div className="plan-card__features">
            <p className="plan-card__features-title">Всё из «{start.title}», плюс:</p>
            <ul className="plan-card__list">
              {extraLines(start, pack).map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>Без автопродления: заплатили один раз</li>
            </ul>
          </div>
        </article>

        <article className={cardClass('researcher', true)}>
          {current === 'researcher' ? null : <span className="plan-card__ribbon">Выгоднее всего</span>}
          <div className="plan-card__head">
            <div className="plan-card__title-row">
              <h2 className="plan-card__name">{researcher.title}</h2>
              {current === 'researcher' ? <span className="plan-card__badge">Ваш тариф</span> : null}
            </div>
            <p className="plan-card__tagline">Для тех, кто исследует постоянно</p>
          </div>
          <div className="plan-card__price">
            <span className="plan-card__amount">{formatPrice(researcher.price_month_kopecks)}</span>
            <span className="plan-card__period">в месяц</span>
            <span className="plan-card__price-note">
              или {formatPrice(researcher.price_year_kopecks)} в год — на четверть дешевле
            </span>
          </div>
          <TokensRow
            amount={researcher.limits.ai_tokens_per_period}
            when="каждый месяц"
            hint="Больше чем на 50 глубоких исследований в месяц"
          />
          <div className="plan-card__cta">
            {user ? (
              <PlanActions />
            ) : (
              <Link to="/auth" state={{ from: '/plans' }}>
                <Button type="primary" block>
                  Войти и подключить
                </Button>
              </Link>
            )}
          </div>
          <div className="plan-card__features">
            <p className="plan-card__features-title">Всё из «{pack.title}», плюс:</p>
            <ul className="plan-card__list">
              {extraLines(pack, researcher).map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>Токены обновляются каждый месяц</li>
            </ul>
          </div>
        </article>
      </div>

      <section className="plans-page__faq">
        <h2 className="plans-page__section-title">Частые вопросы и сравнение тарифов</h2>
        <Collapse
          bordered={false}
          items={faqItems}
          className="plans-faq__collapse"
        />
      </section>

      <div className="plans-legal-footer">
        <p className="plans-legal-footer__note">
          Оплачивая тариф, вы принимаете <Link to="/legal#offer">публичную оферту</Link>. Исполнитель:{' '}
          {LEGAL.fullName}, ИНН {LEGAL.inn}, статус: {LEGAL.taxStatus}.
        </p>
        <nav className="plans-legal-footer__links">
          <Link to="/legal#refund">Условия возврата</Link>
          <span className="plans-legal-footer__sep">•</span>
          <Link to="/legal#contacts">Контакты и реквизиты</Link>
          <span className="plans-legal-footer__sep">•</span>
          <Link to="/legal#privacy">Политика конфиденциальности</Link>
          <span className="plans-legal-footer__sep">•</span>
          <Link to="/legal#terms">Пользовательское соглашение</Link>
        </nav>
      </div>
    </div>
  );
};
