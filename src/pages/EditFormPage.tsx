import { useEffect, useMemo, useState } from 'react';

import { Alert, Spin } from 'antd';

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
import { useBreadcrumbEntity } from '../shared/context/breadcrumb.context';



export const EditFormPage = () => {

  const navigate = useNavigate();

  const { id } = useParams<{ id: string }>();



  const [formData, setFormData] = useState<FormResponse | null>(null);

  const [fetchedId, setFetchedId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);



  const loading = Boolean(id) && fetchedId !== id;



  useEffect(() => {

    if (!id) return;



    let cancelled = false;

    getFormById(id)

      .then((data) => {

        if (cancelled) return;

        setFormData(data);

        setError(null);

        setFetchedId(id);

      })

      .catch((err: unknown) => {

        if (cancelled) return;

        setError(err instanceof Error ? err.message : 'Не удалось загрузить форму');

        setFetchedId(id);

      });



    return () => {

      cancelled = true;

    };

  }, [id]);



  const initialPages = useMemo<FormPageInstance[]>(

    () => (formData?.pages ? pagesPayloadToInstances(formData.pages) : []),

    [formData],

  );



  const handleSave = async (title: string, pages: FormPageInstance[]) => {

    if (!id) return;

    await updateForm(id, {

      name: title,

      pages: mapPagesToPayload(pages),

      is_universal: Boolean(formData?.is_universal),

    });

    navigate(`/forms/${id}`);

  };



  const { setEntityTitle } = useBreadcrumbEntity();

  useEffect(() => {
    setEntityTitle(formData?.name ?? null);
  }, [formData?.name, setEntityTitle]);

  if (loading) {

    return (

      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)' }}>

        <Spin />

      </div>

    );

  }



  if (error || !formData) {

    return (

      <div style={{ padding: 24, background: 'var(--app-bg)', flex: 1 }}>

        <Alert type="error" message="Ошибка загрузки" description={error ?? 'Форма не найдена'} />

      </div>

    );

  }



  return (

    <FormEditor

      pageTitle="Редактирование формы"

      saveButtonLabel="Сохранить"

      initialTitle={formData.name}

      initialPages={initialPages}

      onSave={handleSave}

      onBack={() => navigate('/forms')}

    />

  );

};

