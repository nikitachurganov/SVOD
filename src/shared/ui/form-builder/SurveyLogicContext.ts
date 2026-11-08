import { createContext, useContext } from 'react';

import type { FormPageInstance } from '../../types/form-builder.types';

export interface SurveyLogicContextValue {
  pages: FormPageInstance[];
  /** Index of the page being edited: jumps can lead only below it */
  pageIndex: number;
}

/** Present only in the survey builder: forms of requests have no answer jumps */
export const SurveyLogicContext = createContext<SurveyLogicContextValue | null>(null);

export const useSurveyLogic = (): SurveyLogicContextValue | null => useContext(SurveyLogicContext);
