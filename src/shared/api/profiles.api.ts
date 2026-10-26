import api from '../lib/api';
import type { OnboardingState, UserProfile } from '../../types/profile';

/** Used when the server does not report the state (an older server): nobody is asked anything */
const NO_ONBOARDING: OnboardingState = {
  surveyCompleted: true,
  needsSurvey: false,
  dismissible: false,
  tourStatus: 'declined',
  tourStep: null,
};

interface MeResponse {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullName: string;
  email: string;
  phoneNumber: string;
  avatarUrl: string | null;
  createdAt: string;
  onboarding?: OnboardingState;
}

const toProfile = (data: MeResponse): UserProfile => ({
  id: data.id,
  firstName: data.firstName,
  lastName: data.lastName,
  middleName: data.middleName,
  email: data.email,
  phoneNumber: data.phoneNumber,
  avatarUrl: data.avatarUrl,
  createdAt: data.createdAt,
  onboarding: data.onboarding ?? NO_ONBOARDING,
});

export const getProfileById = async (
  _userId: string,
): Promise<UserProfile | null> => {
  try {
    const { data } = await api.get<MeResponse>('/auth/me');
    return toProfile(data);
  } catch {
    return null;
  }
};

export interface UpdateProfilePayload {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}

/** Changes the signed-in person's own name; throws on a server error so the form can show it */
export const updateMyProfile = async ({
  firstName,
  lastName,
  middleName,
}: UpdateProfilePayload): Promise<UserProfile> => {
  const { data } = await api.patch<MeResponse>('/auth/me', {
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName?.trim() || null,
  });
  return toProfile(data);
};
