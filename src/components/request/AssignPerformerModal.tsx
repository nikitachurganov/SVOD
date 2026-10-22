import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Alert, Modal, Select, Tag } from 'antd';
import { assignRequestPerformer } from '../../shared/api/requests.api';
import type { RecommendedPerformerDTO } from '../../types/performerSelection';

export type AssignPerformerModalProps = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  /** When set, POST …/stages/{id}/assign instead of legacy /assign */
  stageId?: string | null;
  performer: RecommendedPerformerDTO | null;
  /** Top recommendations (shown first) */
  performers?: RecommendedPerformerDTO[];
  /** Everyone assignable: members and external contractors */
  allPerformers?: RecommendedPerformerDTO[];
  recommendedPerformerId: string | null;
  onSuccess: () => Promise<void>;
};

export function AssignPerformerModal({
  open,
  onClose,
  requestId,
  stageId,
  performer,
  performers,
  allPerformers,
  recommendedPerformerId,
  onSuccess,
}: AssignPerformerModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(performer?.id ?? null);
  const everyone = useMemo(() => {
    const byId = new Map<string, RecommendedPerformerDTO>();
    [...(performers ?? []), ...(allPerformers ?? [])].forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
    return byId;
  }, [performers, allPerformers]);
  const selectedPerformer = (selectedId ? everyone.get(selectedId) : undefined) ?? performer;

  // Recommendations first, then everyone else grouped by kind
  const selectOptions = useMemo(() => {
    const recommendedIds = new Set((performers ?? []).map((item) => item.id));
    const rest = (allPerformers ?? []).filter((item) => !recommendedIds.has(item.id));
    const byName = (a: RecommendedPerformerDTO, b: RecommendedPerformerDTO) =>
      a.full_name.localeCompare(b.full_name, 'ru');
    const toOption = (item: RecommendedPerformerDTO, withScore: boolean) => ({
      value: item.id,
      label: [item.full_name, item.position, withScore ? `${item.score}%` : null].filter(Boolean).join(' · '),
    });
    const groups = [
      { label: 'Рекомендуемые', options: (performers ?? []).map((item) => toOption(item, true)) },
      {
        label: 'Участники организации',
        options: rest.filter((item) => item.is_internal).sort(byName).map((item) => toOption(item, false)),
      },
      {
        label: 'Подрядчики',
        options: rest.filter((item) => !item.is_internal).sort(byName).map((item) => toOption(item, false)),
      },
    ];
    return groups.filter((group) => group.options.length > 0);
  }, [performers, allPerformers]);

  useEffect(() => {
    if (open) {
      setLocalError(null);
      setSubmitting(false);
      setSelectedId(performer?.id ?? performers?.[0]?.id ?? null);
    }
  }, [open, performer?.id, performers]);

  const handleSubmit = async () => {
    if (!selectedPerformer) return;
    setLocalError(null);

    setSubmitting(true);
    try {
      await assignRequestPerformer(
        requestId,
        {
          performer_id: selectedPerformer.id,
          send_tz: false,
          contact_method: 'auto',
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
      title="Назначить исполнителя"
      okText={submitting ? 'Сохранение…' : 'Назначить'}
      cancelText="Отмена"
      okButtonProps={{ disabled: submitting || !selectedPerformer, loading: submitting }}
      onOk={() => void handleSubmit()}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {selectOptions.length > 0 ? (
          <Select
            value={selectedId ?? undefined}
            onChange={setSelectedId}
            options={selectOptions}
            showSearch
            optionFilterProp="label"
            placeholder="Выберите исполнителя"
            style={{ width: '100%' }}
            aria-label="Исполнитель"
          />
        ) : null}
        {selectedPerformer && (
          <p style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <strong>{selectedPerformer.full_name}</strong>
            {selectedPerformer.organization ? <span>· {selectedPerformer.organization}</span> : null}
            {!selectedPerformer.is_internal ? <Tag color="gold">Подрядчик</Tag> : null}
          </p>
        )}
        {selectedPerformer && !selectedPerformer.is_internal ? (
          <Alert
            type="info"
            showIcon
            message="Подрядчик не входит в сервис"
            description="Команда увидит, что этап у подрядчика, и его контакт. Отметить этап выполненным может ответственный за заявку."
          />
        ) : null}

        {localError && (
          <Alert type="error" message="Ошибка" description={localError} showIcon closable={false} />
        )}
      </div>
    </Modal>
  );
}
