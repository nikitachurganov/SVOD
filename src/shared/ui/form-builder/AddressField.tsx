import { useEffect } from 'react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormCtx } from '../../hooks/useFormCtx';
import { getAddressFillConfig } from '../../utils/fieldConfig';
import { validateAddressValue } from '../../utils/fieldValueValidation';
import type { AddressFieldValue } from '../../types/field-values.types';
import { AddressSuggestInput } from './AddressSuggestInput';

interface AddressFieldProps {
  field: FormFieldInstance;
}

export const AddressField = ({ field }: AddressFieldProps) => {
  const ctx = useFormCtx();
  const config = getAddressFillConfig(field);

  useEffect(() => {
    ctx.registerField(field.id, [
      {
        validator: (_: unknown, value: unknown) => {
          const message = validateAddressValue(value, config, field.required);
          return message ? Promise.reject(new Error(message)) : Promise.resolve();
        },
      },
    ]);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required, config, ctx]);

  const value = ctx.values[field.id] as AddressFieldValue | string | undefined;
  const error = ctx.errors[field.id];

  return (
    <AddressSuggestInput
      field={field}
      value={value}
      error={error}
      onChange={(next) => ctx.setFieldValue(field.id, next)}
    />
  );
};
