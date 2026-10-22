import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

import { getSurveyById, updateSurvey, type SurveyDetail } from '../shared/api/surveys.api';
import { mapPagesToPayload, pagesPayloadToInstances } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import type { MethodologyState } from '../shared/ui/form-builder/AiFormBuilderPanel';
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';

export const EditSurveyPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { setEntityTitle } = useBreadcrumbEntity();

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
    await updateSurvey(id, {
      name: title,
      description: survey.description,
      pages: mapPagesToPayload(pages),
      methodology_meta: methodology?.meta ?? survey.methodology_meta,
      anonymous: survey.anonymous,
      closes_at: survey.closes_at,
    });
    navigate(`/surveys/${id}`);
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
      onBack={() => navigate(`/surveys/${id}`)}
    />
  );
};
