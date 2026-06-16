import type { Field } from '../../types/form';
import { getChoiceDisplayLabel } from './choiceField.utils';
import {
  isAddressFieldValue,
  isCountryCityFieldValue,
  isLocationFieldValue,
  isRatingFieldValue,
} from '../types/field-values.types';

/**
 * Converts a raw stored value into a human-readable string based on the field's type.
 * Never returns technical IDs (UUIDs) when option labels are available.
 */
export function formatFieldValue(
  field: Field,
  rawValue: unknown,
): string {
  if (
    rawValue === undefined ||
    rawValue === null ||
    rawValue === '' ||
    (Array.isArray(rawValue) && rawValue.length === 0)
  ) {
    return '—';
  }

  if (field.type === 'address_country_city' && isCountryCityFieldValue(rawValue)) {
    const parts = [rawValue.countryName, rawValue.city].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  }

  if (field.type === 'location' && isLocationFieldValue(rawValue)) {
    return rawValue.displayValue.trim() || '—';
  }

  if (field.type === 'rating' && isRatingFieldValue(rawValue)) {
    const suffix = rawValue.npsCategory ? ` (${rawValue.npsCategory})` : '';
    return `${rawValue.value}${suffix}`;
  }

  if (field.type === 'address' && isAddressFieldValue(rawValue)) {
    return rawValue.displayValue.trim() || '—';
  }

  // Multi-select (checkbox)
  if (field.type === 'checkbox') {
    return getChoiceDisplayLabel(field.options, rawValue);
  }

  // Single select / radio / dropdown
  if (field.type === 'dropdown' || field.type === 'radio') {
    return getChoiceDisplayLabel(field.options, rawValue);
  }

  // Yes/No helper
  if (field.type === 'yesNo') {
    const value = String(rawValue);
    if (value === 'yes') return 'Да';
    if (value === 'no') return 'Нет';
    return '—';
  }

  // Simple scalar fields (text-like)
  if (
    field.type === 'shortText' ||
    field.type === 'longText' ||
    field.type === 'number' ||
    field.type === 'fullName' ||
    field.type === 'phone' ||
    field.type === 'email' ||
    field.type === 'address' ||
    field.type === 'address_country_city' ||
    field.type === 'location' ||
    field.type === 'rating'
  ) {
    const value =
      typeof rawValue === 'string' || typeof rawValue === 'number'
        ? String(rawValue)
        : '';
    return value.trim() ? value : '—';
  }

  // Date/time fields — value is expected to be a formatted string already
  if (field.type === 'date' || field.type === 'time' || field.type === 'dateTime') {
    const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
    return value.trim() ? value : '—';
  }

  // File-related types — extract filenames from metadata array
  if (field.type === 'file_image' || field.type === 'file_vector' || field.type === 'file_document') {
    if (Array.isArray(rawValue)) {
      const names = rawValue
        .map((item) => {
          if (typeof item === 'object' && item !== null && 'file_name' in item) {
            return String((item as Record<string, unknown>).file_name);
          }
          if (typeof item === 'string') return item;
          return null;
        })
        .filter((v): v is string => Boolean(v));
      return names.length > 0 ? names.join(', ') : '—';
    }
    if (typeof rawValue === 'string') return rawValue || '—';
    return '—';
  }

  return '—';
}
