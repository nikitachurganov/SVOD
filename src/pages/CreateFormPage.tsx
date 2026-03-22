import { App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { createForm, mapPagesToPayload } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { useOrganization } from '../shared/context/organization.context';

export const CreateFormPage = () => {
  const navigate = useNavigate();
  const { notification } = App.useApp();
  const { activeOrganization } = useOrganization();

  const handleSave = async (title: string, pages: FormPageInstance[]) => {
    await createForm({
      name: title,
      pages: mapPagesToPayload(pages),
      organization_id: activeOrganization?.id ?? null,
    });

    notification.success({
      title: 'Форма сохранена',
      description: `Форма «${title}» успешно создана.`,
      placement: 'topRight',
    });

    navigate('/forms');
  };

  return (
    <FormEditor
      breadcrumbLabel="Создание новой формы"
      pageTitle="Новая форма"
      saveButtonLabel="Сохранить"
      onSave={handleSave}
      onBack={() => navigate('/forms')}
    />
  );
};
