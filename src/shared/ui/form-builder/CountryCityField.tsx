import { useEffect } from 'react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormCtx } from '../../hooks/useFormCtx';
import { getCountryCityConfig } from '../../utils/fieldConfig';
import { validateCountryCityValue } from '../../utils/fieldValueValidation';
import type { CountryCityFieldValue } from '../../types/field-values.types';
import { CountryCityInput } from './CountryCityInput';

interface CountryCityFieldProps {
  field: FormFieldInstance;
}

export const CountryCityField = ({ field }: CountryCityFieldProps) => {
  const ctx = useFormCtx();
  const config = getCountryCityConfig(field);

  useEffect(() => {
    ctx.registerField(field.id, [
      {
        validator: (_: unknown, fieldValue: unknown) => {
          const message = validateCountryCityValue(fieldValue, field.required);
          return message ? Promise.reject(new Error(message)) : Promise.resolve();
        },
      },
    ]);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required, ctx]);

  const value = ctx.values[field.id] as CountryCityFieldValue | undefined;
  const error = ctx.errors[field.id];

  return (
    <CountryCityInput
      field={field}
      config={config}
      value={value}
      error={error}
      onChange={(next) => ctx.setFieldValue(field.id, next)}
    />
  );
};
