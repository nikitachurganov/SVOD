import type { FormFieldType, FormPageInstance } from '../types/form-builder.types';
import { collectLeafFields } from './collectFieldIds';
import { isFormilyRuntimeEnabled } from './formilyConfig';

/** Field types supported in the Formily POC designer (subset for QA) */
export const POC_FIELD_TYPES = [
  'shortText',
  'longText',
  'dropdown',
  'checkbox',
  'date',
] as const;

export type PocFieldType = (typeof POC_FIELD_TYPES)[number];

export const isPocFieldType = (type: FormFieldType): type is PocFieldType =>
  (POC_FIELD_TYPES as readonly string[]).includes(type);

export const POC_FIELD_LABELS: Record<PocFieldType, string> = {
  shortText: 'Короткий текст',
  longText: 'Длинный текст',
  dropdown: 'Выпадающий список',
  checkbox: 'Несколько вариантов',
  date: 'Дата',
};

/** All field types mapped in schemaMapper */
export const FORMILY_SUPPORTED_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
  'shortText',
  'longText',
  'radio',
  'checkbox',
  'dropdown',
  'yesNo',
  'number',
  'fullName',
  'phone',
  'email',
  'dateTime',
  'date',
  'time',
  'group',
  'file_vector',
  'file_image',
  'file_document',
  'address',
  'address_country_city',
  'location',
  'rating',
]);

export const isFormilyFieldTypeSupported = (type: FormFieldType): boolean =>
  FORMILY_SUPPORTED_FIELD_TYPES.has(type);

/** True when every leaf field in pages is supported by the Formily mapper */
export const isFormilySupported = (pages: FormPageInstance[]): boolean => {
  for (const page of pages) {
    const leaves = collectLeafFields(page.fields);
    for (const field of leaves) {
      if (!isFormilyFieldTypeSupported(field.type)) {
        return false;
      }
    }
  }
  return true;
};

export const shouldUseFormilyRuntime = (pages: FormPageInstance[]): boolean =>
  isFormilyRuntimeEnabled() && isFormilySupported(pages);
