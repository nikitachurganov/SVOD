import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dropdown, Empty, Input, Modal, Result, Select } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  archiveSurvey,
  getSurveyProject,
  getSurveys,
  moveSurveyToProject,
  updateSurveyProject,
  type SurveyListItem,
  type SurveyStatus,
  type SurveyProject,
  type SurveyProjectPayload,
} from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { useNotifications } from '../shared/context/notifications.context';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { MoveSurveyModal } from '../shared/ui/survey/MoveSurveyModal';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
import { ProjectSurveysSkeleton, SurveyCardsSkeleton } from '../shared/ui/skeletons/PageSkeletons';
import { SURVEY_STATUS_LABEL, formatSurveyDate, pluralizeResponses } from './surveyStatus';

/** "all" is every survey of the project, archived ones included (they carry the «В архиве» status) */
type StatusFilter = 'all' | SurveyStatus;

const STATUS_FILTERS: StatusFilter[] = ['all', 'open', 'draft', 'closed', 'archived'];

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Все',
  open: 'Принимают ответы',
  draft: 'Черновики',
  closed: 'Завершённые',
  archived: 'Архив',
};

type SortKey = 'updated' | 'name' | 'responses';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Сначала новые' },
  { value: 'responses', label: 'По числу ответов' },
  { value: 'name', label: 'По названию' },
];

const matchesFilter = (survey: SurveyListItem, filter: StatusFilter): boolean =>
  filter === 'all' || survey.status === filter;

const questionsWord = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вопрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вопроса';
  return 'вопросов';
};

type ProjectState = 'loading' | 'ready' | 'missing' | 'error';

