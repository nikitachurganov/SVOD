import { useEffect, useState } from 'react';
import { Form, Input, Modal, Select, Space } from 'antd';
import {
  createExternalContractor,
  updateExternalContractor,
} from '../../shared/api/organizations.api';
import { requiredRule } from '../../shared/utils/formRules';
import type { ExternalContractor, ExternalContractorPayload } from '../../types/organization';
import { CONTACT_KIND_LABELS } from './participants.utils';

const CONTACT_PLACEHOLDERS: Record<string, string> = {
  phone: '+7 900 000-00-00',
  email: 'name@company.ru',
  telegram: '@username',
  whatsapp: '+7 900 000-00-00',
  other: 'Как связаться',
};

interface Props {
  open: boolean;
  organizationId: string;
  /** null — create a new contractor */
  contractor: ExternalContractor | null;
  onClose: () => void;
  onSaved: (contractor: ExternalContractor) => void;
}

type FormValues = Required<Pick<ExternalContractorPayload, 'full_name'>> & {
  organization?: string;
  specialization?: string;
  position?: string;
  geography?: string;
  contact_kind?: string;
  contact_value?: string;
};

export const ContractorModal = ({ open, organizationId, contractor, onClose, onSaved }: Props) => {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contactKind = Form.useWatch('contact_kind', form) ?? 'phone';

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.setFieldsValue({
      full_name: contractor?.full_name ?? '',
      organization: contractor?.organization ?? undefined,
      specialization: contractor?.specialization ?? undefined,
      position: contractor?.position ?? undefined,
      geography: contractor?.geography ?? undefined,
      contact_kind: contractor?.contact_kind ?? 'phone',
      contact_value: contractor?.contact_value ?? undefined,
    });
  }, [open, contractor, form]);

  const handleFinish = async (values: FormValues) => {
    setSaving(true);
    setError(null);
    const payload: ExternalContractorPayload = {
      full_name: values.full_name.trim(),
      organization: values.organization?.trim() || null,
      specialization: values.specialization?.trim() || null,
      position: values.position?.trim() || null,
      geography: values.geography?.trim() || null,
      contact_kind: values.contact_value?.trim() ? values.contact_kind ?? 'phone' : null,
      contact_value: values.contact_value?.trim() || null,
    };
    try {
      const saved = contractor
        ? await updateExternalContractor(organizationId, contractor.id, payload)
        : await createExternalContractor(organizationId, payload);
      onSaved(saved);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Не удалось сохранить подрядчика');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={contractor ? 'Редактировать подрядчика' : 'Новый подрядчик'}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={() => !saving && onClose()}
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional" onFinish={(v) => void handleFinish(v)} style={{ paddingTop: 8 }}>
        <Form.Item name="full_name" label="ФИО" rules={[requiredRule('Введите ФИО'), { max: 500 }]}>
          <Input placeholder="Иванов Иван Иванович" />
        </Form.Item>
        <Form.Item name="organization" label="Компания" rules={[{ max: 500 }]}>
          <Input placeholder="ООО «Монтаж-Сервис» или ИП" />
        </Form.Item>
        <Form.Item
          name="specialization"
          label="Сфера деятельности"
          extra="Какие работы выполняет — учитывается при подборе исполнителей этапов"
        >
          <Input.TextArea placeholder="Например, монтаж наружной рекламы, печать" autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
          <Form.Item name="position" label="Должность" rules={[{ max: 300 }]}>
            <Input placeholder="Монтажник" />
          </Form.Item>
          <Form.Item name="geography" label="География" rules={[{ max: 300 }]}>
            <Input placeholder="Москва и область" />
          </Form.Item>
        </div>
        <Form.Item label="Контакт" style={{ marginBottom: 0 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="contact_kind" noStyle>
              <Select
                style={{ width: 140 }}
                options={Object.entries(CONTACT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item name="contact_value" noStyle rules={[{ max: 500 }]}>
              <Input placeholder={CONTACT_PLACEHOLDERS[contactKind] ?? ''} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        {error ? <div style={{ color: 'var(--app-text-error)', marginTop: 12 }}>{error}</div> : null}
      </Form>
    </Modal>
  );
};
