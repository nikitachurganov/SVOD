import { useEffect } from 'react';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { getLocationConfig } from '../../utils/fieldConfig';
import { validateLocationValue } from '../../utils/fieldValueValidation';
import type { LocationFieldValue } from '../../types/field-values.types';
import { LocationInput } from '../../ui/form-builder/LocationInput';

interface FormilyLocationInputProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyLocationInput = ({ fieldMeta }: FormilyLocationInputProps) => {
  const field = useField() as Field;
  const config = getLocationConfig(fieldMeta);
  const value = field.value as LocationFieldValue | string | undefined;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((val: unknown) =>
      validateLocationValue(val, config, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.required, config]);

  return (
    <LocationInput
      field={fieldMeta}
      value={value}
      error={error}
      onChange={(next) => field.onInput(next)}
    />
  );
};
