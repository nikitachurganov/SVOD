import type { FormFieldInstance } from '../../types/form-builder.types';
import type { FormStoreInstance } from '../../hooks/formStore.types';
import { FormProvider } from '../../hooks/FormProvider';
import { PreviewField } from '../form-builder/FormPreviewModal';

interface LegacyFormFillProps {
  fields: FormFieldInstance[];
  store: FormStoreInstance;
}

/** Legacy runtime: PreviewField + useFormStore */
export const LegacyFormFill = ({ fields, store }: LegacyFormFillProps) => (
  <FormProvider store={store}>
    {fields.map((field) => (
      <PreviewField key={field.id} field={field} />
    ))}
  </FormProvider>
);
