import { Alert } from 'antd';
import { useNavigate } from 'react-router-dom';

import { createSurvey } from '../shared/api/surveys.api';
import { mapPagesToPayload } from '../shared/api/forms.api';
import { FormEditor } from '../shared/ui/form-builder/FormEditor';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import type { MethodologyState } from '../shared/ui/form-builder/AiFormBuilderPanel';
import { useOrganization } from '../shared/hooks/organization.hooks';

export const CreateSurveyPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  if (!activeOrganization) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="info" showIcon message="Выберите организацию, чтобы создать опрос." />
      </div>
    );
  }

  const handleSave = async (
    title: string,
    pages: FormPageInstance[],
    methodology?: MethodologyState,
  ) => {
    const created = await createSurvey(activeOrganization.id, {
      name: title,
      pages: mapPagesToPayload(pages),
      methodology_meta: methodology?.meta ?? null,
    });
    navigate(`/surveys/${created.id}`);
  };

  return (
    <FormEditor
      mode="survey"
      pageTitle="Новый опрос"
      saveButtonLabel="Сохранить"
      onSave={handleSave}
      onBack={() => navigate('/surveys')}
    />
  );
};
