const storageKey = (surveyId: string) => `survey-ai-consent:${surveyId}`;

export const hasAiConsent = (surveyId: string): boolean => {
  try {
    return window.localStorage.getItem(storageKey(surveyId)) === '1';
  } catch {
    return false;
  }
};

export const rememberAiConsent = (surveyId: string): void => {
  try {
    window.localStorage.setItem(storageKey(surveyId), '1');
  } catch {
    // Without storage the question is simply asked again next time
  }
};
