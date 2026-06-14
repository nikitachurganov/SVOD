import { useContext } from 'react';
import { FormCtx } from './formStore.context';

export const useFormCtx = () => {
  const ctx = useContext(FormCtx);
  if (!ctx) throw new Error('useFormCtx must be inside FormProvider');
  return ctx;
};
