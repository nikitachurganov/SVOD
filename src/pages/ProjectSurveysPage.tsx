import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dropdown, Empty, Input, Modal, Result, Spin } from 'antd';
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
  type SurveyProject,
  type SurveyProjectPayload,
} from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { useNotifications } from '../shared/context/notifications.context';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { MoveSurveyModal } from '../shared/ui/survey/MoveSurveyModal';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
import { SURVEY_STATUS_LABEL, formatSurveyDate, pluralizeResponses } from './surveyStatus';

/** Active = still part of the work: collecting answers (open) or finished but not archived (closed) */
type TabKey = 'active' | 'draft' | 'archived';

const TAB_ORDER: TabKey[] = ['active', 'draft', 'archived'];

const TAB_LABELS: Record<TabKey, string> = {
  active: 'Активные',
  draft: 'Черновики',
  archived: 'Архив',
};

const EMPTY_MESSAGE: Record<TabKey, string> = {
  active: 'Нет активных опросов.',
  draft: 'Нет черновиков.',
  archived: 'Архив пуст.',
};

const tabOf = (survey: SurveyListItem): TabKey =>
  survey.status === 'draft' ? 'draft' : survey.status === 'archived' ? 'archived' : 'active';

/** Active first; with no active surveys the drafts; archive only when it is all there is */
const defaultTab = (list: SurveyListItem[]): TabKey => {
  const has = (tab: TabKey) => list.some((survey) => tabOf(survey) === tab);
  if (has('active')) return 'active';
  if (has('draft')) return 'draft';
  if (has('archived')) return 'archived';
  return 'active';
};

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
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const { setEntityTitle } = useBreadcrumbEntity();
  const organizationId = activeOrganization?.id ?? null;

  const [project, setProject] = useState<SurveyProject | null>(null);
  const [projectState, setProjectState] = useState<ProjectState>('loading');
  const [renameOpen, setRenameOpen] = useState(false);

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  // null until the project's surveys have loaded: the first tab is picked from what the project has
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
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
    const result: Record<TabKey, number> = { active: 0, draft: 0, archived: 0 };
    surveys.forEach((survey) => {
      result[tabOf(survey)] += 1;
    });
    return result;
  }, [surveys]);

  const visibleSurveys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return surveys
      .filter((survey) => tabOf(survey) === (activeTab ?? 'active'))
      .filter((survey) => !needle || survey.name.toLowerCase().includes(needle));
  }, [surveys, activeTab, search]);

  // One request for the whole project: the tabs and their counters are cut from it locally
  const loadSurveys = useCallback(() => {
    if (!organizationId || !projectId) {
      setSurveys([]);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return getSurveys(organizationId, { projectId })
      .then((list) => {
        setSurveys(list);
        setActiveTab((current) => current ?? defaultTab(list));
      })
      .catch((err: unknown) =>
        notifyError('Не удалось загрузить опросы', err instanceof Error ? err.message : undefined),
      )
      .finally(() => setLoading(false));
  }, [organizationId, projectId, notifyError]);

  // Another project starts from scratch: no leftovers of the previous tab or list
  useEffect(() => {
    setActiveTab(null);
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
      notifySuccess('Опрос перемещён в архив');
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
              {TAB_LABELS[key]} ({counts[key]})
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
              style={{ maxWidth: 360, marginBottom: 16 }}
            />
            {loading && surveys.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Spin />
              </div>
            ) : visibleSurveys.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={search.trim() ? 'Ничего не найдено' : EMPTY_MESSAGE[activeTab ?? 'active']}
              />
            ) : (
              <ul className="survey-grid" aria-label="Опросы" aria-busy={loading}>
                {visibleSurveys.map((survey) => (
                  <li key={survey.id} className="survey-card">
                    <div className="survey-card__top">
                      <span className={`survey-card__status survey-card__status--${survey.status}`}>
                        {SURVEY_STATUS_LABEL[survey.status]}
                      </span>
                      <Dropdown menu={menuFor(survey)} trigger={['click']} placement="bottomRight">
                        <Button
                          type="text"
                          className="survey-card__menu"
                          icon={<MoreOutlined />}
                          aria-label={`Действия с опросом «${survey.name}»`}
                        />
                      </Dropdown>
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
