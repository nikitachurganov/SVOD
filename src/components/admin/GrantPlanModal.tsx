import { useEffect, useState } from 'react';
import { Collapse, Form, Input, InputNumber, Modal, message } from 'antd';
import { adminErrorText, grantAdminPlan } from '../../shared/api/admin.api';
import type { AdminLimits, AdminUserDetail, LimitOverrides } from '../../types/admin';
import { LIMIT_LABELS } from './adminLabels';

interface FormValues {
  days: number;
  note?: string;
  limits?: Partial<Record<keyof AdminLimits, number | null>>;
}

const LIMIT_KEYS = Object.keys(LIMIT_LABELS) as (keyof AdminLimits)[];

interface Props {
  open: boolean;
  userId: string;
  /** The personal limits that are set now: the form starts from them */
  overrides: LimitOverrides | null;
  onClose: () => void;
  onGranted: (detail: AdminUserDetail) => void;
}

export const GrantPlanModal = ({ open, userId, overrides, onClose, onGranted }: Props) => {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.setFieldsValue({ days: 30, note: '', limits: { ...(overrides ?? {}) } });
  }, [open, overrides, form]);

  const submit = async () => {
    const values = await form.validateFields();
    // The limits in the form are the person's personal limits: an empty field means "as in the plan"
    const limits: LimitOverrides = {};
    for (const key of LIMIT_KEYS) {
      const value = values.limits?.[key];
      if (typeof value === 'number') limits[key] = value;
    }
    setSaving(true);
    try {
      const detail = await grantAdminPlan(userId, {
        plan: 'researcher',
        days: values.days,
        note: values.note?.trim() || undefined,
        limit_overrides: limits,
      });
      message.success('Тариф «Исследователь» выдан');
      onGranted(detail);
    } catch (err) {
      message.error(adminErrorText(err, 'Не удалось выдать тариф'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Выдать тариф «Исследователь»"
      okText="Выдать"
      cancelText="Отмена"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="days"
          label="Срок, дней"
          extra="Если тариф уже действует, срок добавится к текущему."
          rules={[{ required: true, message: 'Укажите срок' }]}
        >
          <InputNumber min={1} max={3650} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Заметка в журнале">
          <Input.TextArea rows={2} maxLength={500} placeholder="Например: оплата по счёту №12" />
        </Form.Item>
        <Collapse
          size="small"
          items={[
            {
              key: 'limits',
              label: 'Личные лимиты',
              children: (
                <>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    Пустое поле — как в тарифе. Заполненные значения заменят лимиты тарифа для
                    этого человека; сохранённые ранее личные лимиты заменяются теми, что здесь.
                  </p>
                  {LIMIT_KEYS.map((key) => (
                    <Form.Item key={key} name={['limits', key]} label={LIMIT_LABELS[key]}>
                      <InputNumber
                        min={0}
                        precision={0}
                        style={{ width: '100%' }}
                        placeholder="как в тарифе"
                      />
                    </Form.Item>
                  ))}
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
};
