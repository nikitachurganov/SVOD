import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  getPublicPageData,
  mapPublicApiError,
  type PublicLinkErrorCode,
  type PublicPageData,
  type PublicSuggestedFormCard,
} from '../api/public.api';
import {
  PublicFormFlowContext,
  type PublicContactFormValues,
  type PublicFormFlowStep,
  type PublicFormSuccessState,
  type SavedSuggestionsState,
} from './publicFormFlow.context';
import { clearPublicDescriptionDraft } from '../utils/publicDescriptionDraft';

export const PublicFormFlowProvider = () => {
  const { token } = useParams<{ token: string }>();

  const [pageData, setPageData] = useState<PublicPageData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<PublicLinkErrorCode>('unknown');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [step, setStep] = useState<PublicFormFlowStep>('landing');
  const [description, setDescription] = useState('');
  const [suggestions, setSuggestions] = useState<PublicSuggestedFormCard[]>([]);
  const [suggestHint, setSuggestHint] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [showManualList, setShowManualList] = useState(false);

  const [suggestionsCache, setSuggestionsCache] = useState<SavedSuggestionsState | null>(null);
  const [suggestionsCacheDescription, setSuggestionsCacheDescription] = useState('');

  const [savedFormData, setSavedFormData] = useState<Record<string, Record<string, unknown>>>({});
  const [savedContactData, setSavedContactData] = useState<Record<string, PublicContactFormValues>>(
    {},
  );
  const [success, setSuccessState] = useState<PublicFormSuccessState | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getPublicPageData(token)
      .then((data) => {
        if (cancelled) return;
        setPageData(data);
        setErrorMessage(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const mapped = mapPublicApiError(err);
        setErrorCode(mapped.code);
        setErrorMessage(mapped.message);
        setStep('error');
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cacheSuggestions = useCallback((descriptionText: string, state: SavedSuggestionsState) => {
    setSuggestionsCache(state);
    setSuggestionsCacheDescription(descriptionText);
  }, []);

  const restoreSuggestionsFromCache = useCallback(
    (descriptionText: string): boolean => {
      if (!suggestionsCache || suggestionsCacheDescription !== descriptionText.trim()) {
        return false;
      }
      setSuggestions(suggestionsCache.forms);
      setSuggestHint(suggestionsCache.hint);
      setSuggestError(suggestionsCache.suggestError);
      setShowManualList(suggestionsCache.showManualList);
      setStep('suggestions');
      return true;
    },
    [suggestionsCache, suggestionsCacheDescription],
  );

  const saveFormData = useCallback((formId: string, values: Record<string, unknown>) => {
    setSavedFormData((prev) => ({ ...prev, [formId]: values }));
  }, []);

  const getFormData = useCallback(
    (formId: string) => savedFormData[formId],
    [savedFormData],
  );

  const saveContactData = useCallback((formId: string, values: PublicContactFormValues) => {
    setSavedContactData((prev) => ({ ...prev, [formId]: values }));
  }, []);

  const getContactData = useCallback(
    (formId: string) => savedContactData[formId],
    [savedContactData],
  );

  const setSuccess = useCallback((state: PublicFormSuccessState) => {
    setSuccessState(state);
  }, []);

  const clearFormSession = useCallback((formId: string) => {
    setSavedFormData((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
    setSavedContactData((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  }, []);

  const resetFlow = useCallback(() => {
    if (token) clearPublicDescriptionDraft(token);
    setDescription('');
    setSuggestions([]);
    setSuggestHint(null);
    setSuggestError(null);
    setShowManualList(false);
    setSuggestionsCache(null);
    setSuggestionsCacheDescription('');
    setSavedFormData({});
    setSavedContactData({});
    setSuccessState(null);
    setStep('landing');
  }, [token]);

  const goBackToSuggestions = useCallback(() => {
    setStep('suggestions');
  }, []);

  const goBackToLanding = useCallback(() => {
    cacheSuggestions(description.trim(), {
      forms: suggestions,
      hint: suggestHint,
      suggestError,
      showManualList,
    });
    setStep('landing');
  }, [cacheSuggestions, description, showManualList, suggestError, suggestHint, suggestions]);

  const value = useMemo(
    () => ({
      pageData,
      pageLoading,
      errorCode,
      errorMessage,
      step,
      setStep,
      description,
      setDescription,
      suggestions,
      setSuggestions,
      suggestHint,
      setSuggestHint,
      suggestError,
      setSuggestError,
      showManualList,
      setShowManualList,
      suggestionsCache,
      suggestionsCacheDescription,
      cacheSuggestions,
      restoreSuggestionsFromCache,
      savedFormData,
      saveFormData,
      getFormData,
      savedContactData,
      saveContactData,
      getContactData,
      success,
      setSuccess,
      clearFormSession,
      resetFlow,
      goBackToSuggestions,
      goBackToLanding,
    }),
    [
      pageData,
      pageLoading,
      errorCode,
      errorMessage,
      step,
      description,
      suggestions,
      suggestHint,
      suggestError,
      showManualList,
      suggestionsCache,
      suggestionsCacheDescription,
      cacheSuggestions,
      restoreSuggestionsFromCache,
      savedFormData,
      saveFormData,
      getFormData,
      savedContactData,
      saveContactData,
      getContactData,
      success,
      setSuccess,
      clearFormSession,
      resetFlow,
      goBackToSuggestions,
      goBackToLanding,
    ],
  );

  return (
    <PublicFormFlowContext.Provider value={value}>
      <Outlet />
    </PublicFormFlowContext.Provider>
  );
};
