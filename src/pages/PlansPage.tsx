import { useEffect, useState } from 'react';
import { Alert, Button, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { PlanActions } from '../components/billing/PlanActions';
import {
  FEATURE_LABELS,
  LIMIT_ROWS,
  formatNumber,
  formatPrice,
} from '../components/billing/billingFormat';
import { getPlans } from '../shared/api/billing.api';
import { LEGAL } from '../shared/config/legal';
import { useAuth } from '../shared/hooks/auth.hooks';
import { useSubscription } from '../shared/hooks/subscription.hooks';
import { actionsWord } from '../shared/lib/aiQuota';
import type { PlanInfo, PlansResponse } from '../types/billing';
import '../components/billing/billing.css';

interface Row {
  key: string;
  label: string;
  start: string;
  researcher: string;
}

const yesNo = (value: boolean): string => (value ? 'Да' : 'Нет');

const buildRows = (start: PlanInfo, researcher: PlanInfo): Row[] => [
  ...LIMIT_ROWS.map(({ key, label }) => ({
    key,
    label,
    start: formatNumber(start.limits[key]),
    researcher: formatNumber(researcher.limits[key]),
  })),
  {
    key: 'methodologies',
    label: 'Методики опросов',
    start: start.features.includes('all_methodologies') ? 'Все' : '5 базовых',
    researcher: researcher.features.includes('all_methodologies') ? 'Все' : '5 базовых',
  },
  ...['crosstabs', 'csv_export', 'quality_filter'].map((feature) => ({
    key: feature,
    label: FEATURE_LABELS[feature],
    start: yesNo(start.features.includes(feature)),
    researcher: yesNo(researcher.features.includes(feature)),
  })),
];

const openSurveysWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'открытых опросов';
  if (rest10 === 1) return 'открытый опрос';
  if (rest10 >= 2 && rest10 <= 4) return 'открытых опроса';
  return 'открытых опросов';
};

