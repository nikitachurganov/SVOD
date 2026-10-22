import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import {
  CheckOutlined,
  DownOutlined,
  ExclamationOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { RequestStageDTO, RequestTimelineStageDTO } from '../../types/execution';
import type { RequestPermissions } from '../../types/request';
import type { PerformerRecommendationResponse } from '../../types/performerSelection';
import {
  addRequestStage,
  addStageArtifactLink,
  completeRequestStage,
  getRequestTimeline,
  getStagePerformers,
  patchRequestStage,
  reorderRequestStages,
  startRequest,
  unblockRequestStage,
  uploadStageArtifact,
} from '../../shared/api/requests.api';
import { AssignPerformerModal } from './AssignPerformerModal';
import { StageAssigneeLabel } from './StageAssigneeLabel';
import { StageDetails } from './stages/StageDetails';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Запланирован',
  waiting_assignment: 'Нужен исполнитель',
  waiting_external: 'Ждёт внешнего исполнителя',
  in_progress: 'В работе',
  needs_review: 'На проверке',
  blocked: 'Заблокирован',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

const TERMINAL = new Set(['done', 'cancelled']);

type StageFormValues = {
  title: string;
  description?: string;
  expected_result?: string;
  recommended_role?: string;
  due_date?: Dayjs | null;
  position?: number;
};

type Props = {
  requestId: string;
  workflowStatus: string;
  stages: RequestStageDTO[];
  permissions?: RequestPermissions;
  onReload: () => Promise<void>;
};

type StepState = 'done' | 'current' | 'blocked' | 'upcoming';

const stepState = (stage: RequestStageDTO, isActive: boolean, requestStarted: boolean): StepState => {
  if (stage.status === 'done') return 'done';
  if (stage.status === 'blocked') return 'blocked';
  if (isActive && requestStarted) return 'current';
  return 'upcoming';
};

const errorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : err instanceof Error ? err.message : fallback;
};

/** Step marker on the vertical rail: state is shown by icon + text, not by colour alone */
function StepMarker({ state, sequence }: { state: StepState; sequence: number }) {
  return (
    <span className={`stage-step__marker stage-step__marker--${state}`} aria-hidden>
      {state === 'done' ? <CheckOutlined /> : state === 'blocked' ? <ExclamationOutlined /> : sequence}
    </span>
  );
}

