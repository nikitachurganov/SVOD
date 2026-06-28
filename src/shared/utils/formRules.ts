import type { Rule, RuleObject } from 'antd/es/form';
import type { FormFieldType } from '../types/form-builder.types';
import { REQUIRED_FIELD_MESSAGE } from '../constants/formValidation';
import {
  validateCheckboxChoiceValue,
  validateDateValue,
  validateEmailValue,
  validateFullNameValue,
  validateLongTextValue,
  validateNumberValue,
  validatePasswordValue,
  validatePhoneValue,
  validateRadioChoiceValue,
  validateShortTextValue,
  validateYesNoValue,
} from './fieldValueValidation';

export type FieldValidator = (value: unknown, required: boolean) => string | null;

type AntRuleValidator = NonNullable<RuleObject['validator']>;

export const toAntValidator = (
  validate: FieldValidator,
  required: boolean,
): AntRuleValidator =>
  async (_rule, value) => {
    const error = validate(value, required);
    if (error) throw new Error(error);
  };

export const toFormilyValidator =
  (validate: FieldValidator, required: boolean) =>
  (value: unknown): string =>
    validate(value, required) ?? '';

export const requiredRule = (message = REQUIRED_FIELD_MESSAGE): Rule => ({
  required: true,
  message,
});

export const emailRules = (required = true): Rule[] => [
  { validator: toAntValidator(validateEmailValue, required) },
];

export const phoneRules = (required = true): Rule[] => [
  { validator: toAntValidator(validatePhoneValue, required) },
];

export const passwordRules = (required = true, minLength = 8): Rule[] => [
  {
    validator: toAntValidator(
      (value, req) => validatePasswordValue(value, req, minLength),
      required,
    ),
  },
];

export const organizationNameRules = (): Rule[] => [
  requiredRule('Введите название организации'),
  { max: 255, message: 'Не более 255 символов' },
];

export const formilyValidatorForType = (
  type: FormFieldType,
  required: boolean,
): ((value: unknown) => string) | undefined => {
  switch (type) {
    case 'shortText':
      return toFormilyValidator(validateShortTextValue, required);
    case 'longText':
      return toFormilyValidator(validateLongTextValue, required);
    case 'email':
      return toFormilyValidator(validateEmailValue, required);
    case 'phone':
      return toFormilyValidator(validatePhoneValue, required);
    case 'fullName':
      return toFormilyValidator(validateFullNameValue, required);
    case 'number':
      return toFormilyValidator(validateNumberValue, required);
    case 'yesNo':
      return toFormilyValidator(validateYesNoValue, required);
    case 'date':
    case 'dateTime':
    case 'time':
      return toFormilyValidator(validateDateValue, required);
    default:
      return undefined;
  }
};

export const legacyValidatorForField = (
  type: FormFieldType,
  required: boolean,
  options?: Parameters<typeof validateRadioChoiceValue>[1],
): AntRuleValidator | undefined => {
  switch (type) {
    case 'shortText':
      return toAntValidator(validateShortTextValue, required);
    case 'longText':
      return toAntValidator(validateLongTextValue, required);
    case 'email':
      return toAntValidator(validateEmailValue, required);
    case 'phone':
      return toAntValidator(validatePhoneValue, required);
    case 'fullName':
      return toAntValidator(validateFullNameValue, required);
    case 'number':
      return toAntValidator(validateNumberValue, required);
    case 'yesNo':
      return toAntValidator(validateYesNoValue, required);
    case 'date':
    case 'dateTime':
    case 'time':
      return toAntValidator(validateDateValue, required);
    case 'radio':
    case 'dropdown':
      return async (_rule, value) => {
        const error = validateRadioChoiceValue(value, options, required);
        if (error) throw new Error(error);
      };
    case 'checkbox':
      return async (_rule, value) => {
        const error = validateCheckboxChoiceValue(value, options, required);
        if (error) throw new Error(error);
      };
    default:
      return required
        ? async (_rule, value) => {
            if (value === undefined || value === null || value === '') {
              throw new Error(REQUIRED_FIELD_MESSAGE);
            }
          }
        : undefined;
  }
};
