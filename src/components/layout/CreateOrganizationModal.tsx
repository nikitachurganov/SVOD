import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Steps } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { organizationNameRules } from '../../shared/utils/formRules';
import { getPlans } from '../../shared/api/billing.api';
import type { PlanRequestTerm, PlansResponse } from '../../types/billing';
import { PlanActions } from '../billing/PlanActions';
import { SeatStepper, TermSwitch } from '../billing/SeatConfigurator';
import { DEFAULT_SEATS, seatsWord, useQuote, yearSavingText } from '../billing/seatPricing';
import { FEATURE_LABELS, formatCreditsWithWord, formatPrice } from '../billing/billingFormat';
import '../billing/billing.css';

const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface CreateOrgFormValues {
  name: string;
  description?: string;
}

type Step = 'team' | 'plan';

/**
 * Creating a team is free and always the first step. Where online payment is on, a second step offers
 * the plan for the new team (seats, term, trial or payment); it can be skipped and done later.
 */
export const CreateOrganizationModal = ({ open, onClose }: Props) => {
  const { createOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('team');
  const [createdName, setCreatedName] = useState('');
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [term, setTerm] = useState<Exclude<PlanRequestTerm, 'one_off'>>('month');
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [form] = Form.useForm<CreateOrgFormValues>();

  // Whether there is a plan step at all is known by the time the first step is filled in
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const seatMode = Boolean(plans?.seat_pricing_enabled);
  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');
  const free = plans?.plans.find((plan) => plan.code === 'start');
  // A person who already pays for the researcher plan has nothing to choose
  const alreadyPaid =
    subscription?.plan.code === 'researcher' && subscription.status === 'active' && !subscription.trial_ends_at;
  const hasPlanStep = Boolean(plans?.payments_enabled && researcher && !alreadyPaid);

  const teamSeats = seatMode ? seats : 1;
  const quote = useQuote(term, seats, seatMode && step === 'plan');
  const price = !researcher
    ? ''
    : seatMode
      ? quote.quote
        ? formatPrice(quote.quote.total_kopecks)
        : quote.failed
          ? 'цена недоступна'
          : '…'
      : formatPrice(term === 'month' ? researcher.price_month_kopecks : researcher.price_year_kopecks);
  const saving = seatMode ? yearSavingText(term === 'year' ? quote.quote : null) : null;

  const reset = () => {
    form.resetFields();
    setStep('team');
    setCreatedName('');
    setTerm('month');
    setSeats(DEFAULT_SEATS);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (values: CreateOrgFormValues) => {
    setLoading(true);
    try {
      const name = values.name.trim();
      await createOrganization({ name, description: values.description?.trim() || null });
      if (hasPlanStep) {
        setCreatedName(name);
        setStep('plan');
      } else {
        close();
      }
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={step === 'team' ? 'Создать команду' : `Команда «${createdName}» создана`}
      okText={loading ? 'Создание…' : hasPlanStep ? 'Создать и выбрать тариф' : 'Создать'}
      cancelText="Отмена"
      confirmLoading={loading}
      width={step === 'plan' ? 560 : 520}
      footer={step === 'plan' ? null : undefined}
      closable={step === 'team'}
      mask={{ closable: step === 'team' }}
      onCancel={step === 'team' ? close : undefined}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      {hasPlanStep ? (
        <Steps
          size="small"
          current={step === 'team' ? 0 : 1}
          items={[{ title: 'Команда' }, { title: 'Тариф' }]}
          style={{ margin: '8px 0 20px' }}
        />
      ) : null}

      {step === 'team' ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
          style={{ paddingTop: hasPlanStep ? 0 : 8 }}
        >
          <Form.Item name="name" label="Название" rules={organizationNameRules()}>
            <Input placeholder="Название команды" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <TextArea placeholder="Описание (необязательно)" maxLength={1000} showCount rows={3} />
          </Form.Item>
          {hasPlanStep ? (
            <p className="billing-note" style={{ margin: 0 }}>
              Создание команды бесплатное. На следующем шаге можно выбрать тариф или остаться на бесплатном.
            </p>
          ) : null}
        </Form>
      ) : researcher ? (
        <div className="team-plans">
          <section className="team-plan">
            <h3 className="team-plan__title">Старт</h3>
            <div className="team-plan__price">Бесплатно</div>
            <ul className="team-plan__list">
              <li><CheckOutlined /> 1 место: вы сами</li>
              {free ? (
                <li><CheckOutlined /> {formatCreditsWithWord(free.limits.ai_tokens_per_period)} ИИ</li>
              ) : null}
              <li><CheckOutlined /> Читатели без оплаты</li>
            </ul>
            <Button block onClick={close}>
              Начать бесплатно
            </Button>
          </section>

          <section className="team-plan team-plan--accent">
            <h3 className="team-plan__title">Исследователь</h3>
            <div className="team-plan__price">
              {price}
              <span className="team-plan__period"> {term === 'month' ? 'в месяц' : 'в год'}</span>
            </div>
            <div className="team-plan__controls">
              <TermSwitch value={term} onChange={setTerm} />
              {seatMode && plans ? (
                <div className="seat-config" style={{ margin: 0, flexBasis: 'auto' }}>
                  <SeatStepper value={seats} onChange={setSeats} max={plans.max_seats} />
                  <span className="seat-config__label">{seatsWord(seats)}</span>
                </div>
              ) : null}
            </div>
            {saving ? <div className="team-plan__saving">{saving}</div> : null}
            <ul className="team-plan__list">
              <li>
                <CheckOutlined /> {formatCreditsWithWord(researcher.limits.ai_tokens_per_period * teamSeats)} ИИ в месяц
              </li>
              {researcher.features
                .filter((key) => FEATURE_LABELS[key])
                .slice(0, 3)
                .map((key) => (
                  <li key={key}><CheckOutlined /> {FEATURE_LABELS[key]}</li>
                ))}
            </ul>
            <PlanActions seats={seatMode ? seats : undefined} term={term} />
          </section>
        </div>
      ) : null}

      {step === 'plan' ? (
        <div className="team-plans__skip">
          <Button type="text" onClick={close}>
            Решу позже
          </Button>
        </div>
      ) : null}
    </Modal>
  );
};
