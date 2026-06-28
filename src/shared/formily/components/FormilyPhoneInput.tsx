import { useEffect } from 'react';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { validatePhoneValue } from '../../utils/fieldValueValidation';
import { PhoneInput } from '../../ui/PhoneInput';

interface FormilyPhoneInputProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyPhoneInput = ({ fieldMeta }: FormilyPhoneInputProps) => {
  const field = useField() as Field;

  useEffect(() => {
    field.setValidator((value: unknown) =>
      validatePhoneValue(value, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.required]);

  return (
    <PhoneInput
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={(next) => field.onInput(next)}
      status={field.selfErrors[0] ? 'error' : undefined}
    />
  );
};
