import { useEffect } from 'react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormCtx } from '../../hooks/useFormCtx';
import { getRatingConfig } from '../../utils/fieldConfig';
import { validateRatingValue } from '../../utils/fieldValueValidation';
import type { RatingFieldValue } from '../../types/field-values.types';
import { RatingInput } from './RatingInput';

interface RatingFieldProps {
  field: FormFieldInstance;
}

export const RatingField = ({ field }: RatingFieldProps) => {
  const ctx = useFormCtx();
  const config = getRatingConfig(field);

  useEffect(() => {
    ctx.registerField(field.id, [
      {
        validator: (_: unknown, value: unknown) => {
          const message = validateRatingValue(value, config, field.required);
          return message ? Promise.reject(new Error(message)) : Promise.resolve();
        },
      },
    ]);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required, config, ctx]);

  const value = ctx.values[field.id] as RatingFieldValue | number | undefined;
  const error = ctx.errors[field.id];

  return (
    <RatingInput
      field={field}
      value={value}
      error={error}
      onChange={(next) => ctx.setFieldValue(field.id, next ?? null)}
    />
  );
};
