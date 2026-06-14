import type { ReactNode } from 'react';
import { FormCtx } from './formStore.context';
import type { FormStoreInstance } from './formStore.types';

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
