import type { AddressFieldConfig, LocationFieldConfig, RatingFieldConfig } from '../types/field-config.types';
import type { FieldOption } from '../types/form-builder.types';
import {
  hasOtherOption,
  isOtherSelected,
  parseCheckboxValue,
  parseRadioValue,
} from './choiceField.utils';
import {
  isAddressFieldValue,
  isCountryCityFieldValue,
  isLocationFieldValue,
  isRatingFieldValue,
} from '../types/field-values.types';
import { extractNationalPhoneDigits } from './phoneMask';

export const validateCountryCityValue = (
  value: unknown,
  required: boolean,
): string | null => {
  const parsed = isCountryCityFieldValue(value) ? value : null;
  const country = parsed?.country?.trim() ?? '';
  const city = parsed?.city?.trim() ?? '';

  if (!country && !city) {
    return required ? 'Выберите страну' : null;
  }

  if (!country) {
    return 'Выберите страну';
  }

  if (!city) {
    return 'Выберите город';
  }

  return null;
};

export const validateLocationValue = (
  value: unknown,
  config: LocationFieldConfig,
  required: boolean,
): string | null => {
  const parsed = isLocationFieldValue(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? { displayValue: value }
      : null;

  if (!required) return null;
  if (!parsed) return 'Это поле обязательно для заполнения';

  if (config.mode === 'country_only' && !parsed.countryCode && !parsed.countryName) {
    return 'Выберите страну';
  }
  if (config.mode === 'city_only' && !parsed.cityName) {
    return 'Выберите город';
  }
  if (config.mode === 'country_and_city') {
    if (!parsed.countryCode && !parsed.countryName) return 'Выберите страну';
    if (!parsed.cityName) return 'Выберите город';
  }
  return null;
};

export const validateRatingValue = (
  value: unknown,
  config: RatingFieldConfig,
  required: boolean,
): string | null => {
  const parsed = isRatingFieldValue(value)
    ? value
    : typeof value === 'number'
      ? { value, min: config.min, max: config.max }
      : null;

  if (!required) return null;
  if (!parsed || parsed.value === undefined || parsed.value === null) {
    return 'Это поле обязательно для заполнения';
  }

  if (parsed.value < config.min || parsed.value > config.max) {
    return `Значение должно быть от ${config.min} до ${config.max}`;
  }

  const steps = (parsed.value - config.min) / config.step;
  if (!Number.isInteger(steps)) {
    return `Значение должно изменяться с шагом ${config.step}`;
  }

  return null;
};

export const validateAddressValue = (
  value: unknown,
  config: AddressFieldConfig,
  required: boolean,
): string | null => {
  const parsed = isAddressFieldValue(value)
    ? value
    : typeof value === 'string'
      ? { displayValue: value, provider: 'none' as const }
      : null;

  if (!required) return null;
  if (!parsed || !parsed.displayValue.trim()) {
    return 'Это поле обязательно для заполнения';
  }

  if (!config.allowManualInput && !parsed.providerPayload) {
    return 'Выберите адрес из списка подсказок';
  }

  return null;
};

export const normalizePhoneDigits = (value: string): string => {
  const national = extractNationalPhoneDigits(value);
  if (national.length === 0) return '';
  return `+7${national}`;
};

export const validatePhoneValue = (value: unknown, required: boolean): string | null => {
  const national = extractNationalPhoneDigits(typeof value === 'string' ? value : '');

  if (national.length === 0) {
    return required ? 'Укажите номер телефона' : null;
  }

  if (national.length < 10) {
    return required
      ? 'Номер телефона должен содержать 10 цифр'
      : 'Если указываете номер, введите его полностью — 10 цифр';
  }

  if (national.length > 10) {
    return 'Номер телефона должен содержать 10 цифр';
  }

  return null;
};

const FULL_NAME_WORD_REGEX = /^[\p{L}][\p{L}'-]*$/u;

export const validateFullNameValue = (value: unknown, required: boolean): string | null => {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text) {
    return required ? 'Это поле обязательно для заполнения' : null;
  }

  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) {
    return 'Укажите имя и фамилию';
  }

  if (words.some((word) => word.length < 2 || !FULL_NAME_WORD_REGEX.test(word))) {
    return 'Имя может содержать только буквы, пробелы и дефис';
  }

  return null;
};

