import { useEffect, useState } from 'react';
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
import { ArrowLeft, ChevronLeft, ChevronRight, Document, Download } from '@carbon/react/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRegisterAuxiliaryPanelCloser } from '../shared/context/appShellPanels.context';
import { getRequestWithForm, type RequestWithForm } from '../services/requestService';
import { closeRequest, deleteRequest } from '../shared/api/requests.api';
import { formatFieldValue } from '../shared/utils/formatFieldValue';
import { buildDisplayName } from '../shared/utils/userName';
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

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

export const RequestViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const showAiPanel = useMediaQuery('(min-width: 1200px)');
  const [rightAuxiliaryPanelOpen, setRightAuxiliaryPanelOpen] = useState(true);

  useRegisterAuxiliaryPanelCloser(
    () => setRightAuxiliaryPanelOpen(false),
    showAiPanel,
  );

  const [{ data, loading, error }, setState] = useState<RequestDetailsState>({
    data: null,
    loading: true,
    error: null,
  });
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [inlineNotification, setInlineNotification] = useState<{
    kind: 'success' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const load = async () => {
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
    };

    void load();
  }, [id]);

  const pageTitle = data?.request ? data.request.title : 'Загрузка заявки…';
  const formTitle = data?.form?.title ?? '—';

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
      const updatedRequest = await closeRequest(data.request.id);
      setState((prev) =>
        prev.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                request: {
                  ...prev.data.request,
                  status: updatedRequest.status,
                  closedAt: updatedRequest.closedAt,
                  updated_at: updatedRequest.updated_at,
                },
              },
            }
          : prev,
      );
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
    return 'warm-gray';
  };

  const statusLabel = (status: string) => {
    if (status === 'closed') return 'Закрыта';
    if (status === 'open') return 'Открыта';
    return 'В работе';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--cds-layer)',
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
            {showAiPanel && (
              <Tooltip
                label={
                  rightAuxiliaryPanelOpen
                    ? 'Скрыть правую панель'
                    : 'Показать правую панель'
                }
                align="bottom"
              >
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={rightAuxiliaryPanelOpen ? ChevronRight : ChevronLeft}
                  iconDescription={
                    rightAuxiliaryPanelOpen
                      ? 'Скрыть правую панель'
                      : 'Показать правую панель'
                  }
                  onClick={() => setRightAuxiliaryPanelOpen((o) => !o)}
                />
              </Tooltip>
            )}
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
              {data.request.author ? (
                <span>
                  <span style={{ fontSize: 13 }}>{buildDisplayName(data.request.author)}</span>
                  <br />
                  <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                    {data.request.author.email}
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: 13 }}>Неизвестный автор</span>
              )}
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
                  <Tab>История</Tab>
                  <Tab disabled>Люди</Tab>
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
                                                  background: 'var(--cds-layer)',
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
                                                  background: 'var(--cds-layer)',
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
                    </div>
                  </TabPanel>

                  {/* History tab */}
                  <TabPanel>
                    <div style={{ paddingTop: 16 }}>
                      {data?.request && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            paddingLeft: 24,
                          }}
                        >
                          {/* Timeline line */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 7,
                              top: 6,
                              bottom: 6,
                              width: 2,
                              background: 'var(--cds-border-subtle)',
                            }}
                          />

                          {/* Created event */}
                          <div style={{ position: 'relative', paddingBottom: 24 }}>
                            <div
                              style={{
                                position: 'absolute',
                                left: -20,
                                top: 4,
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: 'var(--cds-icon-primary)',
                                border: '2px solid var(--cds-layer)',
                              }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 500 }}>Заявка создана</span>
                              <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                {formatDateTime(data.request.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* Closed event */}
                          {data.request.status === 'closed' && data.request.closedAt && (
                            <div style={{ position: 'relative', paddingBottom: 24 }}>
                              <div
                                style={{
                                  position: 'absolute',
                                  left: -20,
                                  top: 4,
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  background: 'var(--cds-icon-primary)',
                                  border: '2px solid var(--cds-layer)',
                                }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontWeight: 500 }}>Заявка закрыта</span>
                                <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                  {formatDateTime(data.request.closedAt)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </TabPanel>

                  {/* People tab (disabled placeholder) */}
                  <TabPanel>
                    <span style={{ color: 'var(--cds-text-secondary)' }}>
                      Раздел находится в разработке.
                    </span>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>

            {/* Right: AI suggestions panel (hidden on smaller screens) */}
            {showAiPanel && rightAuxiliaryPanelOpen && (
              <div
                style={{
                  width: 360,
                  flexShrink: 0,
                  height: '100%',
                }}
              >
                <div
                  style={{
                    background: 'var(--cds-layer)',
                    height: '100%',
                    borderLeft: '1px solid var(--cds-border-subtle)',
                    padding: 16,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                    <Tile style={{ padding: 16 }}>
                      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
                        Чего не хватает
                      </span>
                      <span style={{ color: 'var(--cds-text-secondary)', display: 'block' }}>
                        ИИ может проанализировать заявку и подсказать, какой информации может не
                        хватать или что может быть непонятно исполнителям.
                      </span>
                      <hr
                        style={{
                          border: 'none',
                          borderTop: '1px solid var(--cds-border-subtle)',
                          margin: '12px 0',
                        }}
                      />
                      <span style={{ color: 'var(--cds-text-secondary)', display: 'block' }}>
                        Заглушка: здесь будут отображаться недостающие детали и подсказки для уточнения.
                      </span>
                    </Tile>

                    <Tile style={{ padding: 16 }}>
                      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
                        Генерация ТЗ
                      </span>
                      <span style={{ color: 'var(--cds-text-secondary)', display: 'block' }}>
                        Сформировать техническое задание для исполнителя на основе информации из
                        заявки.
                      </span>
                      <hr
                        style={{
                          border: 'none',
                          borderTop: '1px solid var(--cds-border-subtle)',
                          margin: '12px 0',
                        }}
                      />
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={() => setAiMessage('Генерация ТЗ будет доступна позже')}
                      >
                        Сгенерировать ТЗ
                      </Button>
                      {aiMessage && (
                        <div style={{ marginTop: 8 }}>
                          <InlineNotification
                            kind="info"
                            subtitle={aiMessage}
                            lowContrast
                            onCloseButtonClick={() => setAiMessage(null)}
                          />
                        </div>
                      )}
                    </Tile>

                    <Tile style={{ padding: 16 }}>
                      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
                        Кому перенаправить
                      </span>
                      <span style={{ color: 'var(--cds-text-secondary)', display: 'block' }}>
                        ИИ может предложить, кому лучше передать эту заявку на исполнение.
                      </span>
                      <hr
                        style={{
                          border: 'none',
                          borderTop: '1px solid var(--cds-border-subtle)',
                          margin: '12px 0',
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[
                          { initials: 'АК', name: 'Алексей Ковалев', role: 'Backend‑разработчик' },
                          { initials: 'МС', name: 'Мария Смирнова', role: 'QA / Автоматизация' },
                          { initials: 'ИД', name: 'Иван Демидов', role: 'DevOps‑инженер' },
                        ].map((person) => (
                          <div
                            key={person.initials}
                            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: 'var(--cds-interactive)',
                                color: 'var(--cds-text-on-color)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {person.initials}
                            </div>
                            <div>
                              <span style={{ display: 'block' }}>{person.name}</span>
                              <span style={{ color: 'var(--cds-text-secondary)', fontSize: 12 }}>
                                {person.role}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Tile>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
