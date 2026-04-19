import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
} from '@carbon/react';
import { assignRequestPerformer } from '../../shared/api/requests.api';
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
      onRequestClose={() => !submitting && onClose()}
      modalHeading="Передача задачи исполнителю"
      primaryButtonText={submitting ? 'Отправка…' : 'Подтвердить'}
      secondaryButtonText="Отмена"
      primaryButtonDisabled={submitting || !performer}
      onRequestSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {performer && (
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{performer.full_name}</strong>
            {performer.organization ? ` · ${performer.organization}` : ''}
          </p>
        )}

        {localError && (
          <InlineNotification
            kind="error"
            title="Ошибка"
            subtitle={localError}
            lowContrast
            hideCloseButton
          />
        )}

        <RadioButtonGroup
          legendText="Действие"
          name="assign-delivery"
          valueSelected={delivery}
          onChange={(v) =>
            setDelivery(String(v) === 'send_spec' ? 'send_spec' : 'status_only')
          }
        >
          <RadioButton labelText="Только сменить статус и закрепить исполнителя" value="status_only" id="assign-status" />
          <RadioButton labelText="Отправить ТЗ исполнителю" value="send_spec" id="assign-tz" />
        </RadioButtonGroup>

        {sendTz && (
          <>
            {!performer?.contact_available && (
              <InlineNotification
                kind="warning"
                title="Нет контакта"
                subtitle="Добавьте контакт у исполнителя или выберите другой способ передачи."
                lowContrast
                hideCloseButton
              />
            )}
            <Select
              id="contact-method"
              labelText="Способ связи"
              value={contactMethod}
              onChange={(e) => setContactMethod(e.target.value)}
            >
              {CONTACT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} text={o.label} />
              ))}
            </Select>
          </>
        )}
      </div>
    </Modal>
  );
}