export const validateYesNoValue = (value: unknown, required: boolean): string | null => {
  if (value === undefined || value === null || value === '') {
    return required ? 'Выберите «Да» или «Нет»' : null;
  }

  const text = String(value);
  if (text !== 'yes' && text !== 'no') {
    return 'Выберите «Да» или «Нет»';
  }
  return null;
};

const validateChoiceOtherText = (
  options: FieldOption[] | undefined,
  selected: string | string[],
  otherText: string,
  required: boolean,
): string | null => {
  if (!hasOtherOption(options) || !isOtherSelected(options, selected)) return null;
  if (!otherText.trim()) {
    return required ? 'Укажите свой вариант' : null;
  }
  if (otherText.trim().length < 2) {
    return 'Укажите не менее 2 символов';
  }
  return null;
};

export const validateRadioChoiceValue = (
  value: unknown,
  options: FieldOption[] | undefined,
  required: boolean,
): string | null => {
  const { selected, otherText } = parseRadioValue(value);
  if (!selected) {
    return required ? 'Выберите вариант ответа' : null;
  }

  return validateChoiceOtherText(options, selected, otherText, required);
};

export const validateCheckboxChoiceValue = (
  value: unknown,
  options: FieldOption[] | undefined,
  required: boolean,
): string | null => {
  const { selected, otherText } = parseCheckboxValue(value);
  if (selected.length === 0) {
    return required ? 'Выберите хотя бы один вариант' : null;
  }

  return validateChoiceOtherText(options, selected, otherText, required);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/i;

export const validateEmailValue = (value: unknown, required: boolean): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return required ? 'Это поле обязательно для заполнения' : null;
  }
  if (!EMAIL_REGEX.test(text)) {
    return 'Введите корректный адрес электронной почты';
  }
  return null;
};

export const validateShortTextValue = (
  value: unknown,
  required: boolean,
  maxLength = 500,
): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return required ? 'Это поле обязательно для заполнения' : null;
  }
  if (text.length > maxLength) {
    return `Не более ${maxLength} символов`;
  }
  return null;
};

export const validateLongTextValue = (
  value: unknown,
  required: boolean,
  maxLength = 5000,
): string | null => validateShortTextValue(value, required, maxLength);

export const validateNumberValue = (value: unknown, required: boolean): string | null => {
  const text =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  if (!text) {
    return required ? 'Это поле обязательно для заполнения' : null;
  }
  const num = Number(text);
  if (!Number.isFinite(num)) {
    return 'Введите корректное число';
  }
  return null;
};

export const validateUrlValue = (value: unknown, required: boolean): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return required ? 'Это поле обязательно для заполнения' : null;
  }
  if (!URL_REGEX.test(text)) {
    return 'Введите корректный URL (http:// или https://)';
  }
  return null;
};

export const validatePasswordValue = (
  value: unknown,
  required: boolean,
  minLength = 8,
): string | null => {
  const text = typeof value === 'string' ? value : '';
  if (!text) {
    return required ? 'Пароль обязателен' : null;
  }
  if (text.length < minLength) {
    return `Пароль должен содержать не менее ${minLength} символов`;
  }
  return null;
};

export const validatePasswordConfirmValue = (
  password: unknown,
  confirm: unknown,
): string | null => {
  if (password !== confirm) {
    return 'Пароли не совпадают';
  }
  return null;
};

export const validateDateValue = (value: unknown, required: boolean): string | null => {
  if (value === undefined || value === null || value === '') {
    return required ? 'Это поле обязательно для заполнения' : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return null;
  if (typeof value === 'string' && value.trim()) return null;
  return 'Введите корректную дату';
};
