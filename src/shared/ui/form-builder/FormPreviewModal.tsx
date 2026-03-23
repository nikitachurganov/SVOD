import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  DatePickerInput,
  Dropdown,
  FileUploaderDropContainer,
  Modal,
  RadioButton,
  Tag,
  TextArea,
  TextInput,
  TimePicker,
} from '@carbon/react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import {
  useFormStore,
  useFormCtx,
  FormProvider,
  type Rule,
} from '../../hooks/useFormStore';
import { AddressField } from './AddressField';
import { FieldLabel } from './FieldLabel';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FormPreviewModalProps {
  open: boolean;
  onClose: () => void;
  formTitle: string;
  fields: FormFieldInstance[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getFileAccept = (type: FormFieldInstance['type']): string[] => {
  switch (type) {
    case 'file_vector':
      return ['.svg', '.ai', '.eps', '.pdf'];
    case 'file_image':
      return ['image/*'];
    case 'file_document':
      return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    default:
      return [];
  }
};

const getFileUploadPrompt = (type: FormFieldInstance['type']): string => {
  switch (type) {
    case 'file_vector':
      return 'Нажмите или перетащите векторный файл для загрузки';
    case 'file_image':
      return 'Нажмите или перетащите изображение для загрузки';
    case 'file_document':
    default:
      return 'Нажмите или перетащите документ для загрузки';
  }
};

// ─── FileUploadField ──────────────────────────────────────────────────────────

interface FileUploadFieldProps {
  field: FormFieldInstance;
}

const FileUploadField = ({ field }: FileUploadFieldProps) => {
  const ctx = useFormCtx();

  useEffect(() => {
    const rules: Rule[] = field.required
      ? [
          {
            validator: (_: unknown, value: unknown) =>
              value && Array.isArray(value) && value.length > 0
                ? Promise.resolve()
                : Promise.reject(new Error('Загрузите файл')),
          },
        ]
      : [];
    ctx.registerField(field.id, rules);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required]);

  const files = (ctx.values[field.id] as File[]) ?? [];
  const error = ctx.errors[field.id];

  return (
    <div style={{ marginBottom: 24 }}>
      {field.label && <FieldLabel label={field.label} required={field.required} />}
      <FileUploaderDropContainer
        accept={getFileAccept(field.type)}
        labelText={getFileUploadPrompt(field.type)}
        onAddFiles={(_evt: unknown, { addedFiles }: { addedFiles: File[] }) => {
          ctx.setFieldValue(field.id, [...files, ...addedFiles]);
        }}
      />
      {field.description && (
        <div style={{ color: 'var(--cds-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--cds-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
};

// ─── CheckboxGroupField ───────────────────────────────────────────────────────

interface CheckboxGroupFieldProps {
  options: { label: string; value: string }[];
  value?: string[];
  onChange?: (values: string[]) => void;
}

const CheckboxGroupField = ({
  options,
  value = [],
  onChange,
}: CheckboxGroupFieldProps) => {
  const toggle = (optValue: string) => {
    const next = value.includes(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange?.(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const checked = value.includes(opt.value);
        return (
          <div
            key={opt.value}
            onClick={() => toggle(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: `1px solid ${checked ? 'var(--cds-interactive)' : 'var(--cds-border-subtle)'}`,
              borderRadius: 4,
              background: checked ? 'var(--cds-highlight)' : 'var(--cds-layer)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Checkbox
                id={`cbg-${opt.value}`}
                labelText={opt.label}
                hideLabel
                checked={checked}
                onChange={() => {}}
              />
            </span>
            <span>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── RadioGroupField ──────────────────────────────────────────────────────────

interface RadioGroupFieldProps {
  options: { label: string; value: string }[];
  value?: string;
  onChange?: (value: string) => void;
}

const RadioGroupField = ({ options, value, onChange }: RadioGroupFieldProps) => {
  const select = (optValue: string) => {
    if (optValue === value) return;
    onChange?.(optValue);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => select(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: `1px solid ${checked ? 'var(--cds-interactive)' : 'var(--cds-border-subtle)'}`,
              borderRadius: 4,
              background: checked ? 'var(--cds-highlight)' : 'var(--cds-layer)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <RadioButton
                id={`rbg-${opt.value}`}
                value={opt.value}
                labelText={opt.label}
                hideLabel
                checked={checked}
              />
            </span>
            <span>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── YesNoRadioGroupField ─────────────────────────────────────────────────────

interface YesNoRadioGroupFieldProps {
  value?: string;
  onChange?: (value: string) => void;
}

const YesNoRadioGroupField = ({ value, onChange }: YesNoRadioGroupFieldProps) => {
  const select = (optValue: string) => {
    if (optValue === value) return;
    onChange?.(optValue);
  };

  const options = [
    { label: 'Да', value: 'yes' },
    { label: 'Нет', value: 'no' },
  ];

  return (
    <div style={{ width: '100%', display: 'flex', gap: 12 }}>
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => select(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: `1px solid ${checked ? 'var(--cds-interactive)' : 'var(--cds-border-subtle)'}`,
              borderRadius: 4,
              background: checked ? 'var(--cds-highlight)' : 'var(--cds-layer)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'border-color 0.2s ease, background 0.2s ease',
              flex: 1,
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <RadioButton
                id={`yesno-${opt.value}`}
                value={opt.value}
                labelText={opt.label}
                hideLabel
                checked={checked}
              />
            </span>
            <span>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Single field renderer ────────────────────────────────────────────────────

interface PreviewFieldProps {
  field: FormFieldInstance;
}

export const PreviewField = ({ field }: PreviewFieldProps) => {
  const ctx = useFormCtx();

  // ── Group: titled section with nested fields ────────────────────────────
  if (field.type === 'group') {
    const children = field.children ?? [];
    return (
      <div style={{ marginBottom: 16 }}>
        {field.label && (
          <span style={{ fontWeight: 600, fontSize: '1rem', display: 'block', marginBottom: 4 }}>
            {field.label}
          </span>
        )}
        {field.description && (
          <span
            style={{ color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 12 }}
          >
            {field.description}
          </span>
        )}
        {children.length > 0 ? (
          children.map((child) => <PreviewField key={child.id} field={child} />)
        ) : (
          <span style={{ color: 'var(--cds-text-secondary)', fontStyle: 'italic', fontSize: '0.75rem' }}>
            В группе нет полей
          </span>
        )}
      </div>
    );
  }

  // ── Address ─────────────────────────────────────────────────────────────
  if (field.type === 'address') {
    return <AddressField field={field} />;
  }

  // ── File upload ─────────────────────────────────────────────────────────
  if (
    field.type === 'file_vector' ||
    field.type === 'file_image' ||
    field.type === 'file_document'
  ) {
    return <FileUploadField field={field} />;
  }

  // ── Standard fields ─────────────────────────────────────────────────────
  const options = (field.options ?? []).map((o) => ({ label: o.label, value: o.id }));

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    let rules: Rule[] = [];
    if (field.type === 'checkbox') {
      rules = field.required
        ? [
            {
              validator: (_: unknown, value: unknown) =>
                value && Array.isArray(value) && (value as string[]).length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error('Выберите хотя бы один вариант')),
            },
          ]
        : [];
    } else {
      rules = field.required
        ? [{ required: true, message: 'Это поле обязательно для заполнения' }]
        : [];
    }
    ctx.registerField(field.id, rules);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required, field.type]);

  const value = ctx.values[field.id];
  const error = ctx.errors[field.id];

  const renderControl = () => {
    switch (field.type) {
      case 'shortText':
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            placeholder={field.description || undefined}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'longText':
        return (
          <TextArea
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            rows={3}
            placeholder={field.description || undefined}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'radio': {
        const radioOptions = options.length
          ? options
          : [{ label: 'Вариант 1', value: '__1' }];
        return (
          <RadioGroupField
            options={radioOptions}
            value={value as string | undefined}
            onChange={(v) => ctx.setFieldValue(field.id, v)}
          />
        );
      }

      case 'checkbox': {
        const checkboxOptions = options.length
          ? options
          : [{ label: 'Вариант 1', value: '__1' }];
        return (
          <CheckboxGroupField
            options={checkboxOptions}
            value={(value as string[]) ?? []}
            onChange={(v) => ctx.setFieldValue(field.id, v)}
          />
        );
      }

      case 'dropdown': {
        type DropdownItem = { label: string; value: string };
        const selectedItem = options.find((o) => o.value === value) ?? null;
        return (
          <Dropdown
            id={`field-${field.id}`}
            titleText=""
            label="Выберите вариант"
            items={options}
            itemToString={(item: DropdownItem | null) => item?.label ?? ''}
            selectedItem={selectedItem}
            onChange={({ selectedItem: sel }: { selectedItem: DropdownItem | null }) => {
              ctx.setFieldValue(field.id, sel?.value ?? null);
            }}
            invalid={!!error}
            invalidText={error}
          />
        );
      }

      case 'yesNo':
        return (
          <YesNoRadioGroupField
            value={value as string | undefined}
            onChange={(v) => ctx.setFieldValue(field.id, v)}
          />
        );

      case 'number':
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            type="number"
            placeholder={field.description || 'Введите число'}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'fullName':
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            placeholder={field.description || 'Полное имя'}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'phone':
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            type="tel"
            placeholder={field.description || '+7 (___) ___-__-__'}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'email':
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            type="email"
            placeholder={field.description || 'example@mail.com'}
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      case 'dateTime':
        return (
          <DatePicker
            datePickerType="single"
            value={value ? [value as Date] : []}
            onChange={(dates: Date[]) => ctx.setFieldValue(field.id, dates[0])}
          >
            <DatePickerInput
              id={`field-${field.id}`}
              placeholder="dd/mm/yyyy"
              labelText=""
              hideLabel
              invalid={!!error}
              invalidText={error}
            />
          </DatePicker>
        );

      case 'date':
        return (
          <DatePicker
            datePickerType="single"
            value={value ? [value as Date] : []}
            onChange={(dates: Date[]) => ctx.setFieldValue(field.id, dates[0])}
          >
            <DatePickerInput
              id={`field-${field.id}`}
              placeholder="dd/mm/yyyy"
              labelText=""
              hideLabel
              invalid={!!error}
              invalidText={error}
            />
          </DatePicker>
        );

      case 'time':
        return (
          <TimePicker
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
            invalid={!!error}
            invalidText={error}
          />
        );

      default:
        return (
          <TextInput
            id={`field-${field.id}`}
            labelText=""
            hideLabel
            value={(value as string) ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              ctx.setFieldValue(field.id, e.target.value)
            }
          />
        );
    }
  };

  const hasInlineError = [
    'shortText',
    'longText',
    'number',
    'fullName',
    'phone',
    'email',
    'dropdown',
    'dateTime',
    'date',
    'time',
  ].includes(field.type);

  return (
    <div style={{ marginBottom: 24 }}>
      {field.label && <FieldLabel label={field.label} required={field.required} />}
      {renderControl()}
      {field.description && (
        <div style={{ color: 'var(--cds-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      )}
      {error && !hasInlineError && (
        <div style={{ color: 'var(--cds-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

export const FormPreviewModal = ({
  open,
  onClose,
  formTitle,
  fields,
}: FormPreviewModalProps) => {
  const store = useFormStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      store.resetFields();
    }
  }, [open]);

  const handleClose = () => {
    store.resetFields();
    onClose();
  };

  const handleMockSubmit = async () => {
    try {
      await store.validateFields();
      setIsSubmitting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      store.resetFields();
    } catch {
      // Validation errors are shown inline
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasFields = fields.length > 0;

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      modalHeading={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Предпросмотр формы
          <Tag type="blue" size="sm" style={{ fontWeight: 400, fontSize: 12 }}>
            Только просмотр
          </Tag>
        </div>
      }
      passiveModal
      size="lg"
    >
      {/* Form header */}
      <div
        style={{
          borderBottom: '1px solid var(--cds-border-subtle)',
          paddingBottom: 16,
          marginBottom: 24,
          paddingTop: 8,
        }}
      >
        <h4 style={{ margin: 0 }}>
          {formTitle || (
            <span style={{ color: 'var(--cds-text-secondary)', fontStyle: 'italic', fontWeight: 'normal' }}>
              Название не задано
            </span>
          )}
        </h4>
      </div>

      {/* Fields */}
      {hasFields ? (
        <FormProvider store={store}>
          {fields.map((field) => (
            <PreviewField key={field.id} field={field} />
          ))}

          <hr style={{ border: 'none', borderTop: '1px solid var(--cds-border-subtle)', marginTop: 8 }} />

          <Button
            kind="primary"
            onClick={handleMockSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправка...' : 'Отправить'}
          </Button>
        </FormProvider>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <span style={{ color: 'var(--cds-text-secondary)' }}>
            В форму не добавлено ни одного поля.
          </span>
        </div>
      )}
    </Modal>
  );
};
