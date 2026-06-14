import { useEffect } from 'react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormCtx } from '../../hooks/useFormCtx';
import { getLocationConfig } from '../../utils/fieldConfig';
import { validateLocationValue } from '../../utils/fieldValueValidation';
import type { LocationFieldValue } from '../../types/field-values.types';
import { LocationInput } from './LocationInput';

interface LocationFieldProps {
  field: FormFieldInstance;
}

export const LocationField = ({ field }: LocationFieldProps) => {
  const ctx = useFormCtx();
  const config = getLocationConfig(field);

  useEffect(() => {
    ctx.registerField(field.id, [
      {
        validator: (_: unknown, value: unknown) => {
          const message = validateLocationValue(value, config, field.required);
          return message ? Promise.reject(new Error(message)) : Promise.resolve();
        },
      },
    ]);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required, config, ctx]);

  const value = ctx.values[field.id] as LocationFieldValue | string | undefined;
  const error = ctx.errors[field.id];

  return (
    <LocationInput
      field={field}
      value={value}
      error={error}
      onChange={(next) => ctx.setFieldValue(field.id, next)}
    />
  );
};
