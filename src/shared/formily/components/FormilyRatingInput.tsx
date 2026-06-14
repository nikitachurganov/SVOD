import { useEffect } from 'react';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { getRatingConfig } from '../../utils/fieldConfig';
import { validateRatingValue } from '../../utils/fieldValueValidation';
import type { RatingFieldValue } from '../../types/field-values.types';
import { RatingInput } from '../../ui/form-builder/RatingInput';

interface FormilyRatingInputProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyRatingInput = ({ fieldMeta }: FormilyRatingInputProps) => {
  const field = useField() as Field;
  const config = getRatingConfig(fieldMeta);
  const value = field.value as RatingFieldValue | number | undefined;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((val: unknown) =>
      validateRatingValue(val, config, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.required, config]);

  return (
    <RatingInput
      field={fieldMeta}
      value={value}
      error={error}
      onChange={(next) => field.onInput(next ?? null)}
    />
  );
};
