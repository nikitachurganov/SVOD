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
  InlineNotification,
  Loading,
  DataTableSkeleton,
} from '@carbon/react';
import { Add, TrashCan, View } from '@carbon/react/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteRequest,
  getRequests,
  type RequestResponse,
} from '../shared/api/requests.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';

const statusMap: Record<RequestResponse['status'], { kind: string; label: string }> = {
  open: { kind: 'blue', label: 'Открыта' },
  closed: { kind: 'red', label: 'Закрыта' },
};

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

export const RequestsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const loadRequests = useCallback(() => {
    setLoading(true);
    getRequests(activeOrganization?.id)
      .then((data) => {
        setRequests(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeOrganization?.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently handled — user sees the row stay
    } finally {
      setDeletingId(null);
    }
  }, []);

  const rows = useMemo(
    () =>
      requests.map((r) => ({
        id: r.id,
        title: r.title,
        ai_summary: r.ai_summary?.summary ?? null,
        created_at: r.created_at,
        author: r.author ? buildDisplayName(r.author) : 'Неизвестный автор',
        updated_at: r.updated_at,
        status: r.status,
        actions: r.id,
      })),
    [requests],
  );

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

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
          return <span style={{ color: 'var(--cds-text-placeholder, #a8a8a8)' }}>Нет описания</span>;
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
        const view = statusMap[cellValue as RequestResponse['status']];
        return (
          <Tag type={view.kind as 'blue' | 'red'} size="sm">
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
            <Button
              kind="danger--ghost"
              size="sm"
              renderIcon={TrashCan}
              iconDescription="Удалить"
              hasIconOnly
              disabled={deletingId === (cellValue as string)}
              onClick={() => handleDelete(cellValue as string)}
            />
          </div>
        );

      default:
        return cellValue as string;
    }
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
      {error ? (
        <div style={{ padding: 16 }}>
          <InlineNotification
            kind="error"
            title="Ошибка загрузки"
            subtitle={error}
            lowContrast
            actions={
              <Button kind="ghost" size="sm" onClick={loadRequests}>
                Повторить
              </Button>
            }
          />
        </div>
      ) : loading ? (
        <div style={{ padding: 16 }}>
          <DataTableSkeleton headers={HEADERS} rowCount={8} columnCount={HEADERS.length} />
        </div>
      ) : (
        <DataTable rows={paginatedRows} headers={HEADERS} isSortable>
          {({
            rows: carbonRows,
            headers,
            getTableProps,
            getHeaderProps,
            getRowProps,
          }: {
            rows: { id: string; cells: { id: string; info: { header: string }; value: unknown }[] }[];
            headers: { key: string; header: string }[];
            getTableProps: () => Record<string, unknown>;
            getHeaderProps: (opts: { header: { key: string; header: string } }) => Record<string, unknown>;
            getRowProps: (opts: { row: { id: string } }) => Record<string, unknown>;
          }) => (
            <TableContainer
              title="Реестр заявок"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
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
                          Заявок пока нет. Создайте первую!
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
    </div>
  );
};
