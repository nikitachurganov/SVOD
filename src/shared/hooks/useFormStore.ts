import { useCallback, useRef, useState } from 'react';
import { REQUIRED_FIELD_MESSAGE } from '../constants/formValidation';
import type { FormStoreInstance, Rule } from './formStore.types';

export function useFormStore(): FormStoreInstance {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldsRef = useRef<Map<string, Rule[]>>(new Map());

  const getFieldsValue = useCallback(() => ({ ...values }), [values]);
  const getFieldValue = useCallback((name: string) => values[name], [values]);

  const setFieldsValue = useCallback((newValues: Record<string, unknown>) => {
    setValues((prev) => ({ ...prev, ...newValues }));
  }, []);

  const setFieldValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const resetFields = useCallback(() => {
    setValues({});
    setErrors({});
  }, []);

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const registerField = useCallback((name: string, rules: Rule[]) => {
    fieldsRef.current.set(name, rules);
  }, []);

  const unregisterField = useCallback((name: string) => {
    fieldsRef.current.delete(name);
  }, []);

  const validateFields = useCallback(
    async (names?: string[]) => {
      const fieldsToValidate = names ?? Array.from(fieldsRef.current.keys());
      const newErrors: Record<string, string> = {};

      for (const name of fieldsToValidate) {
        const rules = fieldsRef.current.get(name) ?? [];
        const value = values[name];

        for (const rule of rules) {
          if (
            rule.required &&
            (value === undefined ||
              value === null ||
              value === '' ||
              (Array.isArray(value) && value.length === 0))
          ) {
            newErrors[name] = rule.message ?? REQUIRED_FIELD_MESSAGE;
            break;
          }
          if (rule.validator) {
            try {
              await rule.validator(rule, value);
            } catch (err) {
              newErrors[name] = err instanceof Error ? err.message : 'Ошибка валидации';
              break;
            }
          }
        }
      }

      setErrors((prev) => ({ ...prev, ...newErrors }));

      if (Object.keys(newErrors).length > 0) {
        const err = new Error('Validation failed');
        (err as unknown as Record<string, unknown>).errorFields = Object.entries(newErrors).map(
          ([n, m]) => ({ name: [n], errors: [m] }),
        );
        throw err;
      }

      return { ...values };
    },
    [values],
  );

  return {
    getFieldsValue,
    getFieldValue,
    setFieldsValue,
    setFieldValue,
    resetFields,
    validateFields,
    registerField,
    unregisterField,
    values,
    errors,
    clearError,
  };
}
