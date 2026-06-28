import type { ISchema } from '@formily/json-schema';
import type {
  FieldOption,
  FormFieldInstance,
  FormFieldType,
  FormPageInstance,
} from '../types/form-builder.types';
import { hasOtherOption } from '../utils/choiceField.utils';
import {
  validateDateValue,
  validateEmailValue,
  validateFullNameValue,
  validateLongTextValue,
  validateNumberValue,
  validateShortTextValue,
  validateYesNoValue,
} from '../utils/fieldValueValidation';
import { isFormilyFieldTypeSupported } from './supportedTypes';

const DEFAULT_OPTIONS: FieldOption[] = [
  { id: crypto.randomUUID(), label: 'Вариант 1' },
  { id: crypto.randomUUID(), label: 'Вариант 2' },
];

const YES_NO_OPTIONS: FieldOption[] = [
  { id: 'yes', label: 'Да' },
  { id: 'no', label: 'Нет' },
];

const baseFieldSchema = (field: FormFieldInstance): ISchema => ({
  type: 'string',
  title: field.label,
  description: field.description || undefined,
  required: field.required || undefined,
  'x-decorator': 'FormItem',
  'x-decorator-props': {
    asterisk: field.required,
  },
});

const optionsEnumSchema = (options: FieldOption[]) => ({
  enum: options.map((opt) => opt.id),
  enumNames: options.map((opt) => opt.label),
});

const fieldValidator = (
  validate: (value: unknown, required: boolean) => string | null,
  required: boolean,
) => ({
  validator: (value: unknown) => validate(value, required) ?? '',
});

