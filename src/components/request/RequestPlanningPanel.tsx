import { useState } from 'react';
import { Button, Card, Divider, Input, Modal, message } from 'antd';
import { ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import type { RequestEntity } from '../../types/request';
import {
  releaseRequest,
  selfExecuteRequest,
  takeRequest,
} from '../../shared/api/requests.api';
import { AiStagePlanAssistant } from './assistant/AiStagePlanAssistant';

type Props = {
  request: RequestEntity;
  onUpdated: () => Promise<void>;
  /** `panel` — narrow right column: stacked full-width buttons */
  variant?: 'panel' | 'inline';
};

const errorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return err instanceof Error ? err.message : fallback;
};

/**
 * First step of a request lifecycle: someone takes the request and chooses how it will be done —
 * either by an AI-suggested stage plan or personally («Сделаю сам»).
 */
export function RequestPlanningPanel({ request, onUpdated, variant = 'inline' }: Props) {
  const permissions = request.permissions;
  const status = request.workflow_status ?? 'new';
  const [busy, setBusy] = useState(false);
  const [selfConfirmOpen, setSelfConfirmOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');

  if (status !== 'new' && status !== 'planning') return null;

  const canTake = Boolean(permissions?.can_take);
  const canSelfExecute = Boolean(permissions?.can_self_execute);
  const canRelease = Boolean(permissions?.can_release);
  const canManagePlan = Boolean(permissions?.can_manage_plan);
  const hasStages = (request.stages ?? []).some((stage) => stage.status !== 'cancelled');

  if (!canTake && !canSelfExecute && !canManagePlan) return null;

  const run = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(true);
    try {
      await action();
      message.success(success);
      await onUpdated();
      return true;
    } catch (err) {
      message.error(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const showPlan = status === 'planning' && canManagePlan;

  return (
    <Card
      size="small"
      className={`request-planning-card request-planning-card--${variant}`}
      styles={{ body: { padding: 16 } }}
    >
      <section aria-label="Способ выполнения">
        <h3 className="request-planning-card__title">
          {canTake ? 'Заявка свободна' : 'Выполнение заявки'}
        </h3>
        <p className="request-planning-card__hint">
          {canTake
            ? 'Возьмите её в работу, чтобы стать ответственным и спланировать выполнение.'
            : hasStages
              ? 'Назначьте исполнителей этапов и запустите заявку — или выполните её сами.'
              : 'Примените план от ИИ, добавьте этапы вручную или выполните заявку сами.'}
        </p>
        <div className="request-planning-card__actions">
          {canTake ? (
            <Button
              type="primary"
              icon={<UserOutlined />}
              loading={busy}
              block={variant === 'panel'}
              onClick={() =>
                void run(() => takeRequest(request.id), 'Вы ответственный за заявку', 'Не удалось взять заявку')
              }
            >
              Взять в работу
            </Button>
          ) : null}
          {canSelfExecute ? (
            <Button
              icon={<ThunderboltOutlined />}
              disabled={busy}
              block={variant === 'panel'}
              onClick={() => setSelfConfirmOpen(true)}
            >
              Сделаю сам
            </Button>
          ) : null}
        </div>
        {canRelease ? (
          <Button
            type="link"
            danger
            size="small"
            disabled={busy}
            className="request-planning-card__release"
            onClick={() => setReleaseOpen(true)}
          >
            Отказаться от заявки
          </Button>
        ) : null}
      </section>

      {showPlan ? (
        <>
          <Divider style={{ margin: '14px 0' }} />
          <AiStagePlanAssistant
            requestId={request.id}
            plan={request.ai_stage_plan}
            canManage={canManagePlan}
            onUpdated={onUpdated}
            embedded
          />
        </>
      ) : null}

      <Modal
        open={selfConfirmOpen}
        title="Выполнить заявку самостоятельно?"
        okText="Сделаю сам"
        cancelText="Отмена"
        confirmLoading={busy}
        onCancel={() => !busy && setSelfConfirmOpen(false)}
        onOk={async () => {
          const ok = await run(
            () => selfExecuteRequest(request.id),
            'Заявка в работе, вы исполнитель',
            'Не удалось запустить заявку',
          );
          if (ok) setSelfConfirmOpen(false);
        }}
      >
        <p style={{ margin: 0 }}>
          {hasStages
            ? 'Вы станете исполнителем текущего этапа, и заявка сразу перейдёт в работу.'
            : 'Будет создан один этап, вы станете его исполнителем, и заявка сразу перейдёт в работу.'}
        </p>
      </Modal>

      <Modal
        open={releaseOpen}
        title="Отказаться от заявки?"
        okText="Отказаться"
        cancelText="Назад"
        okButtonProps={{ danger: true, disabled: !releaseReason.trim() }}
        confirmLoading={busy}
        onCancel={() => !busy && setReleaseOpen(false)}
        onOk={async () => {
          const ok = await run(
            () => releaseRequest(request.id, releaseReason.trim()),
            'Вы больше не ответственный за заявку',
            'Не удалось отказаться от заявки',
          );
          if (ok) {
            setReleaseOpen(false);
            setReleaseReason('');
          }
        }}
      >
        <p>Заявка вернётся в статус «Новая», созданные этапы сохранятся. Владелец получит уведомление.</p>
        <Input.TextArea
          value={releaseReason}
          onChange={(event) => setReleaseReason(event.target.value)}
          placeholder="Причина (обязательно)"
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
      </Modal>
    </Card>
  );
}
