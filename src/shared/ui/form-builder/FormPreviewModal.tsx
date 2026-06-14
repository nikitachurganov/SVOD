import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Radio,
  Select,
  Tag,
  TimePicker,
  Upload,
  message,
} from 'antd';
import dayjs from 'dayjs';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormStore } from '../../hooks/useFormStore';
import { useFormCtx } from '../../hooks/useFormCtx';
import { FormProvider } from '../../hooks/FormProvider';
import type { Rule } from '../../hooks/formStore.types';
import { REQUIRED_FIELD_MESSAGE } from '../../constants/formValidation';
import {
  validateCheckboxChoiceValue,
  validateFullNameValue,
  validatePhoneValue,
  validateRadioChoiceValue,
  validateYesNoValue,
} from '../../utils/fieldValueValidation';
import { validateFieldFile } from '../../utils/fileFieldValidation';
import {
  getOtherOption,
  hasOtherOption,
  parseRadioValue,
} from '../../utils/choiceField.utils';
import { AddressField } from './AddressField';
import { LocationField } from './LocationField';
import { RatingField } from './RatingField';
import { FieldLabel } from './FieldLabel';
import { CheckboxChoiceField, RadioChoiceField } from './ChoiceFieldInputs';

const { TextArea } = Input;

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
  const { registerField, unregisterField, values, errors, setFieldValue } = useFormCtx();

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
    registerField(field.id, rules);
    return () => unregisterField(field.id);
  }, [field.id, field.required, registerField, unregisterField]);

  const files = (values[field.id] as File[]) ?? [];
  const error = errors[field.id];

  return (
    <div style={{ marginBottom: 24 }}>
      {field.label && <FieldLabel label={field.label} required={field.required} />}
      <Upload.Dragger
        accept={getFileAccept(field.type).join(',')}
        multiple
        showUploadList
        fileList={files.map((file, index) => ({
          uid: `${field.id}-${index}`,
          name: file.name,
          status: 'done' as const,
        }))}
        beforeUpload={(file) => {
          const fileError = validateFieldFile(file, field.type);
          if (fileError) {
            message.error(fileError);
            return Upload.LIST_IGNORE;
          }
          setFieldValue(field.id, [...files, file]);
          return false;
        }}
        onRemove={(file) => {
          const index = files.findIndex((f) => f.name === file.name);
          if (index === -1) return false;
          const next = [...files];
          next.splice(index, 1);
          setFieldValue(field.id, next);
          return true;
        }}
      >
        <p style={{ margin: 0 }}>{getFileUploadPrompt(field.type)}</p>
      </Upload.Dragger>
      {field.description && (
        <div style={{ color: 'var(--app-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      )}
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
              border: `1px solid ${checked ? 'var(--app-primary)' : 'var(--app-border)'}`,
              borderRadius: 4,
              background: checked ? 'var(--app-highlight)' : 'var(--app-surface)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'border-color 0.2s ease, background 0.2s ease',
              flex: 1,
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Radio checked={checked} value={opt.value} />
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
  const { registerField, unregisterField, values, errors, setFieldValue } = useFormCtx();

  // ── Group: titled section with nested fields ────────────────────────────
  if (field.type === 'group') {
    const children = field.children ?? [];
    const headingId = field.label ? `form-group-${field.id}` : undefined;
    return (
      <section
        className="app-form-field-group"
        aria-labelledby={headingId}
      >
        {field.label && (
          <div className="app-form-field-group__header">
            <h3 id={headingId} className="app-form-field-group__title">
              {field.label}
            </h3>
          </div>
        )}
        {field.description && (
          <p className="app-form-field-group__description">{field.description}</p>
        )}
        {children.length > 0 ? (
          <div className="app-form-field-group__body">
            {children.map((child) => (
              <PreviewField key={child.id} field={child} />
            ))}
          </div>
        ) : (
          <div className="app-form-field-group__body">
            <p className="app-form-field-group__empty">В группе нет полей</p>
          </div>
        )}
      </section>
    );
  }

  // ── Address ─────────────────────────────────────────────────────────────
  if (field.type === 'address') {
    return <AddressField field={field} />;
  }

  // ── Location ────────────────────────────────────────────────────────────
  if (field.type === 'location') {
    return <LocationField field={field} />;
  }

  // ── Rating ──────────────────────────────────────────────────────────────
  if (field.type === 'rating') {
    return <RatingField field={field} />;
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const makeValidator =
      (validate: (value: unknown) => string | null) =>
      (_: unknown, fieldValue: unknown) => {
        const error = validate(fieldValue);
        return error ? Promise.reject(new Error(error)) : Promise.resolve();
      };

    let rules: Rule[] = [];

    switch (field.type) {
      case 'phone':
        rules = [
          {
            validator: makeValidator((fieldValue) =>
              validatePhoneValue(fieldValue, field.required),
            ),
          },
        ];
        break;
      case 'fullName':
        rules = [
          {
            validator: makeValidator((fieldValue) =>
              validateFullNameValue(fieldValue, field.required),
            ),
          },
        ];
        break;
      case 'yesNo':
        rules = [
          {
            validator: makeValidator((fieldValue) =>
              validateYesNoValue(fieldValue, field.required),
            ),
          },
        ];
        break;
      case 'radio':
      case 'dropdown':
        rules = [
          {
            validator: makeValidator((fieldValue) =>
              validateRadioChoiceValue(fieldValue, field.options, field.required),
            ),
          },
        ];
        break;
      case 'checkbox':
        rules = [
          {
            validator: makeValidator((fieldValue) =>
              validateCheckboxChoiceValue(fieldValue, field.options, field.required),
            ),
          },
        ];
        break;
      default:
        if (field.required) {
          rules = [{ required: true, message: REQUIRED_FIELD_MESSAGE }];
        }
    }

    registerField(field.id, rules);
    return () => unregisterField(field.id);
  }, [field.id, field.required, field.type, field.options, registerField, unregisterField]);

  const value = values[field.id];
  const error = errors[field.id];

  const renderControl = () => {
    switch (field.type) {
      case 'shortText':
        return (
          <>
            <Input
              id={`field-${field.id}`}
              placeholder={field.description || undefined}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'longText':
        return (
          <>
            <TextArea
              id={`field-${field.id}`}
              rows={3}
              placeholder={field.description || undefined}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'radio':
        return (
          <>
            <RadioChoiceField
              options={field.options?.length ? field.options : [{ id: '__1', label: 'Вариант 1' }]}
              value={value}
              onChange={(next) => setFieldValue(field.id, next)}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'checkbox':
        return (
          <>
            <CheckboxChoiceField
              options={field.options?.length ? field.options : [{ id: '__1', label: 'Вариант 1' }]}
              value={value}
              onChange={(next) => setFieldValue(field.id, next)}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'dropdown': {
        const dropdownOptions = field.options ?? [];
        const parsed = parseRadioValue(value);
        const otherOption = getOtherOption(dropdownOptions);
        const showOtherInput = Boolean(otherOption && parsed.selected === otherOption.id);

        return (
          <>
            <Select
              id={`field-${field.id}`}
              placeholder="Выберите вариант"
              value={parsed.selected || undefined}
              onChange={(sel) => {
                if (!sel) {
                  setFieldValue(field.id, hasOtherOption(dropdownOptions) ? { selected: '', otherText: '' } : '');
                  return;
                }
                if (hasOtherOption(dropdownOptions)) {
                  setFieldValue(field.id, {
                    selected: sel,
                    otherText: sel === otherOption?.id ? parsed.otherText : undefined,
                  });
                  return;
                }
                setFieldValue(field.id, sel);
              }}
              status={error ? 'error' : undefined}
              options={dropdownOptions.map((opt) => ({ label: opt.label, value: opt.id }))}
              style={{ width: '100%' }}
              allowClear
            />
            {showOtherInput && (
              <Input
                placeholder="Укажите свой вариант"
                value={parsed.otherText}
                onChange={(e) =>
                  otherOption &&
                  setFieldValue(field.id, { selected: otherOption.id, otherText: e.target.value })
                }
                style={{ marginTop: 8 }}
              />
            )}
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );
      }

      case 'yesNo':
        return (
          <>
            <YesNoRadioGroupField
              value={value as string | undefined}
              onChange={(v) => setFieldValue(field.id, v)}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'number':
        return (
          <>
            <Input
              id={`field-${field.id}`}
              type="number"
              placeholder={field.description || 'Введите число'}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'fullName':
        return (
          <>
            <Input
              id={`field-${field.id}`}
              placeholder={field.description || 'Полное имя'}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'phone':
        return (
          <>
            <Input
              id={`field-${field.id}`}
              type="tel"
              placeholder={field.description || '+7 (___) ___-__-__'}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'email':
        return (
          <>
            <Input
              id={`field-${field.id}`}
              type="email"
              placeholder={field.description || 'example@mail.com'}
              value={(value as string) ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              status={error ? 'error' : undefined}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'dateTime':
        return (
          <>
            <DatePicker
              id={`field-${field.id}`}
              showTime
              placeholder="dd/mm/yyyy"
              value={value ? dayjs(value as Date) : null}
              onChange={(date) => setFieldValue(field.id, date?.toDate() ?? null)}
              status={error ? 'error' : undefined}
              style={{ width: '100%' }}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'date':
        return (
          <>
            <DatePicker
              id={`field-${field.id}`}
              placeholder="dd/mm/yyyy"
              value={value ? dayjs(value as Date) : null}
              onChange={(date) => setFieldValue(field.id, date?.toDate() ?? null)}
              status={error ? 'error' : undefined}
              style={{ width: '100%' }}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      case 'time':
        return (
          <>
            <TimePicker
              id={`field-${field.id}`}
              format="HH:mm"
              placeholder="Время"
              value={value ? dayjs(value as string, 'HH:mm') : null}
              onChange={(time) => setFieldValue(field.id, time?.format('HH:mm') ?? '')}
              status={error ? 'error' : undefined}
              style={{ width: '100%' }}
            />
            {error && (
              <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
                {error}
              </div>
            )}
          </>
        );

      default:
        return (
          <Input
            id={`field-${field.id}`}
            value={(value as string) ?? ''}
            onChange={(e) => setFieldValue(field.id, e.target.value)}
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

  const controlId = `field-${field.id}`;
  const labelAssociatesControl = hasInlineError;

  return (
    <div style={{ marginBottom: 24 }}>
      {field.label && (
        <FieldLabel
          label={field.label}
          required={field.required}
          htmlFor={labelAssociatesControl ? controlId : undefined}
        />
      )}
      {renderControl()}
      {field.description && (
        <div style={{ color: 'var(--app-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      )}
      {error && !hasInlineError && (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
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
  const { resetFields } = store;
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      resetFields();
    }
  }, [open, resetFields]);

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const handleMockSubmit = async () => {
    try {
      await store.validateFields();
      setIsSubmitting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      resetFields();
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
      onCancel={handleClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Предпросмотр формы
          <Tag color="blue" style={{ fontWeight: 400, fontSize: 12 }}>
            Только просмотр
          </Tag>
        </div>
      }
      footer={null}
      width={800}
    >
      {/* Form header */}
      <div
        style={{
          borderBottom: '1px solid var(--app-border)',
          paddingBottom: 16,
          marginBottom: 24,
          paddingTop: 8,
        }}
      >
        <h4 style={{ margin: 0 }}>
          {formTitle || (
            <span style={{ color: 'var(--app-text-secondary)', fontStyle: 'italic', fontWeight: 'normal' }}>
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

          <hr style={{ border: 'none', borderTop: '1px solid var(--app-border)', marginTop: 8 }} />

          <Button
            type="primary"
            onClick={handleMockSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправка...' : 'Отправить'}
          </Button>
        </FormProvider>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <span style={{ color: 'var(--app-text-secondary)' }}>
            В форму не добавлено ни одного поля.
          </span>
        </div>
      )}
    </Modal>
  );
};
