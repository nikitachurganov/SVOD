import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Radio } from 'antd';
import { billingActionError, createPlanRequest, getPlans } from '../../shared/api/billing.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useNotifications } from '../../shared/context/notifications.context';
import type { PlanRequestTerm, PlansResponse } from '../../types/billing';
import { formatPrice, formatTokens } from './billingFormat';

interface FormValues {
  billing_interval: PlanRequestTerm;
  contact: string;
  comment?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The request is stored: the plan and the banner of the person should be read again */
  onSent: () => void;
}

/** Asking for the paid plan: payment is by invoice for now, an administrator turns the plan on after it */
export const PlanRequestModal = ({ open, onClose, onSent }: Props) => {
  const { profile } = useAuth();
  const { notifySuccess } = useNotifications();
  const [form] = Form.useForm<FormValues>();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    form.setFieldsValue({ billing_interval: 'month', contact: profile?.email ?? '', comment: '' });
    return () => {
      cancelled = true;
    };
  }, [open, form, profile?.email]);

  const researcher = plans?.plans.find((plan) => plan.code === 'researcher');

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    setError(null);
    try {
      await createPlanRequest({
        // The pack is a plan of its own, sold once; the subscription by the month or the year
        plan_code: values.billing_interval === 'one_off' ? 'pack' : 'researcher',
        billing_interval: values.billing_interval,
        contact: values.contact.trim(),
        comment: values.comment?.trim() || undefined,
      });
      notifySuccess('Заявка отправлена. Мы свяжемся с вами по указанному контакту.');
      onSent();
      onClose();
    } catch (err) {
      setError(billingActionError(err, 'Не удалось отправить заявку. Попробуйте ещё раз.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Подключить тариф"
      okText="Отправить заявку"
      cancelText="Отмена"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--app-text-secondary)' }}>
        Пока оплата по счёту. Оставьте контакт: мы напишем, пришлём реквизиты и включим тариф, как только
        придёт оплата.
      </p>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="billing_interval" label="Срок">
          <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Radio value="month">
              «Исследователь» на месяц{researcher ? ` — ${formatPrice(researcher.price_month_kopecks)}` : ''}
            </Radio>
            <Radio value="year">
              «Исследователь» на год{researcher ? ` — ${formatPrice(researcher.price_year_kopecks)}` : ''}
            </Radio>
            <Radio value="one_off">
              Разовый доступ «Исследование»
              {plans
                ? ` — ${formatPrice(plans.pack_price_kopecks)} на ${plans.pack_days} дней, ${formatTokens(plans.pack.limits.ai_tokens_per_period)} токенов ИИ, без продления`
                : ''}
            </Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="contact"
          label="Как с вами связаться"
          extra="Почта, телефон или ник в мессенджере."
          rules={[
            { required: true, whitespace: true, message: 'Укажите контакт' },
            { min: 3, message: 'Не менее 3 символов' },
            { max: 200, message: 'Не более 200 символов' },
          ]}
        >
          <Input maxLength={200} autoComplete="off" />
        </Form.Item>
        <Form.Item name="comment" label="Комментарий">
          <Input.TextArea rows={3} maxLength={1000} placeholder="Необязательно" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
