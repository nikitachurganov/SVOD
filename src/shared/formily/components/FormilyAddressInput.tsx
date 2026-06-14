import { useEffect } from 'react';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { getAddressFillConfig } from '../../utils/fieldConfig';
import { validateAddressValue } from '../../utils/fieldValueValidation';
import type { AddressFieldValue } from '../../types/field-values.types';
import { AddressSuggestInput } from '../../ui/form-builder/AddressSuggestInput';

interface FormilyAddressInputProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyAddressInput = ({ fieldMeta }: FormilyAddressInputProps) => {
  const field = useField() as Field;
  const config = getAddressFillConfig(fieldMeta);
  const value = field.value as AddressFieldValue | string | undefined;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((val: unknown) =>
      validateAddressValue(val, config, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.required, config]);

  return (
    <AddressSuggestInput
      field={fieldMeta}
      value={value}
      error={error}
      onChange={(next) => field.onInput(next)}
    />
  );
};
