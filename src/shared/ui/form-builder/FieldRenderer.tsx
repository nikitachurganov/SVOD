import {
  Input,
  Select,
  DatePicker,
  TimePicker,
  Radio,
  Checkbox,
  Upload,
  Rate,
  Slider,
} from 'antd';
import { FIELD_TYPE_LABELS, type FormFieldInstance } from '../../types/form-builder.types';

const { TextArea } = Input;

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
        <Input
          id={`${prefix}-short`}
          disabled
          placeholder={FIELD_TYPE_LABELS.shortText}
          value=""
        />
      );

    case 'longText':
      return (
        <TextArea
          id={`${prefix}-long`}
          disabled
          placeholder={FIELD_TYPE_LABELS.longText}
          rows={2}
          value=""
        />
      );

    case 'radio':
      return (
        <Radio.Group
          name={`${prefix}-radio`}
          disabled
          value=""
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          {options.map((opt) => (
            <Radio key={opt.id} value={opt.id}>
              {opt.label}
            </Radio>
          ))}
        </Radio.Group>
      );

    case 'checkbox':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {options.map((opt) => (
            <Checkbox key={opt.id} disabled>
              {opt.label}
            </Checkbox>
          ))}
        </div>
      );

    case 'dropdown':
      return (
        <Select
          id={`${prefix}-dropdown`}
          disabled
          placeholder={FIELD_TYPE_LABELS.dropdown}
          options={options.map((opt) => ({ value: opt.id, label: opt.label }))}
          style={{ width: '100%' }}
        />
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
          placeholder={FIELD_TYPE_LABELS.number}
          value=""
        />
      );

    case 'fullName':
      return (
        <Input
          id={`${prefix}-fullname`}
          disabled
          placeholder={FIELD_TYPE_LABELS.fullName}
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
          placeholder={FIELD_TYPE_LABELS.dateTime}
          style={{ width: '100%' }}
        />
      );

    case 'date':
      return (
        <DatePicker
          id={`${prefix}-date`}
          disabled
          placeholder={FIELD_TYPE_LABELS.date}
          style={{ width: '100%' }}
        />
      );

    case 'time':
      return (
        <TimePicker
          id={`${prefix}-time`}
          disabled
          placeholder={FIELD_TYPE_LABELS.time}
          style={{ width: '100%' }}
        />
      );

    case 'group':
      return (
        <div
          style={{
            padding: 12,
            background: 'var(--app-surface-accent)',
            border: '1px dashed var(--app-border)',
            borderRadius: 4,
            color: 'var(--app-text-secondary)',
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
        <Upload.Dragger disabled style={{ pointerEvents: 'none' as const }}>
          <p style={{ margin: 0 }}>{FIELD_TYPE_LABELS[field.type]}</p>
        </Upload.Dragger>
      );

    case 'address':
      return (
        <Input
          id={`${prefix}-address`}
          disabled
          placeholder={FIELD_TYPE_LABELS.address}
          value=""
        />
      );

    case 'location':
      return (
        <Select
          id={`${prefix}-location`}
          disabled
          placeholder={FIELD_TYPE_LABELS.location}
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
