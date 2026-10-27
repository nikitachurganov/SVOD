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
  /** Platform role: «admin» opens the administrator pages */
  role: string;
  /** The mailbox was confirmed by a link from an email */
  emailVerified: boolean;
  /** The server can send the confirmation email; without it nobody is asked to confirm */
  emailVerificationAvailable: boolean;
  onboarding: OnboardingState;
}

