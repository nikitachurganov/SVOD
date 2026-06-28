import type { FileMetadata } from '../api/files.api';
import { uploadFieldFiles } from '../api/files.api';
import type { FormResponse } from '../api/forms.api';
import type { FormEntity } from '../../types/form';
import type { FormFieldInstance, FormPageInstance } from '../types/form-builder.types';
import { collectLeafFields } from './collectFieldIds';
import {
  getOtherOption,
  hasOtherOption,
  parseCheckboxValue,
  parseRadioValue,
} from '../utils/choiceField.utils';

const FILE_FIELD_TYPES = new Set(['file_image', 'file_vector', 'file_document']);
const OTHER_PREFIX = '__other__:';

export const serializeFormValue = (val: unknown): unknown => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'object' && val !== null) {
    if ('format' in val && typeof (val as { format?: unknown }).format === 'function') {
      const formatFn = (val as { format: (pattern: string) => string }).format;
      if ('showTime' in (val as object)) {
        return formatFn('YYYY-MM-DD HH:mm');
      }
      return formatFn('YYYY-MM-DD');
    }
    if ('toISOString' in val && typeof (val as { toISOString?: unknown }).toISOString === 'function') {
      return (val as { toISOString: () => string }).toISOString();
    }
    if (Array.isArray(val)) {
      return val.map(serializeFormValue);
    }
  }
  return val;
};

export const buildFormSnapshot = (
  formRow: Pick<FormResponse, 'id' | 'name'> | { id: string; name: string },
  pages: FormPageInstance[],
): FormEntity => {
  const allLeafFields: FormFieldInstance[] = [];
  for (const page of pages) {
    allLeafFields.push(...collectLeafFields(page.fields));
  }

  return {
    id: formRow.id,
    title: formRow.name,
    fields: allLeafFields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.map((opt) => ({ id: opt.id, label: opt.label })),
      config: field.config,
    })),
  };
};

export const serializeFormValues = (
  raw: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = serializeFormValue(value);
  }
  return out;
};

const serializeChoiceValue = (
  value: unknown,
  field: FormFieldInstance,
): string | string[] | null => {
  const options = field.options ?? [];
  if (!options.length) return null;

  if (field.type === 'radio') {
    const parsed = parseRadioValue(value);
    if (!parsed.selected) return null;

    const otherOption = getOtherOption(options);
    if (otherOption && parsed.selected === otherOption.id) {
      const trimmed = (typeof parsed.otherText === 'string' ? parsed.otherText : '').trim();
      return trimmed ? `${OTHER_PREFIX}${trimmed}` : null;
    }

    return options.find((opt) => opt.id === parsed.selected)?.label ?? null;
  }

  if (field.type === 'checkbox') {
    const parsed = parseCheckboxValue(value);
    if (parsed.selected.length === 0) return [];

    const otherOption = getOtherOption(options);
    const labels: string[] = [];

    for (const id of parsed.selected) {
      if (otherOption && id === otherOption.id) {
        const trimmed = (typeof parsed.otherText === 'string' ? parsed.otherText : '').trim();
        if (trimmed) labels.push(`${OTHER_PREFIX}${trimmed}`);
        continue;
      }
      const label = options.find((opt) => opt.id === id)?.label;
      if (label) labels.push(label);
    }

    // Ensure “Другое” always goes last in stored value.
    labels.sort((a, b) => {
      const aOther = a.startsWith(OTHER_PREFIX);
      const bOther = b.startsWith(OTHER_PREFIX);
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return 0;
    });

    return labels;
  }

  return null;
};

export const serializeFormValuesWithFields = (
  raw: Record<string, unknown>,
  fields: FormFieldInstance[],
): Record<string, unknown> => {
  const fieldMap = new Map<string, FormFieldInstance>();
  for (const field of fields) fieldMap.set(field.id, field);

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const meta = fieldMap.get(key);
    if (meta && (meta.type === 'radio' || meta.type === 'checkbox') && hasOtherOption(meta.options)) {
      out[key] = serializeChoiceValue(value, meta);
      continue;
    }
    if (meta && (meta.type === 'radio' || meta.type === 'checkbox')) {
      out[key] = serializeChoiceValue(value, meta);
      continue;
    }
    out[key] = serializeFormValue(value);
  }

  return out;
};

export const processRequestFormValues = async (
  raw: Record<string, unknown>,
  allFields: FormFieldInstance[],
  requestId: string,
): Promise<Record<string, unknown>> => {
  const fieldTypeMap = new Map<string, string>();
  const fieldMetaMap = new Map<string, FormFieldInstance>();
  const walk = (fields: FormFieldInstance[]) => {
    for (const field of fields) {
      fieldTypeMap.set(field.id, field.type);
      fieldMetaMap.set(field.id, field);
      if (field.type === 'group' && field.children) walk(field.children);
    }
  };
  walk(allFields);

  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    const fieldType = fieldTypeMap.get(key);
    const fieldMeta = fieldMetaMap.get(key);

    if (fieldType && FILE_FIELD_TYPES.has(fieldType) && Array.isArray(val) && val.length > 0) {
      const uploadItems = val.map((item) => {
        if (item instanceof File) {
          return { originFileObj: item, name: item.name };
        }
        return item as { originFileObj?: File; name?: string };
      });
      const hasFiles = uploadItems.some((item) => item.originFileObj instanceof File);
      if (hasFiles) {
        const uploaded: FileMetadata[] = await uploadFieldFiles(
          uploadItems,
          fieldType,
          requestId,
          key,
        );
        out[key] = uploaded;
        continue;
      }
    }

    if (fieldMeta && (fieldMeta.type === 'radio' || fieldMeta.type === 'checkbox')) {
      out[key] = serializeChoiceValue(val, fieldMeta);
      continue;
    }

    out[key] = serializeFormValue(val);
  }

  return out;
};
