import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dropdown, Empty, Grid, Input, Modal, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import { FolderOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Link } from 'react-router-dom';

import {
  createSurveyProject,
  deleteSurveyProject,
  getSurveyProjects,
  updateSurveyProject,
  type SurveyProject,
  type SurveyProjectPayload,
} from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useNotifications } from '../shared/context/notifications.context';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
import { pluralizeSurveys } from './surveyStatus';

/** The search box is only worth its space once the catalog is long enough to scan */
const SEARCH_FROM = 6;
const SKELETON_CARDS = 6;

export const SurveysPage = () => {
  const { activeOrganization } = useOrganization();
  const { notifySuccess, notifyError } = useNotifications();
  const organizationId = activeOrganization?.id ?? null;

  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SurveyProject | null>(null);
  const [deleting, setDeleting] = useState<SurveyProject | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isMobile = Grid.useBreakpoint().md === false;

  const load = useCallback(() => {
    if (!organizationId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
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
      { key: 'rename', label: 'Переименовать' },
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
          description="Выберите организацию, чтобы увидеть проекты."
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
        <Empty
          className="registry-page__empty"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Пока нет проектов. Создайте проект, чтобы объединять опросы по темам исследований."
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
            Создать проект
          </Button>
        </Empty>
      );
    }
    return (
      <>
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
              <li key={project.id} className="project-card">
                <FolderOutlined className="project-card__icon" aria-hidden />
                <div className="project-card__body">
                  {/* The link is stretched over the whole card; the menu button sits above it */}
                  <Link to={`/surveys/projects/${project.id}`} className="project-card__link">
                    {project.name}
                  </Link>
                  {project.description && (
                    <p className="project-card__description">{project.description}</p>
                  )}
                  <div className="project-card__meta">{pluralizeSurveys(project.surveys_count)}</div>
                </div>
                <Dropdown menu={menuFor(project)} trigger={['click']} placement="bottomRight">
                  <Button
                    type="text"
                    className="project-card__menu"
                    icon={<MoreOutlined />}
                    aria-label={`Действия с проектом «${project.name}»`}
                  />
                </Dropdown>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Опросы</h1>
          <Button
            type="primary"
            className="registry-page__create-btn"
            icon={<PlusOutlined />}
            onClick={() => openForm(null)}
            disabled={!organizationId}
          >
            Создать проект
          </Button>
        </div>
      </div>

      <div className="registry-page__content">{renderBody()}</div>

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
