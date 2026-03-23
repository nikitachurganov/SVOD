import { useCallback, useRef, useState } from 'react';
import { createContext, useContext, type ReactNode } from 'react';

export interface Rule {
  required?: boolean;
  message?: string;
  validator?: (rule: unknown, value: unknown) => Promise<void>;
}

export interface FormStoreInstance {
  getFieldsValue: (all?: boolean) => Record<string, unknown>;
  getFieldValue: (name: string) => unknown;
  setFieldsValue: (newValues: Record<string, unknown>) => void;
  setFieldValue: (name: string, value: unknown) => void;
  resetFields: () => void;
  validateFields: (names?: string[]) => Promise<Record<string, unknown>>;
  registerField: (name: string, rules: Rule[]) => void;
  unregisterField: (name: string) => void;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  clearError: (name: string) => void;
}

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
    setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  }, []);

  const resetFields = useCallback(() => {
    setValues({});
    setErrors({});
  }, []);

  const clearError = useCallback((name: string) => {
    setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
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
            newErrors[name] = rule.message ?? 'Это поле обязательно';
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
    getFieldsValue, getFieldValue, setFieldsValue, setFieldValue,
    resetFields, validateFields, registerField, unregisterField,
    values, errors, clearError,
  };
}

interface FormContextValue {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  setFieldValue: (name: string, value: unknown) => void;
  registerField: (name: string, rules: Rule[]) => void;
  unregisterField: (name: string) => void;
  clearError: (name: string) => void;
}

const FormCtx = createContext<FormContextValue | null>(null);

export const useFormCtx = () => {
  const ctx = useContext(FormCtx);
  if (!ctx) throw new Error('useFormCtx must be inside FormProvider');
  return ctx;
};

export const FormProvider = ({
  store,
  children,
}: {
  store: FormStoreInstance;
  children: ReactNode;
}) => (
  <FormCtx.Provider
    value={{
      values: store.values,
      errors: store.errors,
      setFieldValue: store.setFieldValue,
      registerField: store.registerField,
      unregisterField: store.unregisterField,
      clearError: store.clearError,
    }}
  >
    {children}
  </FormCtx.Provider>
);
