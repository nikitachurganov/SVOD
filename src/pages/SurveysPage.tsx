import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dropdown, Empty, Grid, Input, Modal, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import { FolderOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

import {
  createSurveyProject,
  deleteSurveyProject,
  getSurveyProjects,
  getSurveys,
  updateSurveyProject,
  type SurveyListItem,
  type SurveyProject,
  type SurveyProjectPayload,
} from '../shared/api/surveys.api';
import { resolveFolderColor } from '../shared/lib/folderColors';
import { BetaBanner } from '../components/layout/BetaBanner';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { useNotifications } from '../shared/context/notifications.context';
import { CreateSurveyModal } from '../shared/ui/survey/CreateSurveyModal';
import { NewProjectFolder } from '../shared/ui/survey/NewProjectFolder';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
import {
  SURVEY_STATUS_LABEL,
  pluralizeResponses,
  pluralizeSurveys,
} from './surveyStatus';

/** The search box is only worth its space once the catalog is long enough to scan */
const SEARCH_FROM = 6;
const SKELETON_CARDS = 6;
const RECENT_SURVEYS = 6;

export const SurveysPage = () => {
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const organizationId = activeOrganization?.id ?? null;

  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<SurveyProject | null>(null);
  const [deleting, setDeleting] = useState<SurveyProject | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isMobile = Grid.useBreakpoint().md === false;

  const load = useCallback(() => {
    if (!organizationId) {
      setProjects([]);
      setSurveys([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    // The survey list only feeds the stats; the page still works without it
    getSurveys(organizationId)
      .then(setSurveys)
      .catch(() => setSurveys([]));
    getSurveyProjects(organizationId)
      .then(setProjects)
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? projects.filter((p) => p.name.toLowerCase().includes(needle)) : projects;
  }, [projects, search]);

  const projectColors = useMemo(
    () => new Map(projects.map((project) => [project.id, project.color])),
    [projects],
  );

  const recentSurveys = useMemo(
    () =>
      surveys
        .filter((survey) => survey.status !== 'archived')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, RECENT_SURVEYS),
    [surveys],
  );

  const openForm = (project: SurveyProject | null) => {
    setEditing(project);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (payload: SurveyProjectPayload) => {
    if (editing) {
      const updated = await updateSurveyProject(editing.id, payload);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      notifySuccess('Проект сохранён');
    } else if (organizationId) {
      const created = await createSurveyProject(organizationId, payload);
      setProjects((prev) => [created, ...prev]);
      notifySuccess('Проект создан', `«${created.name}»`);
    }
    closeForm();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteSurveyProject(deleting.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleting.id));
      notifySuccess('Проект удалён');
    } catch (err) {
      const notEmpty = axios.isAxiosError(err) && err.response?.data?.detail === 'project_not_empty';
      notifyError(
        'Не удалось удалить проект',
        notEmpty
          ? 'В проекте есть опросы (возможно, в архиве). Сначала переместите их в другой проект.'
          : undefined,
      );
      if (notEmpty) load();
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  };

  const menuFor = (project: SurveyProject): MenuProps => ({
    items: [
      { key: 'rename', label: 'Изменить' },
      { key: 'delete', label: 'Удалить', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'rename') openForm(project);
      if (key === 'delete') setDeleting(project);
    },
  });

  const deleteBlocked = !!deleting && deleting.surveys_count > 0;

  const renderBody = () => {
    if (!organizationId) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={IS_SURVEYS_APP ? 'Пространство ещё загружается.' : 'Выберите организацию, чтобы увидеть проекты.'}
        />
      );
    }
    if (loadFailed) {
      return (
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить проекты"
          action={
            <Button size="small" onClick={load}>
              Повторить
            </Button>
          }
        />
      );
    }
    if (loading) {
      return (
        <div className="project-grid" aria-busy="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Card key={index} className="project-card project-card--skeleton">
              <Skeleton active title paragraph={{ rows: 1 }} />
            </Card>
          ))}
        </div>
      );
    }
    if (projects.length === 0) {
      return (
        <div className="projects-empty">
          <div className="projects-empty__art" aria-hidden>
            <div className="projects-empty__card projects-empty__card--back">
              <span className="projects-empty__dot" />
              <span className="projects-empty__line projects-empty__line--short" />
              <span className="projects-empty__line" />
            </div>
            <div className="projects-empty__card projects-empty__card--front">
              <span className="projects-empty__dot" />
              <span className="projects-empty__line projects-empty__line--short" />
              <span className="projects-empty__line" />
            </div>
          </div>
          <h2 className="projects-empty__title">Пока нет проектов</h2>
          <p className="projects-empty__text">
            Создайте первый проект, чтобы объединять опросы по темам исследований и собирать ответы в одном месте.
          </p>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            data-tour="new-project"
            onClick={() => openForm(null)}
          >
            Создать проект
          </Button>
        </div>
      );
    }
    return (
      <>
        <h2 className="home-section__title">Проекты</h2>
        {projects.length > SEARCH_FROM && (
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Поиск по названию проекта"
            aria-label="Поиск проекта по названию"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size={isMobile ? 'large' : 'middle'}
            style={{ maxWidth: isMobile ? undefined : 360, marginBottom: 16 }}
          />
        )}
        {visibleProjects.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ничего не найдено" />
        ) : (
          <ul className="project-grid" aria-label="Проекты">
            {visibleProjects.map((project) => (
              <li key={project.id} className="project-env" data-folder-color={resolveFolderColor(project.color, project.id)}>
                <div className="project-env__tab" aria-hidden />
                <div className="project-env__shell" aria-hidden />
                <div className="project-env__sheet" aria-hidden />
                <div className="project-env__panel">
                  <div className="project-env__head">
                    {/* The link is stretched over the whole card; the menu button sits above it */}
                    <Link
                      to={`/surveys/projects/${project.id}`}
                      className="project-env__link"
                      title={project.description || undefined}
                    >
                      {project.name}
                    </Link>
                    <Dropdown menu={menuFor(project)} trigger={['click']} placement="bottomRight">
                      <Button
                        type="text"
                        className="project-env__menu"
                        icon={<MoreOutlined />}
                        aria-label={`Действия с проектом «${project.name}»`}
                      />
                    </Dropdown>
                  </div>
                  <div className="project-env__count">{pluralizeSurveys(project.surveys_count)}</div>
                </div>
              </li>
            ))}
            {!search.trim() && (
              <li className="project-env project-env--new" data-tour="new-project">
                <NewProjectFolder onClick={() => openForm(null)} />
              </li>
            )}
          </ul>
        )}
        <BetaBanner onCreateSurvey={() => setCreateOpen(true)} />
        {recentSurveys.length > 0 && (
          <section className="home-section" aria-label="Последние опросы">
            <h2 className="home-section__title">Последние опросы</h2>
            <ul className="recent-surveys">
              {recentSurveys.map((survey) => (
                <li key={survey.id} className="recent-surveys__item">
                  <div className="recent-surveys__main">
                    <Link to={`/surveys/${survey.id}`} className="recent-surveys__name">
                      {survey.name}
                    </Link>
                    <div className="recent-surveys__meta">
                      {pluralizeResponses(survey.responses_count)}
                    </div>
                  </div>
                  <div className="recent-surveys__side">
                    <span className={`recent-surveys__status recent-surveys__status--${survey.status}`}>
                      {SURVEY_STATUS_LABEL[survey.status]}
                    </span>
                    <span
                      className="recent-surveys__project"
                      data-folder-color={resolveFolderColor(
                        projectColors.get(survey.project_id),
                        survey.project_id,
                      )}
                      title={survey.project_name}
                    >
                      <FolderOutlined aria-hidden />
                      <span className="recent-surveys__project-name">{survey.project_name}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  return (
    <div className="registry-page">
      <div className="registry-page__content">{renderBody()}</div>

      <CreateSurveyModal
        open={createOpen}
        organizationId={organizationId}
        projects={projects}
        onContinue={(project, created) => {
          if (created) setProjects((prev) => [project, ...prev]);
          setCreateOpen(false);
          navigate(`/surveys/create?project=${project.id}`);
        }}
        onClose={() => setCreateOpen(false)}
      />

      <ProjectFormModal
        open={formOpen}
        project={editing}
        onSubmit={handleSubmit}
        onClose={closeForm}
      />

      <Modal
        open={!!deleting}
        title={deleteBlocked ? 'Нельзя удалить проект' : 'Удалить проект?'}
        okText={deleteBlocked ? 'Понятно' : 'Удалить'}
        cancelText="Отмена"
        cancelButtonProps={{ style: deleteBlocked ? { display: 'none' } : undefined }}
        okButtonProps={{ danger: !deleteBlocked, loading: deleteBusy }}
        onCancel={() => setDeleting(null)}
        onOk={() => (deleteBlocked ? setDeleting(null) : void handleDelete())}
      >
        {deleteBlocked ? (
          <p>
            В проекте «{deleting?.name}» есть опросы ({pluralizeSurveys(deleting?.surveys_count ?? 0)}).
            Чтобы не потерять ответы, сначала переместите их в другой проект.
          </p>
        ) : (
          <p>
            Проект «{deleting?.name}» пуст и будет удалён. Если в нём остались опросы из архива,
            удаление не выполнится.
          </p>
        )}
      </Modal>
    </div>
  );
};
