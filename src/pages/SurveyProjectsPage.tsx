import { useState } from 'react';
import { Alert, Button, Dropdown, Empty, Modal, Skeleton } from 'antd';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { createSurveyProject, deleteSurveyProject, updateSurveyProject, type SurveyProject, type SurveyProjectPayload } from '../shared/api/surveys.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useSurveyCatalog } from '../shared/hooks/useSurveyCatalog';
import { useNotifications } from '../shared/context/notifications.context';
import { ProjectFormModal } from '../shared/ui/survey/ProjectFormModal';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { resolveFolderColor } from '../shared/lib/folderColors';
import { pluralizeSurveys } from './surveyStatus';

export const SurveyProjectsPage = () => {
  const { activeOrganization, canEdit } = useOrganization();
  const { notifyError, notifySuccess } = useNotifications();
  const catalog = useSurveyCatalog(activeOrganization?.id ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SurveyProject | null>(null);
  const [deleting, setDeleting] = useState<SurveyProject | null>(null);
  const [busy, setBusy] = useState(false);
  const openForm = (project: SurveyProject | null) => { setEditing(project); setFormOpen(true); };
  const save = async (payload: SurveyProjectPayload) => {
    if (!activeOrganization || !canEdit) return;
    if (editing) await updateSurveyProject(editing.id, payload);
    else await createSurveyProject(activeOrganization.id, payload);
    setFormOpen(false);
    notifySuccess(editing ? 'Проект сохранён' : 'Проект создан');
  };
  const remove = async () => {
    if (!deleting || busy || !canEdit) return;
    setBusy(true);
    try { await deleteSurveyProject(deleting.id); setDeleting(null); notifySuccess('Проект удалён'); }
    catch (error) {
      notifyError('Не удалось удалить проект', axios.isAxiosError(error) && error.response?.data?.detail === 'project_not_empty' ? 'В проекте есть исследования, возможно в архиве. Сначала переместите их в другой проект.' : 'Повторите попытку.');
    } finally { setBusy(false); }
  };
  const visible = catalog.projects;
  return <div className="app-dashboard-page">
    <header className="app-dashboard-section-header"><h1>Проекты</h1>{canEdit && <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} data-tour="new-project" onClick={() => openForm(null)}>Новый проект</Button>}</header>
    {catalog.projectsLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : catalog.projectsFailed ? <Alert type="error" title="Не удалось загрузить проекты" action={<Button onClick={catalog.refresh}>Повторить</Button>} /> : !visible.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Проектов пока нет">{<><p>Проект — это папка для опросов одной темы. В ней собираются опросы, ответы и аналитика.</p>{canEdit && <Button onClick={() => openForm(null)}>Создать первый проект</Button>}</>}</Empty> : <ul className="project-grid" aria-label="Проекты">{visible.map((project) => <li key={project.id} className="project-env" data-folder-color={resolveFolderColor(project.color, project.id)}>
      <div className="project-env__tab" aria-hidden /><div className="project-env__shell" aria-hidden /><div className="project-env__sheet" aria-hidden />
      <div className="project-env__panel"><div className="project-env__head"><Link to={`/surveys/projects/${project.id}`} className="project-env__link" title={project.description ?? undefined}>{project.name}</Link>{canEdit && <Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: 'Изменить' }, { key: 'delete', label: 'Удалить', danger: true }], onClick: ({ key }) => { if (key === 'edit') openForm(project); else setDeleting(project); } }}><Button type="text" className="project-env__menu" icon={<MoreOutlined />} aria-label={`Действия с проектом «${project.name}»`} /></Dropdown>}</div><div className="project-env__count">{pluralizeSurveys(project.surveys_count)}</div></div>
    </li>)}</ul>}
    <ProjectFormModal open={formOpen} project={editing} onClose={() => setFormOpen(false)} onSubmit={save} />
    <Modal open={!!deleting} title={deleting?.surveys_count ? 'Нельзя удалить проект' : 'Удалить проект?'} okText={deleting?.surveys_count ? 'Понятно' : 'Удалить'} cancelText="Отмена" confirmLoading={busy} okButtonProps={{ danger: !deleting?.surveys_count }} onCancel={() => { if (!busy) setDeleting(null); }} onOk={() => deleting?.surveys_count ? setDeleting(null) : void remove()}>
      <p>{deleting?.surveys_count ? 'Сначала переместите все исследования в другой проект.' : `Проект «${deleting?.name}» будет удалён, если в нём нет исследований, включая архивные.`}</p>
    </Modal>
  </div>;
};