const fieldToSchemaProperty = (field: FormFieldInstance): ISchema | null => {
  if (!isFormilyFieldTypeSupported(field.type)) return null;

  const base = baseFieldSchema(field);

  switch (field.type) {
    case 'shortText':
      return {
        ...base,
        'x-component': 'Input',
        'x-component-props': {
          placeholder: field.description || undefined,
        },
        'x-validator': fieldValidator(validateShortTextValue, field.required),
      };

    case 'fullName':
      return {
        ...base,
        'x-component': 'Input',
        'x-component-props': {
          placeholder: field.description || 'Полное имя',
        },
        'x-validator': fieldValidator(validateFullNameValue, field.required),
      };

    case 'phone':
      return {
        ...base,
        'x-component': 'FormilyPhoneInput',
        'x-component-props': {
          fieldMeta: field,
        },
      };

    case 'email':
      return {
        ...base,
        'x-component': 'Input',
        'x-component-props': {
          placeholder: field.description || undefined,
          type: 'email',
        },
        'x-validator': fieldValidator(validateEmailValue, field.required),
      };

    case 'longText':
      return {
        ...base,
        'x-component': 'Input.TextArea',
        'x-component-props': {
          placeholder: field.description || undefined,
          rows: 3,
        },
        'x-validator': fieldValidator(validateLongTextValue, field.required),
      };

    case 'number':
      return {
        ...base,
        'x-component': 'Input',
        'x-component-props': {
          placeholder: field.description || 'Введите число',
          type: 'number',
        },
        'x-validator': fieldValidator(validateNumberValue, field.required),
      };

    case 'dropdown': {
      const options = field.options ?? DEFAULT_OPTIONS;
      if (hasOtherOption(options)) {
        return {
          ...base,
          'x-component': 'FormilyDropdownChoice',
          'x-component-props': { fieldMeta: field },
          'x-decorator': undefined,
        };
      }
      return {
        ...base,
        ...optionsEnumSchema(options),
        'x-component': 'Select',
        'x-component-props': {
          placeholder: field.description || 'Выберите значение',
          allowClear: true,
        },
      } as ISchema;
    }

    case 'radio': {
      const options = field.options ?? DEFAULT_OPTIONS;
      if (hasOtherOption(options)) {
        return {
          ...base,
          'x-component': 'FormilyRadioChoice',
          'x-component-props': { fieldMeta: field },
          'x-decorator': undefined,
        };
      }
      return {
        ...base,
        ...optionsEnumSchema(options),
        'x-component': 'Radio.Group',
      } as ISchema;
    }

    case 'checkbox': {
      const options = field.options ?? DEFAULT_OPTIONS;
      if (hasOtherOption(options)) {
        return {
          ...base,
          type: 'array',
          'x-component': 'FormilyCheckboxChoice',
          'x-component-props': { fieldMeta: field },
          'x-decorator': undefined,
        };
      }
      return {
        ...base,
        type: 'array',
        ...optionsEnumSchema(options),
        'x-component': 'Checkbox.Group',
      } as ISchema;
    }

    case 'yesNo':
      return {
        ...base,
        ...optionsEnumSchema(YES_NO_OPTIONS),
        'x-component': 'Radio.Group',
        'x-validator': fieldValidator(validateYesNoValue, field.required),
      } as ISchema;

    case 'date':
      return {
        ...base,
        'x-component': 'DatePicker',
        'x-component-props': {
          format: 'YYYY-MM-DD',
          style: { width: '100%' },
        },
        'x-validator': fieldValidator(validateDateValue, field.required),
      };

    case 'time':
      return {
        ...base,
        'x-component': 'TimePicker',
        'x-component-props': {
          format: 'HH:mm',
          style: { width: '100%' },
        },
        'x-validator': fieldValidator(validateDateValue, field.required),
      };

    case 'dateTime':
      return {
        ...base,
        'x-component': 'DatePicker',
        'x-component-props': {
          showTime: true,
          format: 'YYYY-MM-DD HH:mm',
          style: { width: '100%' },
        },
        'x-validator': fieldValidator(validateDateValue, field.required),
      };

    case 'address':
      return {
        ...base,
        'x-component': 'FormilyAddressInput',
        'x-component-props': {
          fieldMeta: field,
        },
      };

    case 'location':
      return {
        ...base,
        'x-component': 'FormilyLocationInput',
        'x-component-props': {
          fieldMeta: field,
        },
      };

    case 'address_country_city':
      return {
        ...base,
        'x-component': 'FormilyCountryCityInput',
        'x-component-props': {
          fieldMeta: field,
        },
      };

    case 'rating':
      return {
        ...base,
        type: 'number',
        'x-component': 'FormilyRatingInput',
        'x-component-props': {
          fieldMeta: field,
        },
      };

    case 'file_vector':
    case 'file_image':
    case 'file_document':
      return {
        type: 'array',
        title: field.label,
        required: field.required || undefined,
        'x-decorator': 'FormItem',
        'x-decorator-props': { asterisk: field.required },
        'x-component': 'FormilyFileUpload',
        'x-component-props': {
          fieldType: field.type,
          label: field.label,
          required: field.required,
        },
      };

    default:
      return {
        ...base,
        'x-component': 'Input',
      };
  }
};

const appendFieldsToProperties = (
  fields: FormFieldInstance[],
  properties: Record<string, ISchema>,
): void => {
  for (const field of fields) {
    if (field.type === 'group') {
      properties[`__group_${field.id}`] = {
        type: 'void',
        'x-component': 'FormGroupTitle',
        'x-component-props': {
          title: field.label,
          description: field.description || undefined,
        },
      };
      appendFieldsToProperties(field.children ?? [], properties);
      continue;
    }

    const schema = fieldToSchemaProperty(field);
    if (schema) {
      properties[field.id] = schema;
    }
  }
};

/** Converts SVOD pages to a Formily ISchema for runtime rendering */
export const pagesToFormilySchema = (pages: FormPageInstance[]): ISchema => {
  const properties: Record<string, ISchema> = {};

  for (const page of pages) {
    if (pages.length > 1) {
      properties[`__page_${page.id}`] = {
        type: 'void',
        'x-component': 'FormGroupTitle',
        'x-component-props': {
          title: page.title,
        },
      };
    }
    appendFieldsToProperties(page.fields, properties);
  }

  return {
    type: 'object',
    properties,
  };
};

