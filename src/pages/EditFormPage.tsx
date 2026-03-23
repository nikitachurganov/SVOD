import { useEffect, useMemo, useState } from 'react';
import { InlineNotification, Loading } from '@carbon/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getFormById,
  updateForm,
  mapPagesToPayload,
  pagesPayloadToInstances,
  type FormResponse,
} from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';

export const EditFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [formData, setFormData] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getFormById(id)
      .then((data) => { setFormData(data); setError(null); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось загрузить форму'))
      .finally(() => setLoading(false));
  }, [id]);

  const initialPages = useMemo<FormPageInstance[]>(
    () => (formData?.pages ? pagesPayloadToInstances(formData.pages) : []),
    [formData],
  );

  const handleSave = async (title: string, pages: FormPageInstance[]) => {
    if (!id) return;
    await updateForm(id, { name: title, pages: mapPagesToPayload(pages) });
    navigate(`/forms/${id}`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--cds-background)' }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div style={{ padding: 24, background: 'var(--cds-background)', flex: 1 }}>
        <InlineNotification kind="error" title="Ошибка загрузки" subtitle={error ?? 'Форма не найдена'} lowContrast />
      </div>
    );
  }

  return (
    <FormEditor
      breadcrumbLabel="Редактирование формы"
      pageTitle="Редактирование формы"
      saveButtonLabel="Сохранить"
      initialTitle={formData.name}
      initialPages={initialPages}
      onSave={handleSave}
      onBack={() => navigate('/forms')}
    />
  );
};
