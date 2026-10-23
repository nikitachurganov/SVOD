import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Grid, Input, Modal, Result, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  archiveSurvey,
  getSurveyProject,
  getSurveys,
  getSurveysCounts,
  moveSurveyToProject,
  updateSurveyProject,
  type SurveyListItem,
  type SurveyProject,
  type SurveyProjectPayload,
  type SurveysCounts,
  type SurveyStatus,
} from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { MoveSurveyModal } from '../shared/ui/survey/MoveSurveyModal';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
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
  all: 'В проекте пока нет опросов.',
  mine: 'Вы ещё не создавали опросов в этом проекте.',
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

type ProjectState = 'loading' | 'ready' | 'missing' | 'error';

export const ProjectSurveysPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const { setEntityTitle } = useBreadcrumbEntity();
  const organizationId = activeOrganization?.id ?? null;

  const [project, setProject] = useState<SurveyProject | null>(null);
  const [projectState, setProjectState] = useState<ProjectState>('loading');
  const [renameOpen, setRenameOpen] = useState(false);

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<SurveysCounts>(DEFAULT_COUNTS);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [movingSurvey, setMovingSurvey] = useState<SurveyListItem | null>(null);
  const [search, setSearch] = useState('');
  const isMobile = Grid.useBreakpoint().md === false;

  const loadProject = useCallback(() => {
    if (!projectId) {
      setProjectState('missing');
      return;
    }
    setProjectState('loading');
    getSurveyProject(projectId)
      .then((loaded) => {
        setProject(loaded);
        setProjectState('ready');
      })
      .catch((err: unknown) => {
        const code = axios.isAxiosError(err) ? err.response?.status : undefined;
        // 404 — no such project; 403 — it is not the user's organization
        setProjectState(code === 404 || code === 403 ? 'missing' : 'error');
      });
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    setEntityTitle(project?.name ?? null);
  }, [project?.name, setEntityTitle]);

  // The project of another organization (the user switched it) is shown as not found
  const inActiveOrganization =
    !project || !organizationId || project.organization_id === organizationId;
  const ready = projectState === 'ready' && !!project && !!organizationId && inActiveOrganization;

  const visibleSurveys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? surveys.filter((s) => s.name.toLowerCase().includes(needle)) : surveys;
  }, [surveys, search]);

  const loadCounts = useCallback(() => {
    if (!organizationId || !projectId) return;
    getSurveysCounts(organizationId, projectId)
      .then(setCounts)
      .catch(() => {
        // Counters are not critical
      });
  }, [organizationId, projectId]);

  const loadSurveys = useCallback(
    (tab: TabKey = activeTab) => {
      if (!organizationId || !projectId) {
        setSurveys([]);
        setLoading(false);
        return Promise.resolve();
      }
      setLoading(true);
      const status: SurveyStatus | undefined =
        tab === 'open' || tab === 'draft' || tab === 'closed' || tab === 'archived'
          ? tab
          : undefined;
      return getSurveys(organizationId, { status, mine: tab === 'mine', projectId })
        .then(setSurveys)
        .catch((err: unknown) =>
          notifyError(
            'Не удалось загрузить опросы',
            err instanceof Error ? err.message : undefined,
          ),
        )
        .finally(() => setLoading(false));
    },
    [organizationId, projectId, activeTab, notifyError],
  );

  useEffect(() => {
    if (!ready) return;
    void loadSurveys();
    loadCounts();
  }, [ready, loadSurveys, loadCounts]);

  const handleRename = async (payload: SurveyProjectPayload) => {
    if (!project) return;
    const updated = await updateSurveyProject(project.id, payload);
    setProject(updated);
    setRenameOpen(false);
    notifySuccess('Проект сохранён');
  };

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

  const handleMove = async (target: SurveyProject) => {
    if (!movingSurvey) return;
    await moveSurveyToProject(movingSurvey.id, target.id);
    setMovingSurvey(null);
    notifySuccess('Опрос перемещён', `Теперь он в проекте «${target.name}»`);
    await loadSurveys();
    loadCounts();
  };

  const createSurvey = useCallback(
    () => navigate(`/surveys/create?project=${projectId ?? ''}`),
    [navigate, projectId],
  );

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
        width: 128,
        fixed: 'right',
        render: (_, record) => (
          <div style={{ display: 'flex', gap: 4 }}>
            {record.status !== 'archived' && (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                title="Изменить"
                aria-label="Изменить"
                onClick={() => navigate(`/surveys/${record.id}/edit`)}
              />
            )}
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              title="Переместить в проект"
              aria-label="Переместить в проект"
              onClick={() => setMovingSurvey(record)}
            />
            {record.status !== 'archived' && (
              <Button
                type="text"
                size="small"
                icon={<InboxOutlined />}
                title="Переместить в архив"
                aria-label="Переместить в архив"
                onClick={() => setConfirmArchiveId(record.id)}
              />
            )}
          </div>
        ),
      },
    ],
    [navigate],
  );

  const tabCount = (key: TabKey): number => (key === 'archived' ? counts.archived : counts[key]);

  if (projectState === 'loading' || (projectState === 'ready' && !organizationId)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (projectState === 'error') {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить проект"
          action={
            <Button size="small" onClick={loadProject}>
              Повторить
            </Button>
          }
        />
      </div>
    );
  }

  if (!ready || !project) {
    return (
      <Result
        status="404"
        title="Проект не найден"
        subTitle="Возможно, он был удалён или находится в другой организации."
        extra={
          <Button type="primary" onClick={() => navigate('/surveys')}>
            К проектам
          </Button>
        }
      />
    );
  }

  const projectIsEmpty = !loading && activeTab === 'all' && surveys.length === 0 && !search.trim();

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row project-page__title-row">
          <div className="project-page__heading">
            <div className="project-page__title-line">
              <h1 className="registry-page__title project-page__title">{project.name}</h1>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                title="Переименовать проект"
                aria-label="Переименовать проект"
                onClick={() => setRenameOpen(true)}
              />
            </div>
            {project.description && (
              <p className="project-page__description">{project.description}</p>
            )}
          </div>
          <Button
            type="primary"
            className="registry-page__create-btn"
            icon={<PlusOutlined />}
            onClick={createSurvey}
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
        {projectIsEmpty ? (
          <Card className="registry-page__card">
            <Empty
              className="registry-page__empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--app-text)' }}>
                    В проекте пока нет опросов
                  </div>
                  <div>Создайте первый опрос — он появится в этом проекте.</div>
                </div>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={createSurvey}>
                Создать опрос
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Поиск по названию"
              aria-label="Поиск опроса по названию"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              size={isMobile ? 'large' : 'middle'}
              style={{ maxWidth: isMobile ? undefined : 360, marginBottom: 12 }}
            />
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!loading && visibleSurveys.length === 0 && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={search.trim() ? 'Ничего не найдено' : EMPTY_MESSAGE[activeTab]}
                  />
                )}
                {visibleSurveys.map((survey) => (
                  <Card key={survey.id} size="small" loading={loading}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        alignItems: 'flex-start',
                      }}
                    >
                      <Link
                        to={`/surveys/${survey.id}`}
                        style={{ fontWeight: 600, wordBreak: 'break-word' }}
                      >
                        {survey.name}
                      </Link>
                      <Tag color={SURVEY_STATUS_COLOR[survey.status]} style={{ margin: 0 }}>
                        {SURVEY_STATUS_LABEL[survey.status]}
                      </Tag>
                    </div>
                    <div
                      style={{
                        margin: '6px 0 10px',
                        fontSize: 13,
                        color: 'var(--app-text-secondary)',
                      }}
                    >
                      {pluralizeResponses(survey.responses_count)}
                      {survey.last_response_at &&
                        ` · последний ${formatSurveyDate(survey.last_response_at)}`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {survey.status !== 'archived' && (
                        <Button
                          size="large"
                          icon={<EditOutlined />}
                          onClick={() => navigate(`/surveys/${survey.id}/edit`)}
                        >
                          Изменить
                        </Button>
                      )}
                      <Button
                        size="large"
                        icon={<FolderOpenOutlined />}
                        aria-label="Переместить в проект"
                        onClick={() => setMovingSurvey(survey)}
                      />
                      {survey.status !== 'archived' && (
                        <Button
                          size="large"
                          icon={<InboxOutlined />}
                          aria-label="Переместить в архив"
                          onClick={() => setConfirmArchiveId(survey.id)}
                        />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="registry-page__card">
                <Table<SurveyListItem>
                  rowKey="id"
                  columns={columns}
                  dataSource={visibleSurveys}
                  loading={loading}
                  locale={{
                    emptyText: search.trim() ? 'Ничего не найдено' : EMPTY_MESSAGE[activeTab],
                  }}
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
            )}
          </>
        )}
      </div>

      <ProjectFormModal
        open={renameOpen}
        project={project}
        onSubmit={handleRename}
        onClose={() => setRenameOpen(false)}
      />

      <MoveSurveyModal
        open={!!movingSurvey}
        organizationId={organizationId}
        surveyName={movingSurvey?.name ?? ''}
        currentProjectId={project.id}
        onMove={handleMove}
        onClose={() => setMovingSurvey(null)}
      />

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
