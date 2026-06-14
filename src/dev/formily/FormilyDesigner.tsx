import { Button, Checkbox, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

import type {
  FieldOption,
  FormFieldInstance,
  FormPageInstance,
} from '../../shared/types/form-builder.types';
import {
  POC_FIELD_LABELS,
  POC_FIELD_TYPES,
  type PocFieldType,
} from '../../shared/formily/supportedTypes';

interface FormilyDesignerProps {
  formTitle: string;
  pages: FormPageInstance[];
  onTitleChange: (title: string) => void;
  onPagesChange: (pages: FormPageInstance[]) => void;
}

const createField = (type: PocFieldType): FormFieldInstance => {
  const base: FormFieldInstance = {
    id: crypto.randomUUID(),
    type,
    label: POC_FIELD_LABELS[type],
    description: '',
    required: false,
  };

  if (type === 'dropdown' || type === 'checkbox') {
    base.options = [
      { id: crypto.randomUUID(), label: 'Вариант 1' },
      { id: crypto.randomUUID(), label: 'Вариант 2' },
    ];
  }

  return base;
};

const updatePageFields = (
  pages: FormPageInstance[],
  updater: (fields: FormFieldInstance[]) => FormFieldInstance[],
): FormPageInstance[] => {
  if (pages.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        title: 'Страница 1',
        fields: updater([]),
      },
    ];
  }

  return pages.map((page, index) =>
    index === 0 ? { ...page, fields: updater(page.fields) } : page,
  );
};

export const FormilyDesigner = ({
  formTitle,
  pages,
  onTitleChange,
  onPagesChange,
}: FormilyDesignerProps) => {
  const fields = pages[0]?.fields ?? [];

  const setFields = (next: FormFieldInstance[]) => {
    onPagesChange(updatePageFields(pages, () => next));
  };

  const handleAddField = (type: PocFieldType) => {
    setFields([...fields, createField(type)]);
  };

  const handleRemoveField = (fieldId: string) => {
    setFields(fields.filter((field) => field.id !== fieldId));
  };

  const handleFieldChange = (
    fieldId: string,
    patch: Partial<FormFieldInstance>,
  ) => {
    setFields(
      fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    );
  };

  const handleOptionChange = (
    fieldId: string,
    optionId: string,
    label: string,
  ) => {
    setFields(
      fields.map((field) => {
        if (field.id !== fieldId || !field.options) return field;
        return {
          ...field,
          options: field.options.map((opt) =>
            opt.id === optionId ? { ...opt, label } : opt,
          ),
        };
      }),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        placeholder="Название формы"
        value={formTitle}
        onChange={(event) => onTitleChange(event.target.value)}
        style={{ maxWidth: 480 }}
      />

      <Space wrap>
        {POC_FIELD_TYPES.map((type) => (
          <Button
            key={type}
            icon={<PlusOutlined />}
            onClick={() => handleAddField(type)}
          >
            {POC_FIELD_LABELS[type]}
          </Button>
        ))}
      </Space>

      {fields.length === 0 ? (
        <p style={{ color: 'var(--app-text-secondary)', margin: 0 }}>
          Добавьте поля для POC-формы (5 типов).
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map((field) => (
            <FieldEditorCard
              key={field.id}
              field={field}
              onChange={(patch) => handleFieldChange(field.id, patch)}
              onOptionChange={(optionId, label) =>
                handleOptionChange(field.id, optionId, label)
              }
              onRemove={() => handleRemoveField(field.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FieldEditorCardProps {
  field: FormFieldInstance;
  onChange: (patch: Partial<FormFieldInstance>) => void;
  onOptionChange: (optionId: string, label: string) => void;
  onRemove: () => void;
}

const FieldEditorCard = ({
  field,
  onChange,
  onOptionChange,
  onRemove,
}: FieldEditorCardProps) => {
  const hasOptions = field.type === 'dropdown' || field.type === 'checkbox';

  return (
    <div
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--app-surface)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <strong style={{ color: 'var(--app-text)' }}>
          {POC_FIELD_LABELS[field.type as PocFieldType] ?? field.type}
        </strong>
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
          aria-label="Удалить поле"
        />
      </div>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          placeholder="Метка поля"
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
        <Input
          placeholder="Описание / placeholder"
          value={field.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <Checkbox
          checked={field.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        >
          Обязательное поле
        </Checkbox>

        {hasOptions && field.options ? (
          <OptionsEditor
            options={field.options}
            onOptionChange={onOptionChange}
          />
        ) : null}
      </Space>
    </div>
  );
};

interface OptionsEditorProps {
  options: FieldOption[];
  onOptionChange: (optionId: string, label: string) => void;
}

const OptionsEditor = ({ options, onOptionChange }: OptionsEditorProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <span style={{ color: 'var(--app-text-secondary)', fontSize: 13 }}>
      Варианты ответа
    </span>
    {options.map((option) => (
      <Input
        key={option.id}
        value={option.label}
        onChange={(event) => onOptionChange(option.id, event.target.value)}
      />
    ))}
  </div>
);
