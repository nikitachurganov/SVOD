import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, InboxOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { IconDefaultButton } from '../shared/ui/IconDefaultButton';
import {
  deleteForm,
  getForms,
  getFormsCounts,
  type FormResponse,
  type FormsCounts,
} from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZES = [20, 50, 100];

type FormRow = {
  id: string;
  name: string;
  author: string;
  created_at: string;
};

type FormsTabKey = 'all' | 'mine' | 'unused' | 'archive';

const TAB_ORDER: FormsTabKey[] = ['all', 'mine', 'unused', 'archive'];

const TAB_LABELS: Record<FormsTabKey, string> = {
  all: 'Все',
  mine: 'Мои',
  unused: 'Неиспользуемые',
  archive: 'Архив',
};

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

  const rows = useMemo<FormRow[]>(() => forms.map((f) => ({
    id: f.id,
    name: f.name,
    author: f.author ? buildDisplayName(f.author) : 'Неизвестный автор',
    created_at: f.created_at,
  })), [forms]);

  const isArchive = activeTab === 'archive';

  const tabLabel = (key: FormsTabKey): string => {
    const count =
      key === 'all'
        ? counts.all
        : key === 'mine'
          ? counts.mine
          : key === 'unused'
            ? counts.unused
            : counts.archived;
    return `${TAB_LABELS[key]} (${count})`;
  };

  const columns = useMemo<ColumnsType<FormRow>>(
    () => [
      {
        title: 'Название',
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => a.name.localeCompare(b.name, 'ru'),
        render: (name: string, record) => (
          <Link to={`/forms/${record.id}`} style={{ fontWeight: 500 }}>{name}</Link>
        ),
      },
      {
        title: 'Автор',
        dataIndex: 'author',
        key: 'author',
        sorter: (a, b) => a.author.localeCompare(b.author, 'ru'),
      },
      {
        title: 'Дата создания',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 132,
        render: (_, record) => {
          if (isArchive) {
            return <span style={{ color: 'var(--app-text-secondary)' }}>—</span>;
          }
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <IconDefaultButton
                icon={<EyeOutlined />}
                title="Просмотр"
                aria-label="Просмотр"
                onClick={() => navigate(`/forms/${record.id}`)}
              />
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                title="Изменить"
                onClick={() => navigate(`/forms/${record.id}/edit`)}
              />
              <Button
                type="text"
                size="small"
                icon={<InboxOutlined />}
                title="Переместить в архив"
                disabled={deletingId === record.id}
                onClick={() => setConfirmDeleteId(record.id)}
              />
            </div>
          );
        },
      },
    ],
    [deletingId, isArchive, navigate],
  );

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Формы</h1>
          <Button
            type="primary"
            className="registry-page__create-btn"
            icon={<PlusOutlined />}
            onClick={() => navigate('/forms/create')}
          >
            Создать форму
          </Button>
        </div>
        <div className="registry-page__tabs" role="tablist" aria-label="Фильтр форм">
          {TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {tabLabel(key)}
            </button>
          ))}
        </div>
      </div>

      <div className="registry-page__content">
        <Card className="registry-page__card">
          <Table<FormRow>
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
        <p>Форма будет перемещена в архив. Её можно будет найти во вкладке «Архив».</p>
      </Modal>
    </div>
  );
};
