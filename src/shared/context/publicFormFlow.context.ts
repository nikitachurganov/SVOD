import { createContext } from 'react';
import type {
  PublicLinkErrorCode,
  PublicPageData,
  PublicSuggestedFormCard,
} from '../api/public.api';

export type PublicFormFlowStep = 'landing' | 'suggesting' | 'suggestions' | 'error';

export interface PublicContactFormValues {
  fullName: string;
  email: string;
  phone: string;
  company: string;
}

export interface SavedSuggestionsState {
  forms: PublicSuggestedFormCard[];
  hint: string | null;
  suggestError: string | null;
  showManualList: boolean;
}

export interface PublicFormSuccessState {
  requestNumber?: string;
  organizationName: string;
}

export interface PublicFormFlowContextValue {
  pageData: PublicPageData | null;
  pageLoading: boolean;
  errorCode: PublicLinkErrorCode;
  errorMessage: string | null;

  step: PublicFormFlowStep;
  setStep: (step: PublicFormFlowStep) => void;

  description: string;
  setDescription: (value: string) => void;

  suggestions: PublicSuggestedFormCard[];
  setSuggestions: (forms: PublicSuggestedFormCard[]) => void;
  suggestHint: string | null;
  setSuggestHint: (hint: string | null) => void;
  suggestError: string | null;
  setSuggestError: (error: string | null) => void;
  showManualList: boolean;
  setShowManualList: (value: boolean) => void;

  suggestionsCache: SavedSuggestionsState | null;
  suggestionsCacheDescription: string;
  cacheSuggestions: (descriptionText: string, state: SavedSuggestionsState) => void;
  restoreSuggestionsFromCache: (descriptionText: string) => boolean;

  savedFormData: Record<string, Record<string, unknown>>;
  saveFormData: (formId: string, values: Record<string, unknown>) => void;
  getFormData: (formId: string) => Record<string, unknown> | undefined;

  savedContactData: Record<string, PublicContactFormValues>;
  saveContactData: (formId: string, values: PublicContactFormValues) => void;
  getContactData: (formId: string) => PublicContactFormValues | undefined;

  success: PublicFormSuccessState | null;
  setSuccess: (state: PublicFormSuccessState) => void;

  clearFormSession: (formId: string) => void;
  resetFlow: () => void;
  goBackToSuggestions: () => void;
  goBackToLanding: () => void;
}

export const PublicFormFlowContext = createContext<PublicFormFlowContextValue | null>(null);
