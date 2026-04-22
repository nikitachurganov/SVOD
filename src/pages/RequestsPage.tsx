import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  Pagination,
  Tag,
  Tooltip,
  Button,
  DataTableSkeleton,
  Modal,
  Tabs,
  TabList,
  Tab,
} from '@carbon/react';
import { Add, TrashCan, View } from '@carbon/react/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteRequest,
  getRequests,
  getRequestsCounts,
  type RequestResponse,
  type RequestsCounts,
} from '../shared/api/requests.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';
import { useNotifications } from '../shared/context/notifications.context';

const statusMap: Record<string, { kind: string; label: string }> = {
  open: { kind: 'blue', label: 'Открыта' },
  closed: { kind: 'red', label: 'Закрыта' },
  assigned: { kind: 'teal', label: 'У исполнителя' },
};

const defaultStatusView = (raw: string) => ({
  kind: 'warm-gray',
  label: raw || '—',
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAGE_SIZES = [20, 50, 100];

const HEADERS = [
  { key: 'title', header: 'Название заявки' },
  { key: 'ai_summary', header: 'Описание' },
  { key: 'id', header: 'Номер заявки' },
  { key: 'created_at', header: 'Дата создания' },
  { key: 'author', header: 'Автор' },
  { key: 'updated_at', header: 'Дата изменения' },
  { key: 'status', header: 'Статус' },
  { key: 'actions', header: 'Действия' },
];

type RequestsTabKey = 'open' | 'in_progress' | 'closed' | 'archive';

const TAB_ORDER: RequestsTabKey[] = ['open', 'in_progress', 'closed', 'archive'];

const EMPTY_MESSAGE: Record<RequestsTabKey, string> = {
  open: 'Нет открытых заявок.',
  in_progress: 'Нет заявок в работе.',
  closed: 'Нет закрытых заявок.',
  archive: 'Архивных заявок пока нет.',
};

const DEFAULT_COUNTS: RequestsCounts = {
  open: 0,
  in_progress: 0,
  closed: 0,
  archived: 0,
};

export const RequestsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();

  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [activeTab, setActiveTab] = useState<RequestsTabKey>('open');
  const [counts, setCounts] = useState<RequestsCounts>(DEFAULT_COUNTS);

  const loadCounts = useCallback(() => {
    getRequestsCounts(activeOrganization?.id)
      .then(setCounts)
      .catch(() => {
        // Счётчики не критичны, молча игнорируем ошибку.
      });
  }, [activeOrganization?.id]);

  const loadRequests = useCallback(
    (tab: RequestsTabKey = activeTab) => {
      setLoading(true);
      const filters: Parameters<typeof getRequests>[1] = { archived: false };
      switch (tab) {
        case 'archive':
          filters.archived = true;
          break;
        case 'open':
          filters.status = 'open';
          break;
        case 'in_progress':
          filters.status = 'assigned';
          break;
        case 'closed':
          filters.status = 'closed';
          break;
      }
      return getRequests(activeOrganization?.id, filters)
        .then((data) => {
          setRequests(data);
        })
        .catch((err: unknown) => {
          notifyError(
            'Не удалось загрузить заявки',
            err instanceof Error ? err.message : undefined,
          );
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [activeOrganization?.id, activeTab, notifyError],
  );

  useEffect(() => {
    loadRequests();
    loadCounts();
  }, [loadRequests, loadCounts]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteRequest(id);
        notifySuccess('Заявка перемещена в архив');
        setActiveTab('archive');
        await loadRequests('archive');
        loadCounts();
      } catch (err) {
        notifyError(
          'Не удалось переместить заявку в архив',
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    },
    [loadRequests, loadCounts, notifySuccess, notifyError],
  );

  const resolveAuthorName = useCallback((r: RequestResponse): string => {
    if (r.author) return buildDisplayName(r.author);
    const authorPerson = r.people?.find((p) => p.role === 'author');
    if (authorPerson) return authorPerson.name;
    if (r.applicant_name) return r.applicant_name;
    return 'Неизвестный автор';
  }, []);

  const rows = useMemo(
    () =>
      requests.map((r) => {
        const raw = r.ai_summary?.summary ?? '';
        const summary = raw.replace(/^SUCCESS\s*/i, '').trim() || null;
        return {
          id: r.id,
          title: r.title,
          ai_summary: summary,
          created_at: r.created_at,
          author: resolveAuthorName(r),
          updated_at: r.updated_at,
          status: r.status,
          actions: r.id,
        };
      }),
    [requests, resolveAuthorName],
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const isArchive = activeTab === 'archive';

  const renderCell = (cellKey: string, cellValue: unknown, rowId: string) => {
    switch (cellKey) {
      case 'title':
        return (
          <Link to={`/requests/${rowId}`} style={{ fontWeight: 500 }}>
            {cellValue as string}
          </Link>
        );

      case 'ai_summary': {
        const text = cellValue as string | null;
        if (!text) {
          return <span style={{ color: 'var(--cds-text-placeholder)' }}>Нет описания</span>;
        }
        return (
          <Tooltip label={text}>
            <span
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 350,
              }}
            >
              {text}
            </span>
          </Tooltip>
        );
      }

      case 'created_at':
      case 'updated_at':
        return formatDate(cellValue as string);

      case 'status': {
        const s = String(cellValue ?? '');
        const view = statusMap[s] ?? defaultStatusView(s);
        return (
          <Tag
            type={view.kind as 'blue' | 'red' | 'teal' | 'warm-gray'}
            size="sm"
          >
            {view.label}
          </Tag>
        );
      }

      case 'actions':
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={View}
              iconDescription="Открыть"
              hasIconOnly
              onClick={() => navigate(`/requests/${cellValue}`)}
            />
            {!isArchive && (
              <Button
                kind="danger--ghost"
                size="sm"
                renderIcon={TrashCan}
                iconDescription="Удалить"
                hasIconOnly
                disabled={deletingId === (cellValue as string)}
                onClick={() => setConfirmDeleteId(cellValue as string)}
              />
            )}
          </div>
        );

      default:
        return cellValue as string;
    }
  };

  const tabLabel = (key: RequestsTabKey, label: string): string => {
    const count =
      key === 'open'
        ? counts.open
        : key === 'in_progress'
          ? counts.in_progress
          : key === 'closed'
            ? counts.closed
            : counts.archived;
    return `${label} (${count})`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {loading ? (
        <div style={{ padding: 16 }}>
          <DataTableSkeleton headers={HEADERS} rowCount={8} columnCount={HEADERS.length} />
        </div>
      ) : (
        <DataTable rows={paginatedRows} headers={HEADERS} isSortable>
          {({ rows: carbonRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer
              title="Реестр заявок"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <div
                style={{
                  background: 'var(--cds-layer-01)',
                  borderBottom: '1px solid var(--cds-border-subtle)',
                }}
              >
                <Tabs selectedIndex={TAB_ORDER.indexOf(activeTab)}>
                  <TabList aria-label="Фильтр заявок">
                    <Tab onClick={() => setActiveTab('open')}>{tabLabel('open', 'Открытые')}</Tab>
                    <Tab onClick={() => setActiveTab('in_progress')}>
                      {tabLabel('in_progress', 'В работе')}
                    </Tab>
                    <Tab onClick={() => setActiveTab('closed')}>
                      {tabLabel('closed', 'Закрытые')}
                    </Tab>
                    <Tab onClick={() => setActiveTab('archive')}>{tabLabel('archive', 'Архив')}</Tab>
                  </TabList>
                </Tabs>
              </div>

              <TableToolbar>
                <TableToolbarContent>
                  <Button
                    renderIcon={Add}
                    iconDescription="Создать заявку"
                    onClick={() => navigate('/requests/create')}
                  >
                    Создать заявку
                  </Button>
                </TableToolbarContent>
              </TableToolbar>

              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <Table {...getTableProps()} size="lg" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => {
                        const { key: _key, ...headerProps } = getHeaderProps({ header });
                        return (
                          <TableHeader key={header.key} {...headerProps}>
                            {header.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {carbonRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>
                          {EMPTY_MESSAGE[activeTab]}
                        </TableCell>
                      </TableRow>
                    ) : (
                      carbonRows.map((row) => {
                        const { key: _key, ...rowProps } = getRowProps({ row });
                        return (
                          <TableRow key={row.id} {...rowProps}>
                            {row.cells.map((cell) => (
                              <TableCell key={cell.id}>
                                {renderCell(cell.info.header, cell.value, row.id)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                totalItems={rows.length}
                pageSize={pageSize}
                pageSizes={PAGE_SIZES}
                page={page}
                onChange={({
                  page: newPage,
                  pageSize: newSize,
                }: {
                  page: number;
                  pageSize: number;
                }) => {
                  setPage(newPage);
                  setPageSize(newSize);
                }}
                itemsPerPageText="Записей на странице:"
                pageRangeText={(_current: number, total: number) => `из ${total}`}
                itemRangeText={(min: number, max: number, total: number) =>
                  `${min}–${max} из ${total}`
                }
              />
            </TableContainer>
          )}
        </DataTable>
      )}

      {confirmDeleteId && (
        <Modal
          open
          danger
          modalHeading="Переместить в архив?"
          primaryButtonText="В архив"
          secondaryButtonText="Отмена"
          onRequestClose={() => setConfirmDeleteId(null)}
          onRequestSubmit={() => void handleDelete(confirmDeleteId)}
          size="xs"
        >
          <p>Заявка будет перемещена в архив. Её можно будет найти во вкладке «Архив».</p>
        </Modal>
      )}
    </div>
  );
};
