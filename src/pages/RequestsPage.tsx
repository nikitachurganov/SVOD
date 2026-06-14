import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Tag, Tooltip, Button, Modal, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteRequest,
  getRequests,
  type RequestResponse,
} from '../shared/api/requests.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';

const statusMap: Record<string, { color: string; label: string }> = {
  open: { color: 'blue', label: 'Открыта' },
  closed: { color: 'red', label: 'Закрыта' },
  assigned: { color: 'cyan', label: 'У исполнителя' },
};

const defaultStatusView = (raw: string) => ({
  color: 'default',
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

type RequestRow = {
  id: string;
  title: string;
  ai_summary: string | null;
  created_at: string;
  author: string;
  updated_at: string;
  status: string;
};

type RequestsTabKey = 'open' | 'in_progress' | 'closed' | 'archive';

const TAB_ORDER: RequestsTabKey[] = ['open', 'in_progress', 'closed', 'archive'];

const EMPTY_MESSAGE: Record<RequestsTabKey, string> = {
  open: 'Нет новых заявок.',
  in_progress: 'Нет заявок в работе.',
  closed: 'Нет закрытых заявок.',
  archive: 'Архивных заявок пока нет.',
};

const TAB_LABELS: Record<RequestsTabKey, string> = {
  open: 'Новые',
  in_progress: 'В работе',
  closed: 'Закрытые',
  archive: 'Архив',
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
  }, [loadRequests]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteRequest(id);
        notifySuccess('Заявка перемещена в архив');
        setActiveTab('archive');
        await loadRequests('archive');
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
    [loadRequests, notifySuccess, notifyError],
  );

  const resolveAuthorName = useCallback((r: RequestResponse): string => {
    if (r.author) return buildDisplayName(r.author);
    const authorPerson = r.people?.find((p) => p.role === 'author');
    if (authorPerson) return authorPerson.name;
    if (r.applicant_name) return r.applicant_name;
    return 'Неизвестный автор';
  }, []);

  const rows = useMemo<RequestRow[]>(
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
        };
      }),
    [requests, resolveAuthorName],
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize]);

  const isArchive = activeTab === 'archive';

  const columns = useMemo<ColumnsType<RequestRow>>(
    () => [
      {
        title: 'Название заявки',
        dataIndex: 'title',
        key: 'title',
        sorter: (a, b) => a.title.localeCompare(b.title, 'ru'),
        render: (title: string, record) => (
          <Link to={`/requests/${record.id}`} style={{ fontWeight: 500 }}>
            {title}
          </Link>
        ),
      },
      {
        title: 'Описание',
        dataIndex: 'ai_summary',
        key: 'ai_summary',
        sorter: (a, b) => (a.ai_summary ?? '').localeCompare(b.ai_summary ?? '', 'ru'),
        render: (text: string | null) => {
          if (!text) {
            return <span style={{ color: 'var(--app-text-placeholder)' }}>Нет описания</span>;
          }
          return (
            <Tooltip title={text}>
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
        },
      },
      {
        title: 'Номер заявки',
        dataIndex: 'id',
        key: 'id',
        sorter: (a, b) => a.id.localeCompare(b.id),
      },
      {
        title: 'Дата создания',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Автор',
        dataIndex: 'author',
        key: 'author',
        sorter: (a, b) => a.author.localeCompare(b.author, 'ru'),
      },
      {
        title: 'Дата изменения',
        dataIndex: 'updated_at',
        key: 'updated_at',
        sorter: (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        sorter: (a, b) => a.status.localeCompare(b.status, 'ru'),
        render: (value: string) => {
          const view = statusMap[value] ?? defaultStatusView(value);
          return <Tag color={view.color}>{view.label}</Tag>;
        },
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 100,
        render: (_, record) => (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              title="Открыть"
              onClick={() => navigate(`/requests/${record.id}`)}
            />
            {!isArchive && (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                title="Удалить"
                disabled={deletingId === record.id}
                onClick={() => setConfirmDeleteId(record.id)}
              />
            )}
          </div>
        ),
      },
    ],
    [deletingId, isArchive, navigate],
  );

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Заявки</h1>
          <Button
            type="primary"
            className="registry-page__create-btn"
            icon={<PlusOutlined />}
            onClick={() => navigate('/requests/create')}
          >
            Создать заявку
          </Button>
        </div>
        <div className="registry-page__tabs" role="tablist" aria-label="Фильтр заявок">
          {TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="registry-page__content">
        <Card className="registry-page__card">
          <Table<RequestRow>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            locale={{ emptyText: EMPTY_MESSAGE[activeTab] }}
            pagination={{
              current: page,
              pageSize,
              total: rows.length,
              pageSizeOptions: PAGE_SIZES,
              showSizeChanger: true,
              showTotal: (total, [min, max]) => `${min}–${max} из ${total}`,
              onChange: (newPage, newSize) => {
                setPage(newPage);
                setPageSize(newSize);
              },
            }}
            size="middle"
          />
        </Card>
      </div>

      <Modal
        open={!!confirmDeleteId}
        title="Переместить в архив?"
        okText="В архив"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        onCancel={() => setConfirmDeleteId(null)}
        onOk={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
      >
        <p>Заявка будет перемещена в архив. Её можно будет найти во вкладке «Архив».</p>
      </Modal>
    </div>
  );
};