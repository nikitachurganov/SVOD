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
  Button,
  InlineNotification,
  DataTableSkeleton,
  Modal,
} from '@carbon/react';
import { Add, Edit, TrashCan } from '@carbon/react/icons';
import { Link, useNavigate } from 'react-router-dom';
import { deleteForm, getForms, type FormResponse } from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZES = [20, 50, 100];

const HEADERS = [
  { key: 'name', header: 'Название' },
  { key: 'author', header: 'Автор' },
  { key: 'created_at', header: 'Дата создания' },
  { key: 'actions', header: 'Действия' },
];

export const FormsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const loadForms = useCallback(() => {
    setLoading(true);
    getForms(activeOrganization?.id)
      .then((data) => { setForms(data); setError(null); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось загрузить формы'))
      .finally(() => setLoading(false));
  }, [activeOrganization?.id]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteForm(id);
      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch { /* silently handled */ } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }, []);

  const rows = useMemo(() => forms.map((f) => ({
    id: f.id,
    name: f.name,
    author: f.author ? buildDisplayName(f.author) : 'Неизвестный автор',
    created_at: f.created_at,
    actions: f.id,
  })), [forms]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const renderCell = (key: string, value: unknown, rowId: string) => {
    switch (key) {
      case 'name':
        return <Link to={`/forms/${rowId}`} style={{ fontWeight: 500 }}>{value as string}</Link>;
      case 'created_at':
        return formatDate(value as string);
      case 'actions':
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button kind="ghost" size="sm" renderIcon={Edit} iconDescription="Изменить" hasIconOnly onClick={() => navigate(`/forms/${value}/edit`)} />
            <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} iconDescription="Удалить" hasIconOnly disabled={deletingId === (value as string)} onClick={() => setConfirmDeleteId(value as string)} />
          </div>
        );
      default:
        return value as string;
    }
  };

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {error ? (
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <InlineNotification kind="error" title="Ошибка загрузки" subtitle={error} lowContrast />
          <Button kind="ghost" size="sm" onClick={loadForms}>
            Повторить
          </Button>
        </div>
      ) : loading ? (
        <div style={{ padding: 16 }}>
          <DataTableSkeleton headers={HEADERS} rowCount={8} columnCount={HEADERS.length} />
        </div>
      ) : (
        <DataTable rows={paginatedRows} headers={HEADERS} isSortable>
          {({ rows: carbonRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer title="Реестр форм" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <TableToolbar>
                <TableToolbarContent>
                  <Button renderIcon={Add} onClick={() => navigate('/forms/create')}>Создать форму</Button>
                </TableToolbarContent>
              </TableToolbar>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <Table {...getTableProps()} size="lg" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => { const { key: _k, ...hp } = getHeaderProps({ header: h }); return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>; })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {carbonRows.length === 0 ? (
                      <TableRow><TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>Форм пока нет. Создайте первую!</TableCell></TableRow>
                    ) : carbonRows.map((row) => {
                      const { key: _k, ...rp } = getRowProps({ row });
                      return <TableRow key={row.id} {...rp}>{row.cells.map((cell) => <TableCell key={cell.id}>{renderCell(cell.info.header, cell.value, row.id)}</TableCell>)}</TableRow>;
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination totalItems={rows.length} pageSize={pageSize} pageSizes={PAGE_SIZES} page={page} onChange={({ page: p, pageSize: s }: { page: number; pageSize: number }) => { setPage(p); setPageSize(s); }} itemsPerPageText="Записей на странице:" />
            </TableContainer>
          )}
        </DataTable>
      )}

      {confirmDeleteId && (
        <Modal open danger modalHeading="Удалить форму?" primaryButtonText="Удалить" secondaryButtonText="Отмена" onRequestClose={() => setConfirmDeleteId(null)} onRequestSubmit={() => void handleDelete(confirmDeleteId)} size="xs">
          <p>Это действие нельзя отменить.</p>
        </Modal>
      )}
    </div>
  );
};