export const ProjectSurveysPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { activeOrganization, canEdit } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const { setEntityTitle } = useBreadcrumbEntity();
  const organizationId = activeOrganization?.id ?? null;

  const [project, setProject] = useState<SurveyProject | null>(null);
  const [projectState, setProjectState] = useState<ProjectState>('loading');
  const [renameOpen, setRenameOpen] = useState(false);

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [movingSurvey, setMovingSurvey] = useState<SurveyListItem | null>(null);
  const [search, setSearch] = useState('');

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

  const counts = useMemo(() => {
    const result = {} as Record<StatusFilter, number>;
    STATUS_FILTERS.forEach((key) => {
      result[key] = surveys.filter((survey) => matchesFilter(survey, key)).length;
    });
    return result;
  }, [surveys]);

  const visibleSurveys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = surveys
      .filter((survey) => matchesFilter(survey, statusFilter))
      .filter((survey) => !needle || survey.name.toLowerCase().includes(needle));
    return list.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sortKey === 'responses') return b.responses_count - a.responses_count;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [surveys, statusFilter, sortKey, search]);

  // One request for the whole project: the filters and their counters are cut from it locally
  const loadSurveys = useCallback(() => {
    if (!organizationId || !projectId) {
      setSurveys([]);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return getSurveys(organizationId, { projectId, includeArchived: true })
      .then((list) => {
        setSurveys(list);
      })
      .catch((err: unknown) =>
        notifyError('Не удалось загрузить опросы', err instanceof Error ? err.message : undefined),
      )
      .finally(() => setLoading(false));
  }, [organizationId, projectId, notifyError]);

  // Another project starts from scratch: no leftovers of the previous filters or list
  useEffect(() => {
    setStatusFilter('all');
    setSortKey('updated');
    setSurveys([]);
    setSearch('');
  }, [projectId]);

  useEffect(() => {
    if (!ready) return;
    void loadSurveys();
  }, [ready, loadSurveys]);

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
      notifySuccess('Опрос перемещён в архив', 'Он остаётся в списке с пометкой «В архиве»');
      await loadSurveys();
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
  };

  const createSurvey = useCallback(
    () => navigate(`/surveys/create?project=${projectId ?? ''}`),
    [navigate, projectId],
  );

  const menuFor = (survey: SurveyListItem): MenuProps => ({
    items: [
      ...(survey.status !== 'archived' ? [{ key: 'edit', label: 'Изменить' }] : []),
      { key: 'move', label: 'Переместить в проект' },
      ...(survey.status !== 'archived'
        ? [{ key: 'archive', label: 'В архив', danger: true }]
        : []),
    ],
    onClick: ({ key }) => {
      if (key === 'edit') navigate(`/surveys/${survey.id}/edit`);
      if (key === 'move') setMovingSurvey(survey);
      if (key === 'archive') setConfirmArchiveId(survey.id);
    },
  });

  if (projectState === 'loading' || (projectState === 'ready' && !organizationId)) {
    return <ProjectSurveysSkeleton />;
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
        subTitle={
          IS_SURVEYS_APP
            ? 'Возможно, он был удалён.'
            : 'Возможно, он был удалён или находится в другой организации.'
        }
        extra={
          <Button type="primary" onClick={() => navigate('/surveys')}>
            К проектам
          </Button>
        }
      />
    );
  }

  const projectIsEmpty = !loading && surveys.length === 0;

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row project-page__title-row">
          <div className="project-page__heading">
            <div className="project-page__title-line">
              <h1 className="registry-page__title project-page__title">{project.name}</h1>
              {canEdit && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  title="Переименовать проект"
                  aria-label="Переименовать проект"
                  onClick={() => setRenameOpen(true)}
                />
              )}
            </div>
            {project.description && (
              <p className="project-page__description">{project.description}</p>
            )}
          </div>
          {canEdit && (
            <Button
              type="primary"
              className="registry-page__create-btn"
              data-tour="create-survey"
              icon={<PlusOutlined />}
              onClick={createSurvey}
            >
              Создать опрос
            </Button>
          )}
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
                  <div>
                    {canEdit
                      ? 'Создайте первый опрос — он появится в этом проекте.'
                      : 'Опросы появятся здесь, когда их создадут редакторы команды.'}
                  </div>
                </div>
              }
            >
              {canEdit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={createSurvey}>
                  Создать опрос
                </Button>
              )}
            </Empty>
          </Card>
        ) : (
          <>
            <div className="project-page__toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Поиск по названию"
                aria-label="Поиск опроса по названию"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="project-page__search"
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                aria-label="Фильтр по статусу"
                className="project-page__select"
                options={STATUS_FILTERS.map((key) => ({
                  value: key,
                  label: `${STATUS_FILTER_LABELS[key]} (${counts[key]})`,
                }))}
              />
              <Select
                value={sortKey}
                onChange={setSortKey}
                aria-label="Сортировка"
                className="project-page__select"
                options={SORT_OPTIONS}
              />
            </div>
            {loading && surveys.length === 0 ? (
              <SurveyCardsSkeleton />
            ) : visibleSurveys.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  search.trim() || statusFilter !== 'all' ? 'Ничего не найдено' : 'Нет опросов.'
                }
              />
            ) : (
              <ul className="survey-grid" aria-label="Опросы" aria-busy={loading}>
                {visibleSurveys.map((survey) => (
                  <li key={survey.id} className="survey-card">
                    <div className="survey-card__top">
                      <span className={`survey-card__status survey-card__status--${survey.status}`}>
                        {SURVEY_STATUS_LABEL[survey.status]}
                      </span>
                      {canEdit && (
                        <Dropdown menu={menuFor(survey)} trigger={['click']} placement="bottomRight">
                          <Button
                            type="text"
                            className="survey-card__menu"
                            icon={<MoreOutlined />}
                            aria-label={`Действия с опросом «${survey.name}»`}
                          />
                        </Dropdown>
                      )}
                    </div>
                    {/* The link is stretched over the whole card; the menu button sits above it */}
                    <Link to={`/surveys/${survey.id}`} className="survey-card__name">
                      {survey.name}
                    </Link>
                    <div className="survey-card__stats">
                      <div>
                        <strong>{pluralizeResponses(survey.responses_count)}</strong>
                        <span>
                          {survey.last_response_at
                            ? `последний ${formatSurveyDate(survey.last_response_at)}`
                            : 'ответов ещё не было'}
                        </span>
                      </div>
                      <div>
                        <strong>{survey.questions_count}</strong>
                        <span>{questionsWord(survey.questions_count)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
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
