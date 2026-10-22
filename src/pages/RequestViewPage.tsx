import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Alert,
  Spin,
  Modal,
  Tabs,
  Tag,
  Card,
  Tooltip,
  Descriptions,
  Drawer,
  FloatButton,
  Input,
} from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, DownloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
import { RequestAssistantSidebar } from '../components/request/assistant/RequestAssistantSidebar';
import { RequestFilesPanel } from '../components/request/RequestFilesPanel';
import { RequestStagePlanner } from '../components/request/RequestStagePlanner';
import { RequestPassport } from '../components/request/RequestPassport';
import { RequestPlanningPanel } from '../components/request/RequestPlanningPanel';
import { RequestTelegramSource } from '../components/request/RequestTelegramSource';
import { featureFlags } from '../shared/config/featureFlags';
import { getRequestWithForm, type RequestWithForm } from '../shared/api/requests.api';
import {
  cancelRequest,
  closeRequest,
  deleteRequest,
  startRequest,
  takeRequest,
} from '../shared/api/requests.api';
import { formatFieldValue } from '../shared/utils/formatFieldValue';
import { FieldLabel } from '../shared/ui/form-builder/FieldLabel';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import type { Field } from '../types/form';
import { resolveFileDownloadUrl } from '../shared/api/files.api';

interface StoredFileMeta {
  id?: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  file_url: string;
}

function useResolvedFileUrl(fileUrl: string): string {
  const [resolved, setResolved] = useState(fileUrl.startsWith('/files/') ? '' : fileUrl);

  useEffect(() => {
    let cancelled = false;
    resolveFileDownloadUrl(fileUrl)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        if (!cancelled) setResolved('');
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);
  return resolved;
}

function StoredFileImage({ file }: { file: StoredFileMeta }) {
  const src = useResolvedFileUrl(file.file_url);
  if (!src) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <FileTextOutlined style={{ fontSize: 32, color: 'var(--app-text-placeholder)' }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={file.file_name}
      style={{ maxWidth: 300, maxHeight: 200, objectFit: 'contain', display: 'block' }}
    />
  );
}

function StoredFileDownload({ file }: { file: StoredFileMeta }) {
  const href = useResolvedFileUrl(file.file_url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'inline-flex', color: 'var(--app-link)' }}
    >
      <DownloadOutlined style={{ fontSize: 16 }} />
    </a>
  );
}

type RequestDetailsState = {
  data: RequestWithForm | null;
  loading: boolean;
  error: string | null;
};

