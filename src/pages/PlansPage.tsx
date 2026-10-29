import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Skeleton, Table, Tag } from 'antd';
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

const featureLines = (plan: PlanInfo): string[] =>
  plan.features
    .filter((feature) => feature !== 'all_methodologies')
    .map((feature) => FEATURE_LABELS[feature]);

const methodologyLine = (plan: PlanInfo): string =>
  plan.features.includes('all_methodologies') ? 'Все методики опросов' : '5 базовых методик';

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
        <article className="plan-card">
          <div className="plan-card__head">
            <h2 className="plan-card__name">{start.title}</h2>
            {current === 'start' ? <Tag color="blue">Ваш тариф</Tag> : null}
          </div>
          <div className="plan-card__price">
            0 ₽ <small>навсегда</small>
          </div>
          <ul className="plan-card__list">
            <li>{formatNumber(start.limits.ai_tokens_per_period)} токенов ИИ в подарок на старте</li>
            <li>Опросы и ответы без ограничений</li>
            <li>{methodologyLine(start)}</li>
            <li>Базовые графики и таблицы</li>
          </ul>
        </article>

        <article className="plan-card">
          <div className="plan-card__head">
            <h2 className="plan-card__name">{pack.title}</h2>
            {current === 'pack' ? <Tag color="blue">Ваш тариф</Tag> : null}
          </div>
          <div className="plan-card__price">
            {formatPrice(plans.pack_price_kopecks)} <small>разово, {plans.pack_days} дней</small>
          </div>
          <ul className="plan-card__list">
            <li>{formatNumber(pack.limits.ai_tokens_per_period)} токенов ИИ на весь срок</li>
            <li>Хватит примерно на 15–20 полных исследований с глубоким чатом</li>
            <li>Опросы и ответы без ограничений</li>
            <li>{methodologyLine(pack)}</li>
            {featureLines(pack).map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Без автопродления: заплатили один раз</li>
          </ul>
          <p className="billing-note" style={{ margin: 0, marginTop: 'auto' }}>
            Выберите «Разовый доступ» в окне оплаты или в заявке на подключение.
          </p>
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
            <li>{formatNumber(researcher.limits.ai_tokens_per_period)} токенов ИИ каждый месяц</li>
            <li>Хватит больше чем на 50 глубоких исследований в месяц</li>
            <li>Опросы и ответы без ограничений</li>
            <li>{methodologyLine(researcher)}</li>
            {featureLines(researcher).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="plan-card__footer">
            <p className="billing-note" style={{ margin: 0 }}>
              Или {formatPrice(researcher.price_year_kopecks)} в год: на четверть дешевле.
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