/** Schema for a single page (multi-page wizard) */
export const pageToFormilySchema = (page: FormPageInstance): ISchema => {
  const properties: Record<string, ISchema> = {};
  appendFieldsToProperties(page.fields, properties);
  return { type: 'object', properties };
};

const componentToFieldType = (component: string, schema: ISchema): FormFieldType => {
  if (component === 'Input.TextArea') return 'longText';
  if (component === 'Select') return 'dropdown';
  if (component === 'Checkbox.Group') return 'checkbox';
  if (component === 'Radio.Group') {
    const enumValues = Array.isArray(schema.enum) ? schema.enum.map(String) : [];
    if (enumValues.includes('yes') && enumValues.includes('no')) return 'yesNo';
    return 'radio';
  }
  if (component === 'DatePicker') {
    const props = schema['x-component-props'] as Record<string, unknown> | undefined;
    if (props?.showTime) return 'dateTime';
    return 'date';
  }
  if (component === 'TimePicker') return 'time';
  if (component === 'FormilyAddressInput') return 'address';
  if (component === 'FormilyLocationInput') return 'location';
  if (component === 'FormilyCountryCityInput') return 'address_country_city';
  if (component === 'FormilyRatingInput') return 'rating';
  if (component === 'FormilyFileUpload') {
    const props = schema['x-component-props'] as { fieldType?: FormFieldType } | undefined;
    return props?.fieldType ?? 'file_document';
  }
  if (component === 'FormilyPhoneInput') return 'phone';
  if (component === 'Input') {
    const props = schema['x-component-props'] as { type?: string } | undefined;
    if (props?.type === 'number') return 'number';
    if (props?.type === 'email') return 'email';
    if (props?.type === 'tel') return 'phone';
  }
  return 'shortText';
};

const schemaPropertyToField = (
  fieldId: string,
  schema: ISchema,
): FormFieldInstance | null => {
  const component = schema['x-component'];
  if (typeof component !== 'string') return null;
  if (component === 'FormGroupTitle') return null;

  const type = componentToFieldType(component, schema);
  const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
  const rawEnumNames = (schema as ISchema & { enumNames?: unknown }).enumNames;
  const enumNames = Array.isArray(rawEnumNames) ? rawEnumNames.map(String) : undefined;

  const options: FieldOption[] | undefined =
    enumValues && enumNames
      ? enumValues.map((id, index) => ({
          id: String(id),
          label: enumNames[index] ?? String(id),
        }))
      : undefined;

  const componentProps = schema['x-component-props'] as
    | { fieldMeta?: FormFieldInstance }
    | undefined;

  return {
    id: fieldId,
    type,
    label: typeof schema.title === 'string' ? schema.title : 'Поле',
    description:
      typeof schema.description === 'string'
        ? schema.description
        : typeof schema['x-component-props'] === 'object' &&
            schema['x-component-props'] !== null &&
            'placeholder' in schema['x-component-props']
          ? String((schema['x-component-props'] as Record<string, unknown>).placeholder)
          : '',
    required: Boolean(schema.required),
    options,
    config: componentProps?.fieldMeta?.config,
  };
};

/** Converts Formily ISchema back to SVOD pages (round-trip helper) */
export const formilySchemaToPages = (
  schema: ISchema,
  pageId?: string,
): FormPageInstance[] => {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object') {
    return [{ id: pageId ?? crypto.randomUUID(), title: 'Страница 1', fields: [] }];
  }

  const fields: FormFieldInstance[] = [];
  for (const [fieldId, fieldSchema] of Object.entries(properties)) {
    if (fieldId.startsWith('__group_') || fieldId.startsWith('__page_')) continue;
    if (typeof fieldSchema !== 'object' || fieldSchema === null) continue;
    const field = schemaPropertyToField(fieldId, fieldSchema as ISchema);
    if (field) fields.push(field);
  }

  return [
    {
      id: pageId ?? crypto.randomUUID(),
      title: 'Страница 1',
      fields,
    },
  ];
};
