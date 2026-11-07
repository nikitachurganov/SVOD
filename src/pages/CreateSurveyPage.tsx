import { useEffect, useState } from 'react';
import { Alert, Button, Result } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { createSurvey, getSurveyProject } from '../shared/api/surveys.api';
import { mapPagesToPayload } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import type { MethodologyState } from '../shared/ui/form-builder/AiFormBuilderPanel';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';
import { createInitialSurveyPages } from '../shared/utils/welcomePage';
import { FormEditorSkeleton } from '../shared/ui/skeletons/PageSkeletons';

type ProjectCheck = 'none' | 'loading' | 'ok' | 'missing';

export const CreateSurveyPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const { setEntityParent } = useBreadcrumbEntity();
  // /surveys/create?project=<id> — the survey is created inside that project
  const projectId = useSearchParams()[0].get('project');
  const [checked, setChecked] = useState<{ id: string; found: boolean } | null>(null);
  const [initialPages] = useState(createInitialSurveyPages);
  const check: ProjectCheck = !projectId
    ? 'none'
    : checked?.id !== projectId
      ? 'loading'
      : checked.found
        ? 'ok'
        : 'missing';

  useEffect(() => {
    if (!projectId) {
      setEntityParent(null);
      return;
    }
    let cancelled = false;
    getSurveyProject(projectId)
      .then((project) => {
        if (cancelled) return;
        setEntityParent({ title: project.name, path: `/surveys/projects/${project.id}` });
        setChecked({ id: projectId, found: true });
      })
      .catch(() => {
        if (!cancelled) setChecked({ id: projectId, found: false });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, setEntityParent]);

  if (!activeOrganization) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="info"
          showIcon
          message={IS_SURVEYS_APP ? 'Пространство ещё загружается. Повторите через мгновение.' : 'Выберите команду, чтобы создать опрос.'}
        />
      </div>
    );
  }

  if (check === 'loading') {
    return <FormEditorSkeleton />;
  }

  if (check === 'missing') {
    return (
      <Result
        status="404"
        title="Проект не найден"
        subTitle="Опрос нельзя создать в проекте, которого нет или к которому нет доступа."
        extra={
          <Button type="primary" onClick={() => navigate('/surveys')}>
            К проектам
          </Button>
        }
      />
    );
  }

  const backPath = projectId ? `/surveys/projects/${projectId}` : '/surveys';

  const handleSave = async (
    title: string,
    pages: FormPageInstance[],
    methodology?: MethodologyState,
  ) => {
    const created = await createSurvey(
      activeOrganization.id,
      {
        name: title,
        pages: mapPagesToPayload(pages),
        methodology_meta: methodology?.meta ?? null,
      },
      projectId,
    );
    navigate(`/surveys/${created.id}`);
  };

  return (
    <FormEditor
      mode="survey"
      pageTitle="Новый опрос"
      initialPages={initialPages}
      saveButtonLabel="Сохранить"
      onSave={handleSave}
      onBack={() => navigate(backPath)}
    />
  );
};
