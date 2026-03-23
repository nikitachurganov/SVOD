import {
  TextInput,
  TextArea,
  Dropdown,
  DatePicker,
  DatePickerInput,
  TimePicker,
  RadioButton,
  RadioButtonGroup,
  FileUploaderDropContainer,
} from '@carbon/react';
import { FieldOptionsEditor } from './FieldOptionsEditor';
import {
  FIELD_TYPE_LABELS,
  type FieldOption,
  type FormFieldInstance,
} from '../../types/form-builder.types';

interface FieldPreviewProps {
  field: FormFieldInstance;
  onOptionsChange: (options: FieldOption[]) => void;
}

/**
 * Renders the interactive preview / editor for a field block on the canvas.
 * Options-based types (radio, checkbox, dropdown) render an editable options list.
 * All other types render a disabled, non-interactive component.
 * Groups are rendered by GroupBlock and return null here.
 */
export const FieldPreview = ({ field, onOptionsChange }: FieldPreviewProps) => {
  const prefix = `preview-${field.id}`;

  switch (field.type) {
    case 'shortText':
      return (
        <TextInput
          id={`${prefix}-short`}
          labelText=""
          hideLabel
          disabled
          placeholder="Короткий текст"
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
          placeholder="Длинный текст"
          rows={2}
          value=""
        />
      );

    case 'radio':
    case 'checkbox':
      return field.options ? (
        <FieldOptionsEditor
          fieldType={field.type}
          options={field.options}
          onChange={onOptionsChange}
        />
      ) : null;

    case 'dropdown':
      return (
        <>
          <Dropdown
            id={`${prefix}-dropdown`}
            titleText=""
            label="Выпадающий список"
            items={field.options?.map((opt) => ({ id: opt.id, text: opt.label })) ?? []}
            itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
            disabled
            style={{ marginBottom: 12 }}
          />
          {field.options && (
            <FieldOptionsEditor
              fieldType="dropdown"
              options={field.options}
              onChange={onOptionsChange}
            />
          )}
        </>
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
          placeholder="Число"
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
          placeholder="Полное имя"
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
            placeholder="Дата и время"
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
            placeholder="Дата"
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
          placeholder="Время"
          value=""
        />
      );

    case 'group':
      return null;

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
          placeholder="Начните вводить адрес..."
          value=""
        />
      );
  }
};