const highlights = (plan: PlanInfo): string[] => [
  `${formatNumber(plan.limits.ai_actions_per_period)} ИИ-${actionsWord(plan.limits.ai_actions_per_period)} в месяц`,
  `${formatNumber(plan.limits.responses_per_period)} ответов в месяц`,
  `${plan.limits.max_active_surveys} ${openSurveysWord(plan.limits.max_active_surveys)}`,
  plan.features.includes('all_methodologies') ? 'Все методики опросов' : '5 базовых методик',
  ...plan.features.filter((feature) => feature !== 'all_methodologies').map((feature) => FEATURE_LABELS[feature]),
];

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
  if (!start || !researcher) {
    return (
      <div className="plans-page">
        <Alert type="info" showIcon title="Тарифы пока недоступны" />
      </div>
    );
  }

  const current = subscription?.billing_enabled ? subscription.plan.code : null;
  const columns: ColumnsType<Row> = [
    { title: '', dataIndex: 'label', key: 'label' },
    { title: start.title, dataIndex: 'start', key: 'start', width: 160 },
    { title: researcher.title, dataIndex: 'researcher', key: 'researcher', width: 160 },
  ];

  return (
    <div className="plans-page">
      <div>
        <h1 className="plans-page__title">Тарифы</h1>
        <p className="plans-page__lead">
          Начните бесплатно и подключите «Исследователя», когда вам станет тесно. Все опросы и ответы
          сохраняются при любом переходе между тарифами.
        </p>
      </div>

      <div className="plans-page__cards">
        <article className="plan-card">
          <div className="plan-card__head">
            <h2 className="plan-card__name">{start.title}</h2>
            {current === 'start' ? <Tag color="blue">Ваш тариф</Tag> : null}
          </div>
          <div className="plan-card__price">
            {formatPrice(0)} <small>навсегда</small>
          </div>
          <ul className="plan-card__list">
            {highlights(start).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>

        <article className="plan-card plan-card--accent">
          <div className="plan-card__head">
            <h2 className="plan-card__name">{researcher.title}</h2>
            {current === 'researcher' ? <Tag color="blue">Ваш тариф</Tag> : null}
          </div>
          <div className="plan-card__price">
            {formatPrice(researcher.price_month_kopecks)} <small>в месяц</small>
          </div>
          <ul className="plan-card__list">
            {highlights(researcher).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="plan-card__footer">
            <p className="billing-note" style={{ margin: 0 }}>
              Или {formatPrice(researcher.price_year_kopecks)} в год.
            </p>
            <PlanActions />
            {user ? null : (
              <Link to="/auth" state={{ from: '/plans' }}>
                <Button type="primary" block>
                  Войти и подключить
                </Button>
              </Link>
            )}
          </div>
        </article>

        <article className="plan-card">
          <div className="plan-card__head">
            <h2 className="plan-card__name">Пакет «Курсовая»</h2>
          </div>
          <div className="plan-card__price">
            {formatPrice(plans.course_pack_price_kopecks)} <small>за {plans.course_pack_days} дней</small>
          </div>
          <ul className="plan-card__list">
            <li>Все возможности «Исследователя»</li>
            <li>Без автопродления: заплатили один раз</li>
          </ul>
          <p className="billing-note" style={{ margin: 0 }}>
            Выберите «Пакет «Курсовая»» в заявке на подключение.
          </p>
        </article>
      </div>

      <section>
        <h2 className="plans-page__section-title">Что входит</h2>
        <div className="plans-page__table">
          <Table<Row>
            rowKey="key"
            columns={columns}
            dataSource={buildRows(start, researcher)}
            pagination={false}
            size="middle"
          />
        </div>
      </section>

      <section>
        <h2 className="plans-page__section-title">Как вы получите услугу</h2>
        <ul className="plans-page__terms">
          <li>
            Это цифровая услуга: доставки нет. Доступ открывается в вашем личном кабинете на {LEGAL.siteUrl}.
          </li>
          <li>
            После оплаты тариф «Исследователь» включается автоматически, обычно сразу. Если платили по счёту,
            включим в течение рабочего дня после поступления денег.
          </li>
          <li>
            Срок и остаток лимитов видны в разделе «Профиль» → «Подписка». Подписка не продлевается сама:
            перед окончанием срока мы напомним.
          </li>
          <li>Чек самозанятого придёт на вашу почту после оплаты.</li>
        </ul>
      </section>

      <section>
        <h2 className="plans-page__section-title">Оплата и возврат</h2>
        <ul className="plans-page__terms">
          <li>
            {plans.payments_enabled
              ? 'Оплата банковской картой или через СБП на странице ЮKassa.'
              : 'Оплата банковской картой или через СБП на странице ЮKassa, либо по счёту по заявке.'}
          </li>
          <li>
            Если оплаченная услуга не была оказана, вернём деньги по заявке на{' '}
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Подробные условия — в{' '}
            <Link to="/legal#offer">публичной оферте</Link>.
          </li>
        </ul>
      </section>

      <p className="billing-note">
        Оплачивая тариф, вы принимаете <Link to="/legal#offer">публичную оферту</Link>. Исполнитель: {LEGAL.fullName},
        ИНН {LEGAL.inn}. Все контакты — на странице <Link to="/legal#contacts">«Контакты и реквизиты»</Link>.
      </p>

      <p className="billing-note">
        {plans.payments_enabled
          ? 'Оплата проходит на странице платёжного сервиса ЮKassa, тариф включается сразу.'
          : 'Оплата пока по счёту: оставьте заявку, мы свяжемся, пришлём реквизиты и включим тариф после оплаты.'}{' '}
        {user ? (
          <>
            Текущее использование и срок — в разделе <Link to="/profile?tab=subscription">«Подписка»</Link>.
          </>
        ) : null}
      </p>
    </div>
  );
};
