import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Modal, Space, Tag } from 'antd';
import {
  ApartmentOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { AIStagePlan, AIStagePlanItem } from '../../../types/request';
import {
  applyRequestStagePlan,
  getAIJob,
  suggestRequestStagePlan,
} from '../../../shared/api/requests.api';

type Props = {
  requestId: string;
  plan?: AIStagePlan | null;
  canManage: boolean;
  onUpdated: () => Promise<void>;
  /** Render as a section inside another card (right panel) with a compact, collapsible list */
  embedded?: boolean;
};

const COLLAPSED_ITEMS = 4;

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const POLL_INTERVAL_MS = 2500;
/** A queued job may wait behind other AI work, so keep polling for up to 5 minutes */
const POLL_ATTEMPTS = 120;

export function AiStagePlanAssistant({ requestId, plan, canManage, onUpdated, embedded = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftStages, setDraftStages] = useState<AIStagePlanItem[]>(plan?.stages ?? []);

  useEffect(() => {
    setDraftStages(plan?.stages ?? []);
  }, [plan]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setProgressText('Ставлю задачу ИИ…');
    try {
      const created = await suggestRequestStagePlan(requestId);
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await wait(POLL_INTERVAL_MS);
        const job = await getAIJob(created.id);
        if (job.status === 'succeeded') {
          await onUpdated();
          return;
        }
        if (job.status === 'failed') {
          throw new Error('ИИ не смог подготовить план. Попробуйте ещё раз или добавьте этапы вручную.');
        }
        setProgressText(
          job.status === 'running'
            ? 'ИИ составляет план этапов…'
            : 'Задача в очереди — ИИ сейчас занят другими заявками…',
        );
      }
      throw new Error('План ещё формируется. Обновите страницу через пару минут.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подготовить план');
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  };

  const apply = async (stages = draftStages) => {
    if (!stages.length || stages.some((stage) => !stage.title.trim())) {
      setError('У каждого этапа должно быть название.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await applyRequestStagePlan(requestId, stages);
      setEditorOpen(false);
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось применить план');
    } finally {
      setBusy(false);
    }
  };

  const patchStage = (index: number, patch: Partial<AIStagePlanItem>) => {
    setDraftStages((current) =>
      current.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
    );
  };

  const moveStage = (index: number, offset: -1 | 1) => {
    setDraftStages((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  if (!canManage && !plan) return null;

  const stages = plan?.stages ?? [];
  const visibleStages = embedded && !expanded ? stages.slice(0, COLLAPSED_ITEMS) : stages;
  const hiddenCount = stages.length - visibleStages.length;

  const body = (
    <>
      <div className="request-ai-plan-card__heading">
        <ApartmentOutlined aria-hidden />
        <strong>{embedded ? 'План этапов от ИИ' : 'План этапов'}</strong>
        {plan ? <Tag>{stages.length}</Tag> : null}
      </div>
      {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 10 }} /> : null}
      {progressText ? (
        <Alert type="info" showIcon message={progressText} style={{ marginTop: 10 }} />
      ) : null}
      {plan ? (
        <ol className={`request-ai-plan-card__list${embedded ? ' request-ai-plan-card__list--compact' : ''}`}>
          {visibleStages.map((stage, index) => {
            const performer = stage.recommended_performers?.[0]?.full_name;
            return (
              <li key={`${stage.title}-${index}`}>
                <div className="request-ai-plan-card__item-title">
                  <span>{stage.title}</span>
                </div>
                {stage.role_hint || performer ? (
                  <small>
                    {[stage.role_hint, performer ? String(performer) : null].filter(Boolean).join(' · ')}
                  </small>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>ИИ предложит последовательность этапов, ожидаемые результаты и подходящих исполнителей.</p>
      )}
      {embedded && stages.length > COLLAPSED_ITEMS ? (
        <Button
          type="link"
          size="small"
          className="request-ai-plan-card__toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : `Показать все (ещё ${hiddenCount})`}
        </Button>
      ) : null}
      {canManage ? (
        <div className="request-ai-plan-card__actions">
          {plan?.status === 'draft' ? (
            <Button type="primary" size="small" disabled={busy} onClick={() => setEditorOpen(true)}>
              Проверить и применить
            </Button>
          ) : null}
          <Button size="small" icon={<ReloadOutlined />} loading={busy} onClick={() => void generate()}>
            {plan ? 'Обновить' : 'Предложить план'}
          </Button>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {embedded ? (
        <section className="request-ai-plan-card request-ai-plan-card--embedded" aria-label="План этапов от ИИ">
          {body}
        </section>
      ) : (
        <Card size="small" className="request-ai-plan-card">
          {body}
        </Card>
      )}
      <Modal
        open={editorOpen}
        title="Черновик плана этапов"
        width={760}
        okText="Создать этапы"
        cancelText="Отмена"
        confirmLoading={busy}
        onCancel={() => !busy && setEditorOpen(false)}
        onOk={() => void apply()}
      >
        <div style={{ display: 'grid', gap: 12, maxHeight: '65dvh', overflowY: 'auto' }}>
          {draftStages.map((stage, index) => (
            <Card key={index} size="small">
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input
                  value={stage.title}
                  onChange={(event) => patchStage(index, { title: event.target.value })}
                  placeholder="Название этапа"
                />
                <Button icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveStage(index, -1)} />
                <Button icon={<ArrowDownOutlined />} disabled={index === draftStages.length - 1} onClick={() => moveStage(index, 1)} />
                <Button danger icon={<DeleteOutlined />} onClick={() => setDraftStages((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} />
              </Space.Compact>
              <Input.TextArea
                value={stage.description ?? ''}
                onChange={(event) => patchStage(index, { description: event.target.value || null })}
                placeholder="Что нужно сделать"
                autoSize={{ minRows: 2, maxRows: 5 }}
              />
              <Input
                value={stage.expected_result ?? ''}
                onChange={(event) => patchStage(index, { expected_result: event.target.value || null })}
                placeholder="Ожидаемый результат"
                style={{ marginTop: 8 }}
              />
              <Space style={{ marginTop: 8 }} wrap>
                <Input
                  value={stage.role_hint ?? ''}
                  onChange={(event) => patchStage(index, { role_hint: event.target.value || null })}
                  placeholder="Рекомендуемая роль"
                />
                <InputNumber
                  min={1}
                  max={365}
                  value={stage.estimated_duration_days ?? undefined}
                  onChange={(value) => patchStage(index, { estimated_duration_days: value ?? null })}
                  addonAfter="дн."
                  placeholder="Срок"
                />
              </Space>
            </Card>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setDraftStages((rows) => [...rows, { title: '', description: null, expected_result: null, role_hint: null, estimated_duration_days: null }])}
          >
            Добавить этап
          </Button>
        </div>
      </Modal>
    </>
  );
}
