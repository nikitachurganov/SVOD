import { useCallback, useEffect, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  InlineNotification,
  Loading,
  Modal,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Tile,
  Tooltip,
} from '@carbon/react';
import { ArrowLeft, Document, Download } from '@carbon/react/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
import { RequestAssistantSidebar } from '../components/request/assistant/RequestAssistantSidebar';
import { RequestExecutionPanel } from '../components/request/RequestExecutionPanel';
import { getRequestWithForm, type RequestWithForm } from '../services/requestService';
import { closeRequest, deleteRequest } from '../shared/api/requests.api';
import { formatFieldValue } from '../shared/utils/formatFieldValue';
import { buildDisplayName } from '../shared/utils/userName';
import type { RequestStageDTO } from '../types/execution';
import type { Field } from '../types/form';

interface StoredFileMeta {
  id?: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  file_url: string;
}

type RequestDetailsState = {
  data: RequestWithForm | null;
  loading: boolean;
  error: string | null;
};

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const STAGE_TERMINAL = new Set(['done', 'cancelled']);

const EXEC_HEADER_LABELS: Record<string, string> = {
  new: 'Процесс не начат',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  blocked: 'Блокировка',
  completed: 'Процесс завершён',
};

function findActiveStageHeader(stages: RequestStageDTO[] | undefined): RequestStageDTO | null {
  if (!stages?.length) return null;
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  return sorted.find((s) => !STAGE_TERMINAL.has(s.status)) ?? null;
}

