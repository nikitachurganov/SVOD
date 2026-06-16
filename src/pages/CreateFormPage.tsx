import { useNavigate } from 'react-router-dom';
import { createForm, mapPagesToPayload } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { useOrganization } from '../shared/hooks/organization.hooks';

export const CreateFormPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  const handleSave = async (title: string, pages: FormPageInstance[]) => {
    await createForm({
      name: title,
      pages: mapPagesToPayload(pages),
      organization_id: activeOrganization?.id ?? null,
    });
    navigate('/forms');
  };

  return (
    <FormEditor
      pageTitle="Новая форма"
      saveButtonLabel="Сохранить"
      onSave={handleSave}
      onBack={() => navigate('/forms')}
    />
  );
};
