import { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert, Modal, Radio, Select } from 'antd';
import { assignRequestPerformer } from '../../shared/api/requests.api';
import { featureFlags } from '../../shared/config/featureFlags';
import type { RecommendedPerformerDTO } from '../../types/performerSelection';

export type AssignPerformerModalProps = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  /** When set, POST …/stages/{id}/assign instead of legacy /assign */
  stageId?: string | null;
  performer: RecommendedPerformerDTO | null;
  recommendedPerformerId: string | null;
  onSuccess: () => Promise<void>;
};

const CONTACT_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Авто (email или телефон)' },
  { value: 'email', label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'phone', label: 'Телефон' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export function AssignPerformerModal({
  open,
  onClose,
  requestId,
  stageId,
  performer,
  recommendedPerformerId,
  onSuccess,
}: AssignPerformerModalProps) {
  const tzEnabled = featureFlags.tzGeneration;
  const [delivery, setDelivery] = useState<'status_only' | 'send_spec'>('status_only');
  const [contactMethod, setContactMethod] = useState('auto');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDelivery('status_only');
      setContactMethod('auto');
      setLocalError(null);
      setSubmitting(false);
    }
  }, [open, performer?.id]);

  const sendTz = delivery === 'send_spec';

  const handleSubmit = async () => {
    if (!performer) return;
    setLocalError(null);

    if (sendTz && !performer.contact_available) {
      setLocalError('У выбранного исполнителя нет контактных данных для отправки ТЗ.');
      return;
    }

    setSubmitting(true);
    try {
      await assignRequestPerformer(
        requestId,
        {
          performer_id: performer.id,
          send_tz: sendTz,
          contact_method: contactMethod,
          recommended_performer_id: recommendedPerformerId,
        },
        stageId ? { stageId } : undefined,
      );
      await onSuccess();
      onClose();
    } catch (e: unknown) {
      let msg: string | undefined;
      if (axios.isAxiosError(e)) {
        const d = e.response?.data?.detail;
        if (typeof d === 'string') msg = d;
        else if (Array.isArray(d)) msg = d.map((x) => JSON.stringify(x)).join('; ');
      }
      setLocalError(msg ?? 'Не удалось передать задачу.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => !submitting && onClose()}
      title="Передача задачи исполнителю"
      okText={submitting ? 'Отправка…' : 'Подтвердить'}
      cancelText="Отмена"
      okButtonProps={{ disabled: submitting || !performer, loading: submitting }}
      onOk={() => void handleSubmit()}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {performer && (
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{performer.full_name}</strong>
            {performer.organization ? ` · ${performer.organization}` : ''}
          </p>
        )}

        {localError && (
          <Alert type="error" message="Ошибка" description={localError} showIcon closable={false} />
        )}

        <div>
          <span style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Действие</span>
          <Radio.Group
            value={delivery}
            onChange={(e) =>
              setDelivery(e.target.value === 'send_spec' ? 'send_spec' : 'status_only')
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Radio value="status_only">Только сменить статус и закрепить исполнителя</Radio>
              {tzEnabled && <Radio value="send_spec">Отправить ТЗ исполнителю</Radio>}
            </div>
          </Radio.Group>
        </div>

        {tzEnabled && sendTz && (
          <>
            {!performer?.contact_available && (
              <Alert
                type="warning"
                message="Нет контакта"
                description="Добавьте контакт у исполнителя или выберите другой способ передачи."
                showIcon
                closable={false}
              />
            )}
            <div>
              <span style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Способ связи</span>
              <Select
                id="contact-method"
                value={contactMethod}
                onChange={setContactMethod}
                options={CONTACT_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
