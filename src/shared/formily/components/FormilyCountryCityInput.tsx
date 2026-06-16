import { useEffect } from 'react';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { getCountryCityConfig } from '../../utils/fieldConfig';
import { validateCountryCityValue } from '../../utils/fieldValueValidation';
import type { CountryCityFieldValue } from '../../types/field-values.types';
import { CountryCityInput } from '../../ui/form-builder/CountryCityInput';

interface FormilyCountryCityInputProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyCountryCityInput = ({ fieldMeta }: FormilyCountryCityInputProps) => {
  const field = useField() as Field;
  const config = getCountryCityConfig(fieldMeta);
  const value = field.value as CountryCityFieldValue | undefined;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((val: unknown) =>
      validateCountryCityValue(val, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.required]);

  return (
    <CountryCityInput
      field={fieldMeta}
      config={config}
      value={value}
      error={error}
      onChange={(next) => field.onInput(next)}
    />
  );
};