export const RequestViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const showAssistantPanel = useMediaQuery('(min-width: 1100px)');

  const [{ data, loading, error }, setState] = useState<RequestDetailsState>({
    data: null,
    loading: true,
    error: null,
  });
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(1);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
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

  const reloadRequest = useCallback(async () => {
    if (!id) return;
    try {
      const result = await getRequestWithForm(id);
      setState((prev) => ({ ...prev, data: result }));
    } catch {
      /* silent */
    }
  }, [id]);

  const goToExecution = useCallback(() => {
    setActiveTabIndex(1);
  }, []);

  const pageTitle = data?.request ? data.request.title : 'Загрузка заявки…';
  const formTitle = data?.form?.title ?? '—';
  const activeStageForHeader = data?.request
    ? findActiveStageHeader(data.request.stages)
    : null;

  if (!id) {
    return (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--cds-background)',
        }}
      >
        <Loading withOverlay={false} />
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
  const activeKeys = Object.keys(activeDataSource);
  const extraDataKeys = activeKeys.filter((key) => !fieldIds.includes(key));

  const isNonEmptyValue = (value: unknown): boolean => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  };

  const hasMissingFilledFields = extraDataKeys.some((key) =>
    isNonEmptyValue((activeDataSource as Record<string, unknown>)[key]),
  );

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
      setInlineNotification({ kind: 'success', title: 'Заявка удалена' });
      navigate('/requests');
    } catch (err) {
      setInlineNotification({
        kind: 'error',
        title: 'Ошибка удаления',
        subtitle: err instanceof Error ? err.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleCloseRequest = async () => {
    if (!data?.request || data.request.status === 'closed') return;

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

  const statusTagType = (status: string) => {
    if (status === 'closed') return 'red';
    if (status === 'open') return 'blue';
    if (status === 'assigned') return 'teal';
    return 'warm-gray';
  };

  const statusLabel = (status: string) => {
    if (status === 'closed') return 'Закрыта';
    if (status === 'open') return 'Открыта';
    if (status === 'assigned') return 'У исполнителя';
    return 'В работе';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--cds-background)',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--cds-layer-01)',
          borderBottom: '1px solid var(--cds-border-subtle)',
          padding: '12px 24px 16px',
          flexShrink: 0,
        }}
      >
        {data?.request && (
          <Breadcrumb noTrailingSlash style={{ marginBottom: 8 }}>
            <BreadcrumbItem>
              <Link to="/requests">Заявки</Link>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>{data.request.title}</BreadcrumbItem>
          </Breadcrumb>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ArrowLeft}
              iconDescription="Вернуться к реестру заявок"
              onClick={() => navigate('/requests')}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                  {pageTitle}
                </h4>
                {data?.request && (
                  <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
                    № {data.request.id}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data?.request && (
              <Button
                kind="secondary"
                size="sm"
                disabled={data.request.status === 'closed' || closing}
                onClick={() => setCloseConfirmOpen(true)}
              >
                {closing ? 'Закрытие…' : 'Закрыть заявку'}
              </Button>
            )}
            {data?.request && (
              <Button
                kind="danger"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </Button>
            )}
          </div>
        </div>

        {data?.request && (
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--cds-text-secondary)' }}>Процесс: </span>
            <strong>
              {data.request.execution_status
                ? EXEC_HEADER_LABELS[data.request.execution_status] ??
                  data.request.execution_status
                : '—'}
            </strong>
            {activeStageForHeader ? (
              <>
                {' '}
                — {activeStageForHeader.title}
                {activeStageForHeader.assignee_preview?.full_name
                  ? ` · ${activeStageForHeader.assignee_preview.full_name}`
                  : ''}
              </>
            ) : data.request.status === 'closed' ? (
              <span style={{ color: 'var(--cds-text-secondary)' }}> — заявка закрыта</span>
            ) : (
              <span style={{ color: 'var(--cds-text-secondary)' }}>
                {' '}
                — этапы появятся после назначения во вкладке «Исполнение»
              </span>
            )}
          </div>
        )}

        {/* Metadata block (inside header) */}
        {data?.request && (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px 24px',
              fontSize: 13,
            }}
          >
            <div>
              <span style={{ color: 'var(--cds-text-secondary)', marginRight: 8 }}>Статус</span>
              <Tag type={statusTagType(data.request.status)} size="sm">
                {statusLabel(data.request.status)}
              </Tag>
            </div>
            <div>
              <span style={{ color: 'var(--cds-text-secondary)', marginRight: 8 }}>Тип заявки</span>
              <span style={{ fontSize: 13 }}>
                {data.request.form_snapshot?.title?.trim() || formTitle || '—'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--cds-text-secondary)', marginRight: 8 }}>Автор</span>
              {(() => {
                const authorPerson = data.request.people?.find((p) => p.role === 'author');
                if (data.request.author) {
                  return (
                    <span style={{ fontSize: 13 }}>
                      {buildDisplayName(data.request.author)}
                    </span>
                  );
                }
                if (authorPerson) {
                  return <span style={{ fontSize: 13 }}>{authorPerson.name}</span>;
                }
                return <span style={{ fontSize: 13 }}>Неизвестный автор</span>;
              })()}
            </div>
            <div>
              <span style={{ color: 'var(--cds-text-secondary)', marginRight: 8 }}>Дата создания</span>
              <span style={{ fontSize: 13 }}>
                {formatDate(data.request.created_at)}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--cds-text-secondary)', marginRight: 8 }}>Дата изменения</span>
              <span style={{ fontSize: 13 }}>
                {formatDate(data.request.updated_at ?? data.request.created_at)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Close Confirmation Modal */}
      <Modal
        open={closeConfirmOpen}
        modalHeading="Закрыть заявку?"
        primaryButtonText="Да"
        secondaryButtonText="Отмена"
        onRequestSubmit={handleCloseRequest}
        onRequestClose={() => setCloseConfirmOpen(false)}
        size="xs"
      >
        <p>Вы уверены, что хотите закрыть заявку?</p>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        danger
        modalHeading="Удалить заявку?"
        primaryButtonText="Удалить"
        secondaryButtonText="Отмена"
        onRequestSubmit={handleDelete}
        onRequestClose={() => setDeleteConfirmOpen(false)}
        size="xs"
      >
        <p>Вы уверены, что хотите удалить заявку?</p>
      </Modal>

      {/* Content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: 'var(--cds-background)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '60vh',
            }}
          >
            <Loading withOverlay={false} />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <InlineNotification
              kind="error"
              title="Ошибка загрузки"
              subtitle={error}
              lowContrast
              hideCloseButton
            />
          </div>
        ) : !data ? (
          <div style={{ padding: 24 }}>
            <InlineNotification
              kind="error"
              title="Заявка не найдена"
              subtitle="Проверьте корректность ссылки или вернитесь к реестру заявок."
              lowContrast
              hideCloseButton
            />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              height: '100%',
            }}
          >
            {/* Left: main request content with tabs */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                height: '100%',
              }}
            >
              {inlineNotification && (
                <div style={{ marginBottom: 16 }}>
                  <InlineNotification
                    kind={inlineNotification.kind}
                    title={inlineNotification.title}
                    subtitle={inlineNotification.subtitle}
                    lowContrast
                    onCloseButtonClick={() => setInlineNotification(null)}
                  />
                </div>
              )}

              <Tabs
                selectedIndex={activeTabIndex}
                onChange={({ selectedIndex }: { selectedIndex: number }) =>
                  setActiveTabIndex(selectedIndex)
                }
              >
                <TabList aria-label="Разделы заявки">
                  <Tab>Информация</Tab>
                  <Tab>Исполнение</Tab>
                  <Tab>Люди</Tab>
                </TabList>
                <TabPanels>
                  {/* Info tab */}
                  <TabPanel>
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflow: 'auto',
                        paddingTop: 16,
                      }}
                    >
                      {data?.request && (
                        <Tile style={{ padding: 16, marginBottom: 16 }}>
                          <span style={{ fontWeight: 600, display: 'block', marginBottom: 12 }}>
                            Жизненный цикл
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 16,
                              alignItems: 'center',
                              fontSize: 13,
                            }}
                          >
                            <div>
                              <Tag size="sm">Создана</Tag>{' '}
                              <span style={{ color: 'var(--cds-text-secondary)' }}>
                                {formatDateTime(data.request.created_at)}
                              </span>
                            </div>
                            {data.request.status === 'closed' && data.request.closedAt ? (
                              <div>
                                <Tag type="red" size="sm">Закрыта</Tag>{' '}
                                <span style={{ color: 'var(--cds-text-secondary)' }}>
                                  {formatDateTime(data.request.closedAt)}
                                </span>
                              </div>
                            ) : (
                              <div>
                                <Tag type="blue" size="sm">
                                  Активна
                                </Tag>
                              </div>
                            )}
                          </div>
                          <p
                            style={{
                              margin: '12px 0 0',
                              fontSize: 12,
                              color: 'var(--cds-text-secondary)',
                              lineHeight: 1.45,
                            }}
                          >
                            Этапы и передачи задач — во вкладке «Исполнение». Проверка качества и ТЗ —
                            на панели справа.
                          </p>
                        </Tile>
                      )}
                      {fields.length > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                          }}
                        >
                          {hasMissingFilledFields && (
                            <InlineNotification
                              kind="warning"
                              title="Форма была изменена после создания заявки"
                              subtitle="Некоторые поля могут не отображаться."
                              lowContrast
                              hideCloseButton
                            />
                          )}
                          {/* TODO: Store form snapshot in request at creation time
                              to prevent ID mismatch when form is edited later. */}
                          {fields.map((field) => {
                            if (
                              field.type === 'file_image' ||
                              field.type === 'file_vector' ||
                              field.type === 'file_document'
                            ) return null;

                            const rawValue = activeDataSource[field.id];
                            if (rawValue === undefined) return null;

                            const formatted = formatFieldValue(field, rawValue);
                            return (
                              <div key={field.id}>
                                <span
                                  style={{
                                    fontSize: 12,
                                    marginBottom: 4,
                                    display: 'block',
                                    color: 'var(--cds-text-secondary)',
                                  }}
                                >
                                  {field.label || 'Без названия'}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500 }}>
                                  {formatted}
                                </span>
                              </div>
                            );
                          })}

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
                                      <div key={field.id}>
                                        <span
                                          style={{
                                            fontSize: 12,
                                            marginBottom: 8,
                                            display: 'block',
                                            color: 'var(--cds-text-secondary)',
                                          }}
                                        >
                                          {field.label || 'Без названия'}
                                        </span>

                                        {field.type === 'file_image' ? (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                            {fileMetas.map((meta, idx) => (
                                              <div
                                                key={meta.id ?? `${meta.file_name}-${idx}`}
                                                style={{
                                                  border: '1px solid var(--cds-border-subtle)',
                                                  borderRadius: 4,
                                                  overflow: 'hidden',
                                                  maxWidth: 300,
                                                  background: 'var(--cds-layer-01)',
                                                }}
                                              >
                                                {meta.file_url ? (
                                                  <img
                                                    src={meta.file_url}
                                                    alt={meta.file_name}
                                                    style={{
                                                      maxWidth: 300,
                                                      maxHeight: 200,
                                                      objectFit: 'contain',
                                                      display: 'block',
                                                    }}
                                                  />
                                                ) : (
                                                  <div style={{ padding: 16, textAlign: 'center' }}>
                                                    <Document
                                                      size={32}
                                                      style={{ color: 'var(--cds-text-disabled)' }}
                                                    />
                                                  </div>
                                                )}
                                                <div
                                                  style={{
                                                    padding: '6px 10px',
                                                    borderTop: '1px solid var(--cds-border-subtle)',
                                                    fontSize: 12,
                                                    color: 'var(--cds-text-secondary)',
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
                                                  border: '1px solid var(--cds-border-subtle)',
                                                  borderRadius: 4,
                                                  background: 'var(--cds-layer-01)',
                                                }}
                                              >
                                                <Document
                                                  size={18}
                                                  style={{ color: 'var(--cds-text-secondary)' }}
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
                                                        color: 'var(--cds-text-secondary)',
                                                      }}
                                                    >
                                                      {[meta.file_type, formatSize(meta.file_size)]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                    </span>
                                                  )}
                                                </div>
                                                {meta.file_url && (
                                                  <Tooltip label="Скачать" align="top">
                                                    <a
                                                      href={meta.file_url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      style={{
                                                        display: 'inline-flex',
                                                        color: 'var(--cds-link-primary)',
                                                      }}
                                                    >
                                                      <Download size={16} />
                                                    </a>
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
                        <span style={{ color: 'var(--cds-text-secondary)' }}>
                          У связанной формы нет полей.
                        </span>
                      )}
                      <InlineNotification
                        kind="info"
                        title="Исполнение и назначение"
                        subtitle="Назначить исполнителя и управлять этапами можно только во вкладке «Исполнение». Справа — подсказки ИИ без дублирования действий."
                        lowContrast
                        hideCloseButton
                        style={{ marginTop: 24 }}
                      />
                    </div>
                  </TabPanel>

                  <TabPanel>
                    <div style={{ paddingTop: 16 }}>
                      {data?.request && (
                        <RequestExecutionPanel
                          requestId={data.request.id}
                          organizationId={data.request.organization_id ?? null}
                          executionStatus={data.request.execution_status ?? null}
                          stages={data.request.stages ?? []}
                          executionEvents={data.request.execution_events ?? []}
                          requestClosed={data.request.status === 'closed'}
                          onReload={reloadRequest}
                        />
                      )}
                    </div>
                  </TabPanel>

                  {/* People tab */}
                  <TabPanel>
                    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <InlineNotification
                        kind="info"
                        title="Роли и контакты"
                        subtitle="Назначение исполнителя на этап выполняется во вкладке «Исполнение»."
                        lowContrast
                        hideCloseButton
                      />
                      {data.request.people && data.request.people.length > 0 ? (
                        data.request.people.map((person, idx) => (
                          <Tile key={`${person.role}-${idx}`} style={{ padding: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: '50%',
                                  background: 'var(--cds-interactive)',
                                  color: 'var(--cds-text-on-color)',
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
                                  <Tag type="blue" size="sm">
                                    {person.role === 'author' ? 'Автор' : person.role}
                                  </Tag>
                                  {person.source === 'public_link' && (
                                    <Tag type="warm-gray" size="sm">Публичная заявка</Tag>
                                  )}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--cds-text-secondary)', marginTop: 2 }}>
                                  {[person.email, person.phone].filter(Boolean).join(' · ') || '—'}
                                </div>
                              </div>
                            </div>
                          </Tile>
                        ))
                      ) : (
                        <span style={{ color: 'var(--cds-text-secondary)' }}>
                          Нет связанных людей.
                        </span>
                      )}
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>

            {/* Right: assistant panel (readiness, TZ, hints — no duplicate execution actions) */}
            {showAssistantPanel && (
              <div
                style={{
                  width: 360,
                  flexShrink: 0,
                  height: '100%',
                }}
              >
                <div
                  style={{
                    background: 'var(--cds-layer-01)',
                    height: '100%',
                    borderLeft: '1px solid var(--cds-border-subtle)',
                    padding: 16,
                    overflowY: 'auto',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--cds-text-secondary)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Помощник
                  </p>
                  <RequestAssistantSidebar
                    requestId={data.request.id}
                    organizationId={data.request.organization_id ?? undefined}
                    aiAnalysis={data.request.ai_analysis}
                    tz={data.request.ai_tz}
                    onTzUpdated={reloadRequest}
                    onGoToExecution={goToExecution}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
