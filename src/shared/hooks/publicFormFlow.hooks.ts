import { useContext } from 'react';
import { PublicFormFlowContext } from '../context/publicFormFlow.context';

export const usePublicFormFlow = () => {
  const ctx = useContext(PublicFormFlowContext);
  if (!ctx) {
    throw new Error('usePublicFormFlow must be used inside <PublicFormFlowProvider>');
  }
  return ctx;
};
