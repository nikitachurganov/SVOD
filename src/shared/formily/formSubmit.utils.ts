import type { FileMetadata } from '../api/files.api';
import { uploadFieldFiles } from '../api/files.api';
import type { FormResponse } from '../api/forms.api';
import type { FormEntity } from '../../types/form';
import type { FormFieldInstance, FormPageInstance } from '../types/form-builder.types';
import { collectLeafFields } from './collectFieldIds';

const FILE_FIELD_TYPES = new Set(['file_image', 'file_vector', 'file_document']);

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

export const processRequestFormValues = async (
  raw: Record<string, unknown>,
  allFields: FormFieldInstance[],
  requestId: string,
): Promise<Record<string, unknown>> => {
  const fieldTypeMap = new Map<string, string>();
  const walk = (fields: FormFieldInstance[]) => {
    for (const field of fields) {
      fieldTypeMap.set(field.id, field.type);
      if (field.type === 'group' && field.children) walk(field.children);
    }
  };
  walk(allFields);

  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    const fieldType = fieldTypeMap.get(key);

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

    out[key] = serializeFormValue(val);
  }

  return out;
};
