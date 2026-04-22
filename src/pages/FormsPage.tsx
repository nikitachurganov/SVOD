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
  DataTableSkeleton,
  Modal,
  Tabs,
  TabList,
  Tab,
} from '@carbon/react';
import { Add, Archive, Edit } from '@carbon/react/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteForm,
  getForms,
  getFormsCounts,
  type FormResponse,
  type FormsCounts,
} from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/context/organization.context';
import { useNotifications } from '../shared/context/notifications.context';

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

type FormsTabKey = 'all' | 'mine' | 'unused' | 'archive';

const TAB_ORDER: FormsTabKey[] = ['all', 'mine', 'unused', 'archive'];

const EMPTY_MESSAGE: Record<FormsTabKey, string> = {
  all: 'Активных форм пока нет.',
  mine: 'У вас пока нет созданных форм.',
  unused: 'Нет форм без заявок.',
  archive: 'Архивных форм пока нет.',
};

const DEFAULT_COUNTS: FormsCounts = { all: 0, mine: 0, unused: 0, archived: 0 };

export const FormsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [activeTab, setActiveTab] = useState<FormsTabKey>('all');
  const [counts, setCounts] = useState<FormsCounts>(DEFAULT_COUNTS);

  const loadCounts = useCallback(() => {
    getFormsCounts(activeOrganization?.id)
      .then(setCounts)
      .catch(() => {
        // Счётчики не критичны, молча игнорируем ошибку.
      });
  }, [activeOrganization?.id]);

  const loadForms = useCallback(
    (tab: FormsTabKey = activeTab) => {
      setLoading(true);
      return getForms(activeOrganization?.id, {
        archived: tab === 'archive' ? true : false,
        mine: tab === 'mine',
        unused: tab === 'unused',
      })
        .then((data) => {
          setForms(data);
        })
        .catch((err: unknown) =>
          notifyError(
            'Не удалось загрузить формы',
            err instanceof Error ? err.message : undefined,
          ),
        )
        .finally(() => setLoading(false));
    },
    [activeOrganization?.id, activeTab, notifyError],
  );

  useEffect(() => {
    loadForms();
    loadCounts();
  }, [loadForms, loadCounts]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteForm(id);
        notifySuccess('Форма перемещена в архив');
        setActiveTab('archive');
        await loadForms('archive');
        loadCounts();
      } catch (err) {
        notifyError(
          'Не удалось переместить форму в архив',
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    },
    [loadForms, loadCounts, notifySuccess, notifyError],
  );

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

  const isArchive = activeTab === 'archive';

  const renderCell = (key: string, value: unknown, rowId: string) => {
    switch (key) {
      case 'name':
        return <Link to={`/forms/${rowId}`} style={{ fontWeight: 500 }}>{value as string}</Link>;
      case 'created_at':
        return formatDate(value as string);
      case 'actions':
        if (isArchive) {
          return <span style={{ color: 'var(--cds-text-secondary)' }}>—</span>;
        }
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button kind="ghost" size="sm" renderIcon={Edit} iconDescription="Изменить" hasIconOnly onClick={() => navigate(`/forms/${value}/edit`)} />
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Archive}
              iconDescription="Переместить в архив"
              hasIconOnly
              disabled={deletingId === (value as string)}
              onClick={() => setConfirmDeleteId(value as string)}
            />
          </div>
        );
      default:
        return value as string;
    }
  };

  const tabLabel = (key: FormsTabKey, label: string): string => {
    const count =
      key === 'all'
        ? counts.all
        : key === 'mine'
          ? counts.mine
          : key === 'unused'
            ? counts.unused
            : counts.archived;
    return `${label} (${count})`;
  };

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {loading ? (
        <div style={{ padding: 16 }}>
          <DataTableSkeleton headers={HEADERS} rowCount={8} columnCount={HEADERS.length} />
        </div>
      ) : (
        <DataTable rows={paginatedRows} headers={HEADERS} isSortable>
          {({ rows: carbonRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer title="Реестр форм" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div
                style={{
                  background: 'var(--cds-layer-01)',
                  borderBottom: '1px solid var(--cds-border-subtle)',
                }}
              >
                <Tabs selectedIndex={TAB_ORDER.indexOf(activeTab)}>
                  <TabList aria-label="Фильтр форм">
                    <Tab onClick={() => setActiveTab('all')}>{tabLabel('all', 'Все')}</Tab>
                    <Tab onClick={() => setActiveTab('mine')}>{tabLabel('mine', 'Мои')}</Tab>
                    <Tab onClick={() => setActiveTab('unused')}>{tabLabel('unused', 'Неиспользуемые')}</Tab>
                    <Tab onClick={() => setActiveTab('archive')}>{tabLabel('archive', 'Архив')}</Tab>
                  </TabList>
                </Tabs>
              </div>
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
                      <TableRow>
                        <TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>
                          {EMPTY_MESSAGE[activeTab]}
                        </TableCell>
                      </TableRow>
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
        <Modal open danger modalHeading="Переместить в архив?" primaryButtonText="В архив" secondaryButtonText="Отмена" onRequestClose={() => setConfirmDeleteId(null)} onRequestSubmit={() => void handleDelete(confirmDeleteId)} size="xs">
          <p>Форма будет перемещена в архив. Её можно будет найти во вкладке «Архив».</p>
        </Modal>
      )}
    </div>
  );
};
