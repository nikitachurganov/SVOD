import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

import { getSurveyById, updateSurvey, type SurveyDetail } from '../shared/api/surveys.api';
import { mapPagesToPayload, pagesPayloadToInstances } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import type { MethodologyState } from '../shared/ui/form-builder/AiFormBuilderPanel';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';

/** The server refuses edits that would change the meaning of answers already collected */
const structureLockMessage = (err: unknown): string | null => {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return null;
  const detail = err.response.data?.detail as { code?: string; problems?: string[] } | undefined;
  if (detail?.code !== 'survey_structure_locked') return null;
  const problems = (detail.problems ?? []).join('; ');
  return `По опросу уже есть ответы, поэтому так менять форму нельзя: ${problems}. Верните удалённые вопросы и варианты или создайте новый опрос.`;
};

export const EditSurveyPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { setEntityTitle, setEntityParent } = useBreadcrumbEntity();

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [fetchedId, setFetchedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = Boolean(id) && fetchedId !== id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSurveyById(id)
      .then((data) => {
        if (cancelled) return;
        setSurvey(data);
        setError(null);
        setFetchedId(id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить опрос');
        setFetchedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setEntityTitle(survey?.name ?? null);
  }, [survey?.name, setEntityTitle]);

  const projectId = survey?.project_id;
  const projectName = survey?.project_name;
  useEffect(() => {
    setEntityParent(
      projectId && projectName
        ? { title: projectName, path: `/surveys/projects/${projectId}` }
        : null,
    );
  }, [projectId, projectName, setEntityParent]);

  const initialPages = useMemo<FormPageInstance[]>(
    () => (survey?.pages ? pagesPayloadToInstances(survey.pages) : []),
    [survey],
  );
  const initialMethodology = useMemo<MethodologyState>(
    () => ({
      meta: survey?.methodology_meta ?? null,
      summary: survey?.methodology_summary ?? null,
    }),
    [survey],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !survey || !id) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error ?? 'Опрос не найден'} />
      </div>
    );
  }

  const handleSave = async (
    title: string,
    pages: FormPageInstance[],
    methodology?: MethodologyState,
  ) => {
    try {
      await updateSurvey(id, {
        name: title,
        description: survey.description,
        pages: mapPagesToPayload(pages),
        methodology_meta: methodology?.meta ?? survey.methodology_meta,
        anonymous: survey.anonymous,
        closes_at: survey.closes_at,
      });
    } catch (err) {
      throw new Error(structureLockMessage(err) ?? (err instanceof Error ? err.message : 'Не удалось сохранить опрос.'));
    }
    navigate(`/surveys/${id}/form`);
  };

  return (
    <FormEditor
      key={survey.id}
      mode="survey"
      pageTitle="Редактирование опроса"
      saveButtonLabel="Сохранить"
      initialTitle={survey.name}
      initialPages={initialPages}
      initialMethodology={initialMethodology}
      onSave={handleSave}
      onBack={() => navigate(`/surveys/${id}/form`)}
    />
  );
};