export function RequestStagePlanner({ requestId, workflowStatus, stages, permissions, onReload }: Props) {
  const [form] = Form.useForm<StageFormValues>();
  const [editing, setEditing] = useState<RequestStageDTO | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignStage, setAssignStage] = useState<RequestStageDTO | null>(null);
  const [recommendations, setRecommendations] = useState<PerformerRecommendationResponse | null>(null);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<Record<string, RequestTimelineStageDTO>>({});
  const [openIds, setOpenIds] = useState<string[] | null>(null);
  const [completeStage, setCompleteStage] = useState<RequestStageDTO | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [completeLink, setCompleteLink] = useState('');
  const [completeFiles, setCompleteFiles] = useState<UploadFile[]>([]);

  const ordered = useMemo(
    () => [...stages].filter((stage) => stage.status !== 'cancelled').sort((a, b) => a.sequence - b.sequence),
    [stages],
  );
  const activeStage = ordered.find((stage) => !TERMINAL.has(stage.status)) ?? null;
  const requestStarted = ['in_progress', 'completed', 'closed'].includes(workflowStatus);
  const canManage = Boolean(permissions?.can_manage_plan);
  const canReorder = canManage && ['planning', 'new', 'completed', 'in_progress'].includes(workflowStatus);

  // Dossiers (spec, handoffs, files, events) for the expanded details
  const loadDossiers = useCallback(async () => {
    try {
      const data = await getRequestTimeline(requestId);
      setDossiers(Object.fromEntries(data.stages.map((item) => [item.id, item])));
    } catch {
      /* details fall back to a skeleton; the list itself still works */
    }
  }, [requestId]);

  useEffect(() => {
    void loadDossiers();
  }, [loadDossiers, stages]);

  // Progressive disclosure: by default only the active stage is open
  const effectiveOpenIds = openIds ?? (activeStage ? [activeStage.id] : []);
  const toggle = (stageId: string) =>
    setOpenIds((current) => {
      const base = current ?? effectiveOpenIds;
      return base.includes(stageId) ? base.filter((id) => id !== stageId) : [...base, stageId];
    });

  const reloadAll = useCallback(async () => {
    await onReload();
    await loadDossiers();
  }, [onReload, loadDossiers]);

  /** Positions a not-yet-started stage may take: the server keeps done/current stages in front */
  const movablePositions = useMemo(() => {
    const first = ordered.findIndex((stage) => stage.status === 'pending');
    if (first === -1) return [];
    return Array.from({ length: ordered.length - first }, (_, index) => first + index + 1);
  }, [ordered]);
  const canChangePosition =
    canReorder && Boolean(editing) && editing?.status === 'pending' && movablePositions.length > 1;

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    setEditorOpen(true);
  };

  const openEdit = (stage: RequestStageDTO) => {
    setEditing(stage);
    form.setFieldsValue({
      title: stage.title,
      description: stage.description ?? undefined,
      expected_result: stage.expected_result ?? undefined,
      recommended_role: stage.recommended_role ?? undefined,
      due_date: stage.due_date ? dayjs(stage.due_date) : null,
      position: ordered.findIndex((item) => item.id === stage.id) + 1,
    });
    setEditorOpen(true);
  };

  const saveStage = async () => {
    const values = await form.validateFields();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        expected_result: values.expected_result?.trim() || null,
        recommended_role: values.recommended_role?.trim() || null,
        due_date: values.due_date?.endOf('day').toISOString() ?? null,
      };
      if (editing) {
        await patchRequestStage(requestId, editing.id, payload);
        const currentIndex = ordered.findIndex((item) => item.id === editing.id);
        const targetIndex = (values.position ?? currentIndex + 1) - 1;
        if (canChangePosition && targetIndex !== currentIndex) {
          const ids = ordered.map((item) => item.id);
          ids.splice(targetIndex, 0, ...ids.splice(currentIndex, 1));
          await reorderRequestStages(requestId, ids);
        }
      } else {
        await addRequestStage(requestId, payload);
      }
      setEditorOpen(false);
      await reloadAll();
    } catch (cause) {
      setError(errorText(cause, 'Не удалось сохранить этап'));
    } finally {
      setBusy(false);
    }
  };

  const openAssign = async (stage: RequestStageDTO) => {
    setBusy(true);
    setError(null);
    try {
      const data = await getStagePerformers(requestId, stage.id);
      setRecommendations(data);
      setSelectedPerformerId(data.recommended_performer_id ?? data.performers[0]?.id ?? null);
      setAssignStage(stage);
    } catch (cause) {
      setError(errorText(cause, 'Не удалось подобрать исполнителей'));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      message.success(success);
      await reloadAll();
      return true;
    } catch (cause) {
      setError(errorText(cause, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!completeStage) return;
    if (!completeNote.trim() && !completeLink.trim() && completeFiles.length === 0) {
      setError('Опишите результат, добавьте ссылку или файл.');
      return;
    }
    const stage = completeStage;
    const ok = await runAction(
      async () => {
        const artifactIds: string[] = [];
        if (completeLink.trim()) {
          const artifact = await addStageArtifactLink(requestId, stage.id, {
            name: completeLink.trim(),
            url: completeLink.trim(),
            purpose: 'result',
          });
          artifactIds.push(artifact.id);
        }
        for (const entry of completeFiles) {
          if (entry.originFileObj) {
            const artifact = await uploadStageArtifact(requestId, stage.id, entry.originFileObj, 'result');
            artifactIds.push(artifact.id);
          }
        }
        await completeRequestStage(requestId, stage.id, {
          result_summary: completeNote.trim() || undefined,
          artifact_ids: artifactIds,
        });
      },
      `Этап «${stage.title}» выполнен`,
      'Не удалось завершить этап',
    );
    if (ok) {
      setCompleteStage(null);
      setCompleteNote('');
      setCompleteLink('');
      setCompleteFiles([]);
      setOpenIds(null); // focus moves to the next active stage
    }
  };

  const selectedPerformer = recommendations?.performers.find((item) => item.id === selectedPerformerId) ?? null;

  return (
    <section className="request-stage-planner" aria-label="Этапы работы">
      <header className="request-stage-planner__header">
        <div className="request-stage-planner__heading">
          <h2>Этапы работы</h2>
          {!ordered.length ? (
            <p>Последовательный план выполнения заявки. Следующий этап откроется автоматически.</p>
          ) : null}
        </div>
        {canManage ? (
          <div className="request-stage-planner__header-actions">
            <Button icon={<PlusOutlined />} onClick={openNew} disabled={busy}>
              Добавить этап
            </Button>
            {permissions?.can_start ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={busy}
                onClick={() => void runAction(() => startRequest(requestId), 'Заявка запущена', 'Не удалось запустить заявку')}
              >
                Запустить
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} /> : null}

      {ordered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Этапов пока нет: добавьте первый вручную или примените план от ИИ"
        >
          {canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
              Добавить этап
            </Button>
          ) : null}
        </Empty>
      ) : (
        <ol className="stage-steps">
          {ordered.map((stage, index) => {
            const isActive = activeStage?.id === stage.id;
            const state = stepState(stage, isActive, requestStarted);
            const isOpen = effectiveOpenIds.includes(stage.id);
            const nextDone = ordered[index + 1]?.status === 'done';
            return (
              <li
                key={stage.id}
                className={`stage-step stage-step--${state}${isOpen ? ' stage-step--open' : ''}${stage.status === 'done' && nextDone ? ' stage-step--rail-done' : ''}`}
              >
                <StepMarker state={state} sequence={stage.sequence} />
                <div className="stage-step__card">
                  <div className="stage-step__head">
                    <button
                      type="button"
                      className="stage-step__toggle"
                      aria-expanded={isOpen}
                      aria-controls={`stage-details-${stage.id}`}
                      onClick={() => toggle(stage.id)}
                    >
                      <span className="stage-step__content">
                        <span className="stage-step__title-line">
                          <span className="stage-step__title">{stage.title}</span>
                          <span className="stage-step__status">
                            <span className={`stage-status stage-status--${state}`}>
                              {STATUS_LABELS[stage.status] ?? stage.status}
                            </span>
                            {stage.is_overdue && stage.status !== 'done' ? (
                              <span className="stage-status stage-status--blocked">Просрочен</span>
                            ) : null}
                          </span>
                          <DownOutlined className="stage-step__chevron" aria-hidden />
                        </span>
                        <span className="stage-step__meta">
                          <StageAssigneeLabel assignee={stage.assignee_preview} />
                          <span>{stage.due_date ? `до ${dayjs(stage.due_date).format('DD.MM.YYYY')}` : 'без срока'}</span>
                        </span>
                      </span>
                    </button>
                  </div>
                  {isOpen ? (
                    <div id={`stage-details-${stage.id}`} className="stage-step__body">
                      <StageDetails
                        requestId={requestId}
                        stage={stage}
                        dossier={dossiers[stage.id]}
                        isActive={isActive}
                        requestStarted={requestStarted}
                        permissions={permissions}
                        onAssign={() => void openAssign(stage)}
                        onEdit={() => openEdit(stage)}
                        onComplete={() => setCompleteStage(stage)}
                        onUnblock={() =>
                          void runAction(
                            () => unblockRequestStage(requestId, stage.id),
                            'Блокировка снята',
                            'Не удалось снять блокировку',
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={editorOpen}
        title={editing ? 'Редактировать этап' : 'Новый этап'}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={busy}
        onOk={() => void saveStage()}
        onCancel={() => !busy && setEditorOpen(false)}
        width={620}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Название" rules={[{ required: true, message: 'Укажите название этапа' }]}>
            <Input maxLength={500} />
          </Form.Item>
          <Form.Item name="description" label="Что нужно сделать">
            <Input.TextArea rows={3} maxLength={10_000} />
          </Form.Item>
          <Form.Item name="expected_result" label="Ожидаемый результат">
            <Input.TextArea rows={2} maxLength={10_000} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
            <Form.Item name="recommended_role" label="Рекомендуемая роль">
              <Input maxLength={500} placeholder="Например, дизайнер" />
            </Form.Item>
            <Form.Item name="due_date" label="Срок">
              <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          {canChangePosition ? (
            <Form.Item
              name="position"
              label="Порядок выполнения"
              extra="Номер этапа в последовательности. Выполненные и текущий этапы остаются впереди."
            >
              <Select
                options={movablePositions.map((position) => ({
                  value: position,
                  label: `${position}-й из ${ordered.length}`,
                }))}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        open={Boolean(completeStage)}
        title={`Завершить этап «${completeStage?.title ?? ''}»`}
        okText="Завершить этап"
        cancelText="Отмена"
        confirmLoading={busy}
        onOk={() => void handleComplete()}
        onCancel={() => !busy && setCompleteStage(null)}
        destroyOnHidden
      >
        <p className="stage-muted" style={{ marginTop: 0 }}>
          Добавьте хотя бы одно: описание результата, ссылку или файл. Следующий этап начнётся автоматически.
        </p>
        <Form layout="vertical">
          <Form.Item label="Что сделано">
            <Input.TextArea value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} rows={4} />
          </Form.Item>
          <Form.Item label="Ссылка на результат">
            <Input
              value={completeLink}
              onChange={(e) => setCompleteLink(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Form.Item>
          <Form.Item label="Файлы">
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={completeFiles}
              onChange={({ fileList }) => setCompleteFiles(fileList.slice(0, 10))}
            >
              <Button>Выбрать файлы</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <AssignPerformerModal
        open={Boolean(assignStage) && Boolean(recommendations) && Boolean(selectedPerformer)}
        onClose={() => setAssignStage(null)}
        requestId={requestId}
        stageId={assignStage?.id}
        performer={selectedPerformer}
        performers={recommendations?.performers ?? []}
        allPerformers={recommendations?.all_performers ?? []}
        recommendedPerformerId={recommendations?.recommended_performer_id ?? null}
        onSuccess={reloadAll}
      />
    </section>
  );
}