export const RequestViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isWideScreen = useMediaQuery('(min-width: 1100px)');
  const showAssistantPanel = featureFlags.requestAssistant && isWideScreen;
  const showAssistantDrawer = featureFlags.requestAssistant && !isWideScreen;
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);

  const { setEntityTitle } = useBreadcrumbEntity();

  const [{ data, loading, error }, setState] = useState<RequestDetailsState>({
    data: null,
    loading: true,
    error: null,
  });
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [takingOrStarting, setTakingOrStarting] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [inlineNotification, setInlineNotification] = useState<{
    kind: 'success' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);

  const loadInitial = useCallback(async () => {
    if (!id) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await getRequestWithForm(id);
      setState({ data: result, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить заявку',
      });
    }
  }, [id]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    setEntityTitle(data?.request?.title ?? null);
  }, [data?.request?.title, setEntityTitle]);

  const reloadRequest = useCallback(async () => {
    if (!id) return;
    try {
      const result = await getRequestWithForm(id);
      setState((prev) => ({ ...prev, data: result }));
    } catch {
      /* silent */
    }
  }, [id]);

  const pageTitle = data?.request ? data.request.title : 'Загрузка заявки…';
  const isPlanningPhase = ['new', 'planning'].includes(data?.request?.workflow_status ?? '');
  // All stage work lives in the «Этапы» tab — it is the default view of a request
  const currentTabKey = activeTabKey ?? 'stages';

  if (!id) {
    return (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--app-bg)',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const fields: Field[] = data?.form?.fields ?? [];
  const parsedData = data?.parsedData ?? {};

  const fieldIds = fields.map((f) => f.id);
  const maybeValues = (parsedData as Record<string, unknown>).values;
  const nestedValues =
    maybeValues && typeof maybeValues === 'object' && !Array.isArray(maybeValues)
      ? (maybeValues as Record<string, unknown>)
      : undefined;

  const hasDirectMatches = fieldIds.some((fieldId) => fieldId in parsedData);
  const activeDataSource = hasDirectMatches ? parsedData : (nestedValues ?? parsedData);
  const normalizeFileValues = (raw: unknown): StoredFileMeta[] => {
    if (raw == null) return [];

    const items = Array.isArray(raw) ? raw : [raw];
    const result: StoredFileMeta[] = [];

    for (const item of items) {
      if (typeof item === 'object' && item !== null && 'file_url' in item) {
        const meta = item as Record<string, unknown>;
        result.push({
          id: typeof meta.id === 'string' ? meta.id : undefined,
          file_name: String(meta.file_name ?? 'file'),
          file_type: typeof meta.file_type === 'string' ? meta.file_type : undefined,
          file_size: typeof meta.file_size === 'number' ? meta.file_size : undefined,
          file_url: String(meta.file_url),
        });
      } else if (typeof item === 'string' && item.trim()) {
        const isUrl = /^https?:\/\//.test(item) || item.startsWith('/') || item.startsWith('data:');
        result.push({
          file_name: isUrl ? item.split('/').pop() ?? item : item,
          file_url: isUrl ? item : '',
        });
      }
    }

    return result;
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const handleDelete = async () => {
    if (!data?.request) return;

    setDeleting(true);
    try {
      await deleteRequest(data.request.id);
      setInlineNotification({ kind: 'success', title: 'Заявка перемещена в архив' });
      navigate('/requests');
    } catch (err) {
      setInlineNotification({
        kind: 'error',
        title: 'Ошибка архивирования',
        subtitle: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleCloseRequest = async () => {
    if (!data?.request || data.request.workflow_status === 'closed') return;

    setClosing(true);
    try {
      await closeRequest(data.request.id);
      await reloadRequest();
      setInlineNotification({ kind: 'success', title: 'Заявка закрыта' });
    } catch (err) {
      setInlineNotification({
        kind: 'error',
        title: 'Ошибка закрытия',
        subtitle: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setClosing(false);
      setCloseConfirmOpen(false);
    }
  };

  const runHeaderAction = async (
    action: (requestId: string) => Promise<unknown>,
    successTitle: string,
    errorTitle: string,
  ) => {
    if (!data?.request) return;
    setTakingOrStarting(true);
    try {
      await action(data.request.id);
      await reloadRequest();
      setActiveTabKey('stages');
      setInlineNotification({ kind: 'success', title: successTitle });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setInlineNotification({
        kind: 'error',
        title: errorTitle,
        subtitle: typeof detail === 'string' ? detail : err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setTakingOrStarting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!data?.request) return;
    if (!cancelReason.trim()) {
      setInlineNotification({ kind: 'error', title: 'Укажите причину отмены заявки' });
      return;
    }
    setCancelling(true);
    try {
      await cancelRequest(data.request.id, cancelReason.trim());
      await reloadRequest();
      setInlineNotification({ kind: 'success', title: 'Заявка отменена' });
    } catch (err) {
      setInlineNotification({
        kind: 'error',
        title: 'Не удалось отменить заявку',
        subtitle: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
      setCancelReason('');
    }
  };

  return (
    <div className="request-workspace">
      {/* Header */}
      <header className="request-workspace__header">
        <div className="request-workspace__header-top">
          <div className="request-workspace__title-group">
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              title="Вернуться к реестру заявок"
              onClick={() => navigate('/requests')}
            />
            <div className="request-workspace__title-copy">
              <div className="request-workspace__title-line">
                <h4>
                  {pageTitle}
                </h4>
                {data?.request && (
                  <span className="request-workspace__request-id">
                    № {data.request.id}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="request-workspace__actions">
            {data?.request?.permissions?.can_take && (
              <Button
                type="primary"
                size="small"
                loading={takingOrStarting}
                onClick={() =>
                  void runHeaderAction(takeRequest, 'Вы ответственный за заявку', 'Не удалось взять заявку')
                }
              >
                Взять в работу
              </Button>
            )}
            {data?.request?.permissions?.can_start && (
              <Button
                type="primary"
                size="small"
                loading={takingOrStarting}
                onClick={() =>
                  void runHeaderAction(startRequest, 'Заявка запущена', 'Не удалось запустить заявку')
                }
              >
                Запустить
              </Button>
            )}
            {data?.request?.permissions?.can_close && (
              <Button
                size="small"
                disabled={closing}
                onClick={() => setCloseConfirmOpen(true)}
              >
                {closing ? 'Закрытие…' : 'Закрыть заявку'}
              </Button>
            )}
            {data?.request?.permissions?.can_cancel ? (
              <Button
                danger
                type="text"
                size="small"
                disabled={cancelling}
                onClick={() => setCancelConfirmOpen(true)}
              >
                {cancelling ? 'Отмена…' : 'Отменить'}
              </Button>
            ) : null}
            {data?.request?.permissions?.can_delete && (
              <Button
                danger
                type="primary"
                size="small"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {deleting ? 'Архивация…' : 'В архив'}
              </Button>
            )}
          </div>
        </div>

        {data?.request && <RequestPassport request={data.request} onUpdated={reloadRequest} />}

        {data?.request && (
          <div className="request-workspace__ai-description">
            <p>{data.request.ai_summary?.summary ?? 'ИИ формирует краткое описание заявки…'}</p>
          </div>
        )}

      </header>

      {/* Close Confirmation Modal */}
      <Modal
        open={closeConfirmOpen}
        title="Закрыть заявку?"
        okText="Да"
        cancelText="Отмена"
        onOk={() => void handleCloseRequest()}
        onCancel={() => setCloseConfirmOpen(false)}
      >
        <p>Вы уверены, что хотите закрыть заявку?</p>
      </Modal>

      <Modal
        open={cancelConfirmOpen}
        title="Отменить заявку?"
        okText="Отменить заявку"
        cancelText="Назад"
        okButtonProps={{ danger: true, loading: cancelling }}
        onOk={() => void handleCancelRequest()}
        onCancel={() => !cancelling && setCancelConfirmOpen(false)}
      >
        <p>Незавершённые этапы будут отменены. Это действие нельзя отменить через интерфейс.</p>
        <Input.TextArea
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="Причина отмены (обязательно)"
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        title="Переместить заявку в архив?"
        okText="В архив"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        onOk={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      >
        <p>Заявка будет перемещена в архив. Её можно будет найти в реестре на вкладке «Архив».</p>
      </Modal>

      {/* Content */}
      <div className="request-workspace__content">
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '60vh',
            }}
          >
            <Spin size="large" />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <Alert type="error" message="Ошибка загрузки" description={error} showIcon />
          </div>
        ) : !data ? (
          <div style={{ padding: 24 }}>
            <Alert
              type="error"
              message="Заявка не найдена"
              description="Проверьте корректность ссылки или вернитесь к реестру заявок."
              showIcon
            />
          </div>
        ) : (
          <div className="request-workspace__body">
            {/* Left: main request content with tabs */}
            <main className="request-workspace__main">
              {inlineNotification && (
                <div className="request-workspace__notification">
                  <Alert
                    type={inlineNotification.kind}
                    message={inlineNotification.title}
                    description={inlineNotification.subtitle}
                    showIcon
                    closable
                    onClose={() => setInlineNotification(null)}
                  />
                </div>
              )}

              <div className="app-request-view-tabs-wrap">
                <div
                  className="app-request-view-tabs-bar"
                >
                  <Tabs
                    activeKey={currentTabKey}
                    onChange={setActiveTabKey}
                    items={[
                      {
                        key: 'info',
                        label: 'Описание',
                        children: (
                          <div
                            style={{
                              flex: 1,
                              minHeight: 0,
                              overflow: 'auto',
                              boxSizing: 'border-box',
                              padding: '1rem 0 1.5rem',
                            }}
                          >
                            {data.request.source === 'telegram' ? (
                              <RequestTelegramSource requestId={data.request.id} />
                            ) : null}
                            {fields.length > 0 ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 16,
                                }}
                              >
                                <Descriptions
                                  column={1}
                                  size="small"
                                  bordered
                                  items={fields
                                    .filter(
                                      (field) =>
                                        field.type !== 'file_image' &&
                                        field.type !== 'file_vector' &&
                                        field.type !== 'file_document' &&
                                        activeDataSource[field.id] !== undefined,
                                    )
                                    .map((field) => ({
                                      key: field.id,
                                      label: field.label || 'Без названия',
                                      children: formatFieldValue(
                                        field,
                                        activeDataSource[field.id],
                                      ),
                                    }))}
                                />

                                {(() => {
                                  const fileFields = fields.filter(
                                    (f) =>
                                      f.type === 'file_image' ||
                                      f.type === 'file_vector' ||
                                      f.type === 'file_document',
                                  );
                                  const nonEmptyFileFields = fileFields.filter(
                                    (f) => normalizeFileValues(activeDataSource[f.id]).length > 0,
                                  );
                                  if (!nonEmptyFileFields.length) return null;

                                  return (
                                    <div style={{ marginTop: 8 }}>
                                      <h5 style={{ marginBottom: 8, fontSize: '0.875rem', fontWeight: 600 }}>
                                        Файлы
                                      </h5>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {nonEmptyFileFields.map((field) => {
                                          const fileMetas = normalizeFileValues(activeDataSource[field.id]);

                                          return (
                                            <div key={field.id} className="app-request-form-value-row">
                                              <FieldLabel label={field.label || 'Без названия'} />

                                              {field.type === 'file_image' ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                                  {fileMetas.map((meta, idx) => (
                                                    <div
                                                      key={meta.id ?? `${meta.file_name}-${idx}`}
                                                      style={{
                                                        border: '1px solid var(--app-border)',
                                                        borderRadius: 4,
                                                        overflow: 'hidden',
                                                        maxWidth: 300,
                                                        background: 'var(--app-surface)',
                                                      }}
                                                    >
                                                      {meta.file_url ? (
                                                        <StoredFileImage file={meta} />
                                                      ) : (
                                                        <div style={{ padding: 16, textAlign: 'center' }}>
                                                          <FileTextOutlined
                                                            style={{ fontSize: 32, color: 'var(--app-text-placeholder)' }}
                                                          />
                                                        </div>
                                                      )}
                                                      <div
                                                        style={{
                                                          padding: '6px 10px',
                                                          borderTop: '1px solid var(--app-border)',
                                                          fontSize: 12,
                                                          color: 'var(--app-text-secondary)',
                                                          display: 'flex',
                                                          justifyContent: 'space-between',
                                                          alignItems: 'center',
                                                        }}
                                                      >
                                                        <span
                                                          style={{
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            maxWidth: '70%',
                                                          }}
                                                        >
                                                          {meta.file_name}
                                                        </span>
                                                        {meta.file_size ? <span>{formatSize(meta.file_size)}</span> : null}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                  {fileMetas.map((meta, idx) => (
                                                    <div
                                                      key={meta.id ?? `${meta.file_name}-${idx}`}
                                                      style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '8px 12px',
                                                        border: '1px solid var(--app-border)',
                                                        borderRadius: 4,
                                                        background: 'var(--app-surface)',
                                                      }}
                                                    >
                                                      <FileTextOutlined
                                                        style={{ fontSize: 18, color: 'var(--app-text-secondary)' }}
                                                      />
                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <span
                                                          style={{
                                                            fontSize: 14,
                                                            fontWeight: 500,
                                                            display: 'block',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                          }}
                                                        >
                                                          {meta.file_name}
                                                        </span>
                                                        {(meta.file_type || meta.file_size) && (
                                                          <span
                                                            style={{
                                                              fontSize: 12,
                                                              color: 'var(--app-text-secondary)',
                                                            }}
                                                          >
                                                            {[meta.file_type, formatSize(meta.file_size)]
                                                              .filter(Boolean)
                                                              .join(' · ')}
                                                          </span>
                                                        )}
                                                      </div>
                                                      {meta.file_url && (
                                                        <Tooltip title="Скачать">
                                                          <StoredFileDownload file={meta} />
                                                        </Tooltip>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--app-text-secondary)' }}>
                                У связанной формы нет полей.
                              </span>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: 'stages',
                        label: 'Этапы',
                        children: data?.request ? (
                          <div
                            style={{
                              boxSizing: 'border-box',
                              height: '100%',
                              minHeight: 0,
                              overflow: 'auto',
                              paddingTop: '1rem',
                            }}
                          >
                          {!showAssistantPanel ? (
                            <RequestPlanningPanel request={data.request} onUpdated={reloadRequest} />
                          ) : null}
                          <RequestStagePlanner
                            requestId={data.request.id}
                            workflowStatus={data.request.workflow_status ?? 'new'}
                            stages={data.request.stages ?? []}
                            permissions={data.request.permissions}
                            onReload={reloadRequest}
                          />
                          </div>
                        ) : null,
                      },
                      {
                        key: 'files',
                        label: 'Файлы',
                        children: data?.request ? (
                          <RequestFilesPanel requestId={data.request.id} requestData={data.request.data} />
                        ) : null,
                      },
                      {
                        key: 'people',
                        label: 'Участники',
                        children: (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                              boxSizing: 'border-box',
                              minHeight: 0,
                              overflow: 'auto',
                              padding: '1rem 0 1.5rem',
                            }}
                          >
                            <Alert
                              type="info"
                              message="Роли и контакты"
                              description="Назначение исполнителя на этап выполняется во вкладке «Этапы»."
                              showIcon
                            />
                            {data.request.people && data.request.people.length > 0 ? (
                              data.request.people.map((person, idx) => (
                                <Card key={`${person.role}-${idx}`}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div
                                      style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        background: 'var(--app-primary)',
                                        color: 'var(--app-text-on-brand)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {person.name
                                        .split(' ')
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((w) => w[0]?.toUpperCase() ?? '')
                                        .join('')}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 500, fontSize: 14 }}>{person.name}</span>
                                        <Tag color="blue">
                                          {person.role === 'author' ? 'Автор' : person.role}
                                        </Tag>
                                        {person.source === 'public_link' && (
                                          <Tag>Публичная заявка</Tag>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 13, color: 'var(--app-text-secondary)', marginTop: 2 }}>
                                        {[person.email, person.phone].filter(Boolean).join(' · ') || '—'}
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              ))
                            ) : (
                              <span style={{ color: 'var(--app-text-secondary)' }}>
                                Нет связанных людей.
                              </span>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            </main>

            {/* Right: assistant panel (readiness, TZ, hints — no duplicate execution actions) */}
            {showAssistantPanel && (
              <aside className="request-workspace__sidepanel">
                <div className="request-workspace__assistant">
                  {isPlanningPhase ? (
                    <section className="request-workspace__sidepanel-section">
                      <RequestPlanningPanel
                        request={data.request}
                        onUpdated={reloadRequest}
                        variant="panel"
                      />
                    </section>
                  ) : null}
                  <section className="request-workspace__sidepanel-section">
                  <RequestAssistantSidebar
                    requestId={data.request.id}
                    aiAnalysis={data.request.ai_analysis}
                    aiAnalysisStatus={data.request.ai_analysis_status}
                    canManagePlan={data.request.permissions?.can_manage_plan}
                    onRequestUpdated={reloadRequest}
                  />
                  </section>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>

      {showAssistantDrawer && data && (
        <>
          <FloatButton
            icon={<RobotOutlined />}
            type="primary"
            tooltip="Помощник"
            onClick={() => setAssistantDrawerOpen(true)}
            style={{ insetInlineEnd: 24, insetBlockEnd: 24 }}
          />
          <Drawer
            title="Помощник"
            placement="right"
            width={360}
            open={assistantDrawerOpen}
            onClose={() => setAssistantDrawerOpen(false)}
          >
            <RequestAssistantSidebar
              requestId={data.request.id}
              aiAnalysis={data.request.ai_analysis}
              aiAnalysisStatus={data.request.ai_analysis_status}
              canManagePlan={data.request.permissions?.can_manage_plan}
              onRequestUpdated={reloadRequest}
            />
          </Drawer>
        </>
      )}
    </div>
  );
};
