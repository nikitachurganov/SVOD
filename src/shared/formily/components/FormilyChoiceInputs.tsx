import { useEffect } from 'react';
import { Input, Select } from 'antd';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldInstance } from '../../types/form-builder.types';
import {
  getOtherOption,
  hasOtherOption,
  parseRadioValue,
} from '../../utils/choiceField.utils';
import {
  validateCheckboxChoiceValue,
  validateRadioChoiceValue,
} from '../../utils/fieldValueValidation';
import { CheckboxChoiceField, RadioChoiceField } from '../../ui/form-builder/ChoiceFieldInputs';
import { FieldLabel } from '../../ui/form-builder/FieldLabel';

interface FormilyRadioChoiceProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyRadioChoice = ({ fieldMeta }: FormilyRadioChoiceProps) => {
  const field = useField() as Field;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((value: unknown) =>
      validateRadioChoiceValue(value, fieldMeta.options, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.options, fieldMeta.required]);

  return (
    <div style={{ marginBottom: 24 }}>
      {fieldMeta.label ? <FieldLabel label={fieldMeta.label} required={fieldMeta.required} /> : null}
      <RadioChoiceField
        options={fieldMeta.options ?? []}
        value={field.value}
        onChange={(value) => field.onInput(value)}
      />
      {error ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};

interface FormilyCheckboxChoiceProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyCheckboxChoice = ({ fieldMeta }: FormilyCheckboxChoiceProps) => {
  const field = useField() as Field;
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((value: unknown) =>
      validateCheckboxChoiceValue(value, fieldMeta.options, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.options, fieldMeta.required]);

  return (
    <div style={{ marginBottom: 24 }}>
      {fieldMeta.label ? <FieldLabel label={fieldMeta.label} required={fieldMeta.required} /> : null}
      <CheckboxChoiceField
        options={fieldMeta.options ?? []}
        value={field.value}
        onChange={(value) => field.onInput(value)}
      />
      {error ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};

interface FormilyDropdownChoiceProps {
  fieldMeta: FormFieldInstance;
}

export const FormilyDropdownChoice = ({ fieldMeta }: FormilyDropdownChoiceProps) => {
  const field = useField() as Field;
  const error = field.selfErrors[0];
  const options = fieldMeta.options ?? [];
  const parsed = parseRadioValue(field.value);
  const otherOption = getOtherOption(options);
  const showOtherInput = Boolean(otherOption && parsed.selected === otherOption.id);

  useEffect(() => {
    field.setValidator((value: unknown) =>
      validateRadioChoiceValue(value, fieldMeta.options, fieldMeta.required) ?? '',
    );
  }, [field, fieldMeta.options, fieldMeta.required]);

  return (
    <div style={{ marginBottom: 24 }}>
      {fieldMeta.label ? <FieldLabel label={fieldMeta.label} required={fieldMeta.required} /> : null}
      <Select
        placeholder="Выберите вариант"
        value={parsed.selected || undefined}
        onChange={(sel) => {
          if (!sel) {
            field.onInput(hasOtherOption(options) ? { selected: '', otherText: '' } : '');
            return;
          }
          if (hasOtherOption(options)) {
            field.onInput({
              selected: sel,
              otherText: sel === otherOption?.id ? parsed.otherText : undefined,
            });
            return;
          }
          field.onInput(sel);
        }}
        options={options.map((opt) => ({ label: opt.label, value: opt.id }))}
        style={{ width: '100%' }}
        allowClear
      />
      {showOtherInput && (
        <Input
          placeholder="Укажите свой вариант"
          value={parsed.otherText}
          onChange={(e) =>
            otherOption && field.onInput({ selected: otherOption.id, otherText: e.target.value })
          }
          style={{ marginTop: 8 }}
        />
      )}
      {error ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
