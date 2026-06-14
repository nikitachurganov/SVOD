import {
  Input,
  Select,
  DatePicker,
  TimePicker,
  Radio,
  Upload,
  Rate,
  Slider,
} from 'antd';
import { FieldOptionsEditor } from './FieldOptionsEditor';
import {
  FIELD_TYPE_LABELS,
  type FieldOption,
  type FormFieldInstance,
} from '../../types/form-builder.types';

const { TextArea } = Input;

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
        <Input
          id={`${prefix}-short`}
          disabled
          placeholder="Короткий текст"
          value=""
        />
      );

    case 'longText':
      return (
        <TextArea
          id={`${prefix}-long`}
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
          <Select
            id={`${prefix}-dropdown`}
            disabled
            placeholder="Выпадающий список"
            options={field.options?.map((opt) => ({ value: opt.id, label: opt.label })) ?? []}
            style={{ width: '100%', marginBottom: 12 }}
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
        <Radio.Group name={`${prefix}-yesno`} disabled value="">
          <Radio value="yes">Да</Radio>
          <Radio value="no">Нет</Radio>
        </Radio.Group>
      );

    case 'number':
      return (
        <Input
          id={`${prefix}-number`}
          disabled
          type="number"
          placeholder="Число"
          value=""
        />
      );

    case 'fullName':
      return (
        <Input
          id={`${prefix}-fullname`}
          disabled
          placeholder="Полное имя"
          value=""
        />
      );

    case 'phone':
      return (
        <Input
          id={`${prefix}-phone`}
          disabled
          type="tel"
          placeholder="+7 (___) ___-__-__"
          value=""
        />
      );

    case 'email':
      return (
        <Input
          id={`${prefix}-email`}
          disabled
          type="email"
          placeholder="example@mail.com"
          value=""
        />
      );

    case 'dateTime':
      return (
        <DatePicker
          id={`${prefix}-datetime`}
          showTime
          disabled
          placeholder="Дата и время"
          style={{ width: '100%' }}
        />
      );

    case 'date':
      return (
        <DatePicker
          id={`${prefix}-date`}
          disabled
          placeholder="Дата"
          style={{ width: '100%' }}
        />
      );

    case 'time':
      return (
        <TimePicker
          id={`${prefix}-time`}
          disabled
          placeholder="Время"
          style={{ width: '100%' }}
        />
      );

    case 'group':
      return null;

    case 'file_vector':
    case 'file_image':
    case 'file_document':
      return (
        <Upload.Dragger disabled style={{ pointerEvents: 'none' as const }}>
          <p style={{ margin: 0 }}>{FIELD_TYPE_LABELS[field.type]}</p>
        </Upload.Dragger>
      );

    case 'address':
      return (
        <Input
          id={`${prefix}-address`}
          disabled
          placeholder="Начните вводить адрес..."
          value=""
        />
      );

    case 'location':
      return (
        <Select
          id={`${prefix}-location`}
          disabled
          placeholder="Города и страны"
          style={{ width: '100%' }}
        />
      );

    case 'rating':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Rate disabled count={5} />
          <Slider disabled min={1} max={5} />
        </div>
      );
  }
};
