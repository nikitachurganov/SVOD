export type TourStatus = 'pending' | 'accepted' | 'declined' | 'completed';

/** First-visit questionnaire and guided-tour state, as the server reports it */
export interface OnboardingState {
  surveyCompleted: boolean;
  /** Show the questionnaire now: not answered yet and not closed */
  needsSurvey: boolean;
  /** May be closed without answering (accounts that predate the questionnaire) */
  dismissible: boolean;
  tourStatus: TourStatus;
  tourStep: string | null;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phoneNumber: string;
  avatarUrl: string | null;
  createdAt: string;
  onboarding: OnboardingState;
}

