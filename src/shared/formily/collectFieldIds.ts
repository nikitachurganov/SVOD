import type { FormFieldInstance } from '../types/form-builder.types';

/** Collects leaf field IDs (groups recurse into children) */
export const collectFieldIds = (fields: FormFieldInstance[]): string[] => {
  const ids: string[] = [];
  for (const field of fields) {
    if (field.type === 'group' && field.children && field.children.length > 0) {
      ids.push(...collectFieldIds(field.children));
    } else {
      ids.push(field.id);
    }
  }
  return ids;
};

export const collectLeafFields = (fields: FormFieldInstance[]): FormFieldInstance[] => {
  const result: FormFieldInstance[] = [];
  const walk = (inner: FormFieldInstance[]) => {
    for (const field of inner) {
      if (field.type === 'group' && field.children && field.children.length > 0) {
        walk(field.children);
      } else {
        result.push(field);
      }
    }
  };
  walk(fields);
  return result;
};
