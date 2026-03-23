import {
  TextInput,
  TextArea,
  Dropdown,
  DatePicker,
  DatePickerInput,
  TimePicker,
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  FileUploaderDropContainer,
} from '@carbon/react';
import { FIELD_TYPE_LABELS, type FormFieldInstance } from '../../types/form-builder.types';

interface FieldRendererProps {
  field: FormFieldInstance;
}

/**
 * Disabled/non-interactive preview of a field.
 * Used inside the DragOverlay for canvas field reordering.
 */
export const FieldRenderer = ({ field }: FieldRendererProps) => {
  const options = field.options ?? [];
  const prefix = `renderer-${field.id}`;

  switch (field.type) {
    case 'shortText':
      return (
        <TextInput
          id={`${prefix}-short`}
          labelText=""
          hideLabel
          disabled
          placeholder={FIELD_TYPE_LABELS.shortText}
          value=""
        />
      );

    case 'longText':
      return (
        <TextArea
          id={`${prefix}-long`}
          labelText=""
          hideLabel
          disabled
          placeholder={FIELD_TYPE_LABELS.longText}
          rows={2}
          value=""
        />
      );

    case 'radio':
      return (
        <RadioButtonGroup
          name={`${prefix}-radio`}
          legendText=""
          disabled
          valueSelected=""
          orientation="vertical"
        >
          {options.map((opt) => (
            <RadioButton
              key={opt.id}
              id={`${prefix}-radio-${opt.id}`}
              value={opt.id}
              labelText={opt.label}
            />
          ))}
        </RadioButtonGroup>
      );

    case 'checkbox':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {options.map((opt) => (
            <Checkbox
              key={opt.id}
              id={`${prefix}-check-${opt.id}`}
              labelText={opt.label}
              disabled
            />
          ))}
        </div>
      );

    case 'dropdown':
      return (
        <Dropdown
          id={`${prefix}-dropdown`}
          titleText=""
          label={FIELD_TYPE_LABELS.dropdown}
          items={options.map((opt) => ({ id: opt.id, text: opt.label }))}
          itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
          disabled
        />
      );

    case 'yesNo':
      return (
        <RadioButtonGroup
          name={`${prefix}-yesno`}
          legendText=""
          disabled
          valueSelected=""
        >
          <RadioButton id={`${prefix}-yes`} value="yes" labelText="Да" />
          <RadioButton id={`${prefix}-no`} value="no" labelText="Нет" />
        </RadioButtonGroup>
      );

    case 'number':
      return (
        <TextInput
          id={`${prefix}-number`}
          labelText=""
          hideLabel
          disabled
          type="number"
          placeholder={FIELD_TYPE_LABELS.number}
          value=""
        />
      );

    case 'fullName':
      return (
        <TextInput
          id={`${prefix}-fullname`}
          labelText=""
          hideLabel
          disabled
          placeholder={FIELD_TYPE_LABELS.fullName}
          value=""
        />
      );

    case 'phone':
      return (
        <TextInput
          id={`${prefix}-phone`}
          labelText=""
          hideLabel
          disabled
          type="tel"
          placeholder="+7 (___) ___-__-__"
          value=""
        />
      );

    case 'email':
      return (
        <TextInput
          id={`${prefix}-email`}
          labelText=""
          hideLabel
          disabled
          type="email"
          placeholder="example@mail.com"
          value=""
        />
      );

    case 'dateTime':
      return (
        <DatePicker datePickerType="single">
          <DatePickerInput
            id={`${prefix}-datetime`}
            placeholder={FIELD_TYPE_LABELS.dateTime}
            labelText=""
            hideLabel
            disabled
          />
        </DatePicker>
      );

    case 'date':
      return (
        <DatePicker datePickerType="single">
          <DatePickerInput
            id={`${prefix}-date`}
            placeholder={FIELD_TYPE_LABELS.date}
            labelText=""
            hideLabel
            disabled
          />
        </DatePicker>
      );

    case 'time':
      return (
        <TimePicker
          id={`${prefix}-time`}
          labelText=""
          hideLabel
          disabled
          placeholder={FIELD_TYPE_LABELS.time}
          value=""
        />
      );

    case 'group':
      return (
        <div
          style={{
            padding: 12,
            background: 'var(--cds-layer-accent)',
            border: '1px dashed var(--cds-border-subtle)',
            borderRadius: 4,
            color: 'var(--cds-text-secondary)',
            fontSize: '0.75rem',
          }}
        >
          {FIELD_TYPE_LABELS.group}
          {field.children && field.children.length > 0
            ? ` (${field.children.length})`
            : ''}
        </div>
      );

    case 'file_vector':
    case 'file_image':
    case 'file_document':
      return (
        <FileUploaderDropContainer
          labelText={FIELD_TYPE_LABELS[field.type]}
          disabled
          style={{ pointerEvents: 'none' as const }}
        />
      );

    case 'address':
      return (
        <TextInput
          id={`${prefix}-address`}
          labelText=""
          hideLabel
          disabled
          placeholder={FIELD_TYPE_LABELS.address}
          value=""
        />
      );
  }
};
