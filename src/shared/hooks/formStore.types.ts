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

export interface FormContextValue {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  setFieldValue: (name: string, value: unknown) => void;
  registerField: (name: string, rules: Rule[]) => void;
  unregisterField: (name: string) => void;
  clearError: (name: string) => void;
}
