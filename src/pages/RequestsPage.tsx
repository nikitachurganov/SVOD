import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Tag, Tooltip, Button, Modal, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, EyeOutlined, UserAddOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { IconDefaultButton } from '../shared/ui/IconDefaultButton';
import {
  deleteRequest,
  getRequests,
  takeRequest,
  type RequestResponse,
} from '../shared/api/requests.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';
import {
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_LABELS,
  type WorkflowStatus,
} from '../types/requestWorkflow';

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
  workflow_status: string;
  responsible: string | null;
  can_delete: boolean;
  can_take: boolean;
};

type RequestsTabKey = 'free' | 'mine' | 'open' | 'in_progress' | 'closed' | 'archive';

const TAB_ORDER: RequestsTabKey[] = ['free', 'mine', 'open', 'in_progress', 'closed', 'archive'];

const EMPTY_MESSAGE: Record<RequestsTabKey, string> = {
  free: 'Свободных заявок нет — все взяты в работу.',
  mine: 'Вы пока не ответственный ни за одну заявку.',
  open: 'Нет новых заявок.',
  in_progress: 'Нет заявок в работе.',
  closed: 'Нет закрытых заявок.',
  archive: 'Архивных заявок пока нет.',
};

const TAB_LABELS: Record<RequestsTabKey, string> = {
  free: 'Свободные',
  mine: 'Мои в работе',
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
  const [activeTab, setActiveTab] = useState<RequestsTabKey>('free');

  const loadRequests = useCallback(
    (tab: RequestsTabKey = activeTab) => {
      setLoading(true);
      const filters: Parameters<typeof getRequests>[1] = { archived: false };
      switch (tab) {
        case 'archive':
          filters.archived = true;
          break;
        case 'free':
          filters.free = true;
          break;
        case 'mine':
          filters.mine_responsible = true;
          filters.workflow_status = ['planning', 'waiting_info', 'in_progress', 'completed'];
          break;
        case 'open':
          filters.workflow_status = ['draft', 'new', 'waiting_info', 'planning'];
          break;
        case 'in_progress':
          filters.workflow_status = ['in_progress'];
          break;
        case 'closed':
          filters.workflow_status = ['completed', 'closed', 'cancelled'];
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

  const [takingId, setTakingId] = useState<string | null>(null);

  const handleTake = useCallback(
    async (id: string) => {
      setTakingId(id);
      try {
        await takeRequest(id);
        notifySuccess('Вы ответственный за заявку');
        navigate(`/requests/${id}`);
      } catch (err) {
        const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        notifyError(
          'Не удалось взять заявку',
          typeof detail === 'string' ? detail : err instanceof Error ? err.message : undefined,
        );
        await loadRequests();
      } finally {
        setTakingId(null);
      }
    },
    [loadRequests, navigate, notifySuccess, notifyError],
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
          workflow_status: r.workflow_status ?? 'new',
          responsible: r.responsible_user ? buildDisplayName(r.responsible_user) : null,
          can_delete: Boolean(r.permissions?.can_delete),
          can_take: Boolean(r.permissions?.can_take),
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
        dataIndex: 'workflow_status',
        key: 'workflow_status',
        sorter: (a, b) => a.workflow_status.localeCompare(b.workflow_status, 'ru'),
        render: (value: string) => {
          const normalized = value as WorkflowStatus;
          const view = WORKFLOW_STATUS_LABELS[normalized]
            ? { color: WORKFLOW_STATUS_COLORS[normalized], label: WORKFLOW_STATUS_LABELS[normalized] }
            : defaultStatusView(value);
          return <Tag color={view.color}>{view.label}</Tag>;
        },
      },
      {
        title: 'Ответственный',
        dataIndex: 'responsible',
        key: 'responsible',
        render: (value: string | null) =>
          value ?? <span style={{ color: 'var(--app-text-secondary)' }}>—</span>,
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 150,
        render: (_, record) => (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {!isArchive && record.can_take && (
              <Button
                size="small"
                type="primary"
                icon={<UserAddOutlined />}
                loading={takingId === record.id}
                disabled={takingId !== null && takingId !== record.id}
                onClick={() => void handleTake(record.id)}
              >
                Взять
              </Button>
            )}
            <IconDefaultButton
              icon={<EyeOutlined />}
              title="Открыть"
              aria-label="Открыть"
              onClick={() => navigate(`/requests/${record.id}`)}
            />
            {!isArchive && record.can_delete && (
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
    [deletingId, handleTake, isArchive, navigate, takingId],
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
