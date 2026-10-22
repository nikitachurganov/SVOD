import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';

import {
  archiveSurvey,
  getSurveys,
  getSurveysCounts,
  type SurveyListItem,
  type SurveysCounts,
  type SurveyStatus,
} from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';
import { buildDisplayName } from '../shared/utils/userName';
import {
  SURVEY_STATUS_COLOR,
  SURVEY_STATUS_LABEL,
  formatSurveyDate,
  pluralizeResponses,
} from './surveyStatus';

type TabKey = 'all' | 'mine' | 'open' | 'draft' | 'closed' | 'archived';

const TAB_ORDER: TabKey[] = ['all', 'mine', 'open', 'draft', 'closed', 'archived'];

const TAB_LABELS: Record<TabKey, string> = {
  all: 'Все',
  mine: 'Мои',
  open: 'Открытые',
  draft: 'Черновики',
  closed: 'Закрытые',
  archived: 'Архив',
};

const EMPTY_MESSAGE: Record<TabKey, string> = {
  all: 'Опросов пока нет. Создайте первый — ИИ подберёт методики и соберёт анкету.',
  mine: 'Вы ещё не создавали опросов.',
  open: 'Нет опросов, которые принимают ответы.',
  draft: 'Нет черновиков.',
  closed: 'Нет закрытых опросов.',
  archived: 'Архив пуст.',
};

const DEFAULT_COUNTS: SurveysCounts = {
  all: 0,
  mine: 0,
  open: 0,
  draft: 0,
  closed: 0,
  archived: 0,
};

const PAGE_SIZES = [20, 50, 100];

export const SurveysPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const organizationId = activeOrganization?.id ?? null;

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<SurveysCounts>(DEFAULT_COUNTS);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const loadCounts = useCallback(() => {
    if (!organizationId) return;
    getSurveysCounts(organizationId)
      .then(setCounts)
      .catch(() => {
        // Counters are not critical
      });
  }, [organizationId]);

  const loadSurveys = useCallback(
    (tab: TabKey = activeTab) => {
      if (!organizationId) {
        setSurveys([]);
        setLoading(false);
        return Promise.resolve();
      }
      setLoading(true);
      const status: SurveyStatus | undefined =
        tab === 'open' || tab === 'draft' || tab === 'closed' || tab === 'archived'
          ? tab
          : undefined;
      return getSurveys(organizationId, { status, mine: tab === 'mine' })
        .then(setSurveys)
        .catch((err: unknown) =>
          notifyError(
            'Не удалось загрузить опросы',
            err instanceof Error ? err.message : undefined,
          ),
        )
        .finally(() => setLoading(false));
    },
    [organizationId, activeTab, notifyError],
  );

  useEffect(() => {
    void loadSurveys();
    loadCounts();
  }, [loadSurveys, loadCounts]);

  const handleArchive = async (id: string) => {
    setArchiving(true);
    try {
      await archiveSurvey(id);
      notifySuccess('Опрос перемещён в архив');
      await loadSurveys();
      loadCounts();
    } catch (err) {
      notifyError(
        'Не удалось переместить опрос в архив',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setArchiving(false);
      setConfirmArchiveId(null);
    }
  };

  const columns = useMemo<ColumnsType<SurveyListItem>>(
    () => [
      {
        title: 'Название',
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => a.name.localeCompare(b.name, 'ru'),
        render: (name: string, record) => (
          <div>
            <Link to={`/surveys/${record.id}`} style={{ fontWeight: 500 }}>
              {name}
            </Link>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
              {record.questions_count} вопр.
            </div>
          </div>
        ),
      },
      {
        title: 'Методики',
        key: 'methodologies',
        render: (_, record) =>
          record.methodology_names.length === 0 ? (
            <span style={{ color: 'var(--app-text-secondary)' }}>—</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {record.category_name && <Tag color="blue">{record.category_name}</Tag>}
              {record.methodology_names.map((name) => (
                <Tag key={name}>{name.replace(/\s*\(.*\)$/, '')}</Tag>
              ))}
            </div>
          ),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: SurveyStatus) => (
          <Tag color={SURVEY_STATUS_COLOR[status]}>{SURVEY_STATUS_LABEL[status]}</Tag>
        ),
      },
      {
        title: 'Ответы',
        dataIndex: 'responses_count',
        key: 'responses_count',
        width: 110,
        sorter: (a, b) => a.responses_count - b.responses_count,
        render: (n: number) => pluralizeResponses(n),
      },
      {
        title: 'Последний ответ',
        dataIndex: 'last_response_at',
        key: 'last_response_at',
        width: 150,
        sorter: (a, b) =>
          new Date(a.last_response_at ?? 0).getTime() - new Date(b.last_response_at ?? 0).getTime(),
        render: (value: string | null) =>
          value ? (
            formatSurveyDate(value)
          ) : (
            <span style={{ color: 'var(--app-text-secondary)' }}>—</span>
          ),
      },
      {
        title: 'Автор',
        key: 'author',
        render: (_, record) =>
          record.author ? buildDisplayName(record.author) : 'Неизвестный автор',
      },
      {
        title: 'Создан',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string) => formatSurveyDate(value),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 96,
        render: (_, record) =>
          record.status === 'archived' ? (
            <span style={{ color: 'var(--app-text-secondary)' }}>—</span>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                title="Изменить"
                onClick={() => navigate(`/surveys/${record.id}/edit`)}
              />
              <Button
                type="text"
                size="small"
                icon={<InboxOutlined />}
                title="Переместить в архив"
                onClick={() => setConfirmArchiveId(record.id)}
              />
            </div>
          ),
      },
    ],
    [navigate],
  );

  const tabCount = (key: TabKey): number => (key === 'archived' ? counts.archived : counts[key]);

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Опросы</h1>
          <Button
            type="primary"
            className="registry-page__create-btn"
            icon={<PlusOutlined />}
            onClick={() => navigate('/surveys/create')}
          >
            Создать опрос
          </Button>
        </div>
        <div className="registry-page__tabs" role="tablist" aria-label="Фильтр опросов">
          {TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {TAB_LABELS[key]} ({tabCount(key)})
            </button>
          ))}
        </div>
      </div>

      <div className="registry-page__content">
        <Card className="registry-page__card">
          <Table<SurveyListItem>
            rowKey="id"
            columns={columns}
            dataSource={surveys}
            loading={loading}
            locale={{ emptyText: EMPTY_MESSAGE[activeTab] }}
            pagination={{
              defaultPageSize: PAGE_SIZES[0],
              pageSizeOptions: PAGE_SIZES,
              showSizeChanger: true,
              showTotal: (total, [min, max]) => `${min}–${max} из ${total}`,
            }}
            size="middle"
            scroll={{ x: 'max-content' }}
          />
        </Card>
      </div>

      <Modal
        open={!!confirmArchiveId}
        title="Переместить в архив?"
        okText="В архив"
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: archiving }}
        onCancel={() => setConfirmArchiveId(null)}
        onOk={() => confirmArchiveId && void handleArchive(confirmArchiveId)}
      >
        <p>
          Опрос перестанет принимать ответы, ссылка для респондентов перестанет работать.
          Собранные ответы сохранятся.
        </p>
      </Modal>
    </div>
  );
};
