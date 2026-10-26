import api from '../lib/api';
import type { OnboardingState, TourStatus } from '../../types/profile';

export interface OnboardingSurveyPayload {
  occupation: string;
  occupationOther?: string;
  purposes: string[];
  purposeOther?: string;
  source: string;
  sourceOther?: string;
}

const clean = (text?: string): string | null => text?.trim() || null;

/** Saves the answers of the first-visit questionnaire */
export const submitOnboardingSurvey = async (
  payload: OnboardingSurveyPayload,
): Promise<OnboardingState> => {
  const { data } = await api.put<OnboardingState>('/auth/me/onboarding', {
    occupation: payload.occupation,
    occupation_other: clean(payload.occupationOther),
    purposes: payload.purposes,
    purpose_other: clean(payload.purposeOther),
    source: payload.source,
    source_other: clean(payload.sourceOther),
  });
  return data;
};

/** Closes the questionnaire without answering; the server allows it only for accounts that predate it */
export const dismissOnboardingSurvey = async (): Promise<OnboardingState> => {
  const { data } = await api.post<OnboardingState>('/auth/me/onboarding/dismiss');
  return data;
};

/** Remembers the answer to the tour offer and the step the person stopped at */
export const updateTourState = async (
  status: TourStatus,
  step?: string | null,
): Promise<OnboardingState> => {
  const { data } = await api.patch<OnboardingState>('/auth/me/tour', { status, step: step ?? null });
  return data;
};
