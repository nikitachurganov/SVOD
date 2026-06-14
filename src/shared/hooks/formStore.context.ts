import { createContext } from 'react';
import type { FormContextValue } from './formStore.types';

export const FormCtx = createContext<FormContextValue | null>(null);
