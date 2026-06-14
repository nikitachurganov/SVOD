import type { FieldOption } from '../types/form-builder.types';

export const OTHER_OPTION_LABEL = 'Другое';

export interface ChoiceWithOtherValue {
  selected: string | string[];
  otherText?: string;
}

export const isChoiceWithOtherValue = (value: unknown): value is ChoiceWithOtherValue =>
  typeof value === 'object' &&
  value !== null &&
  'selected' in value &&
  (typeof (value as ChoiceWithOtherValue).selected === 'string' ||
    Array.isArray((value as ChoiceWithOtherValue).selected));

export const getOtherOption = (options: FieldOption[] | undefined): FieldOption | undefined =>
  options?.find((opt) => opt.isOther);

export const hasOtherOption = (options: FieldOption[] | undefined): boolean =>
  Boolean(getOtherOption(options));

export const createOtherOption = (): FieldOption => ({
  id: crypto.randomUUID(),
  label: OTHER_OPTION_LABEL,
  isOther: true,
});

export const parseRadioValue = (
  value: unknown,
): { selected: string; otherText: string } => {
  if (isChoiceWithOtherValue(value) && typeof value.selected === 'string') {
    return { selected: value.selected, otherText: value.otherText?.trim() ?? '' };
  }
  if (typeof value === 'string') {
    return { selected: value, otherText: '' };
  }
  return { selected: '', otherText: '' };
};

export const parseCheckboxValue = (
  value: unknown,
): { selected: string[]; otherText: string } => {
  if (isChoiceWithOtherValue(value) && Array.isArray(value.selected)) {
    return { selected: value.selected, otherText: value.otherText?.trim() ?? '' };
  }
  if (Array.isArray(value)) {
    return { selected: value.filter((item): item is string => typeof item === 'string'), otherText: '' };
  }
  return { selected: [], otherText: '' };
};

export const isOtherSelected = (
  options: FieldOption[] | undefined,
  selected: string | string[],
): boolean => {
  const other = getOtherOption(options);
  if (!other) return false;
  if (typeof selected === 'string') return selected === other.id;
  return selected.includes(other.id);
};

export const validateChoiceOtherText = (
  options: FieldOption[] | undefined,
  selected: string | string[],
  otherText: string,
  required: boolean,
): string | null => {
  if (!hasOtherOption(options)) return null;
  if (!isOtherSelected(options, selected)) return null;
  if (!otherText.trim()) {
    return required ? 'Укажите свой вариант' : null;
  }
  if (otherText.trim().length < 2) {
    return 'Укажите не менее 2 символов';
  }
  return null;
};

export const getChoiceDisplayLabel = (
  options: FieldOption[] | undefined,
  value: unknown,
): string => {
  if (!options?.length) return '—';
  const radioParsed = parseRadioValue(value);
  if (radioParsed.selected) {
    const label = options.find((opt) => opt.id === radioParsed.selected)?.label;
    if (isOtherSelected(options, radioParsed.selected) && radioParsed.otherText) {
      return `${label ?? 'Другое'}: ${radioParsed.otherText}`;
    }
    return label ?? '—';
  }

  const checkboxParsed = parseCheckboxValue(value);
  if (checkboxParsed.selected.length) {
    return checkboxParsed.selected
      .map((id) => {
        const label = options.find((opt) => opt.id === id)?.label ?? id;
        if (isOtherSelected(options, id) && checkboxParsed.otherText) {
          return `${label}: ${checkboxParsed.otherText}`;
        }
        return label;
      })
      .join(', ');
  }

  return '—';
};
