const storageKey = (token: string) => `svod_public_description_${token}`;

const LEGACY_KEY = (token: string) => `svod_public_applicant_${token}`;

export const savePublicDescriptionDraft = (token: string, description: string): void => {
  try {
    sessionStorage.setItem(storageKey(token), description);
  } catch {
    /* ignore quota / private mode */
  }
};

export const loadPublicDescriptionDraft = (token: string): string => {
  try {
    const direct = sessionStorage.getItem(storageKey(token));
    if (direct !== null) return direct;

    const legacyRaw = sessionStorage.getItem(LEGACY_KEY(token));
    if (!legacyRaw) return '';
    const parsed = JSON.parse(legacyRaw) as { draftDescription?: string };
    return typeof parsed.draftDescription === 'string' ? parsed.draftDescription : '';
  } catch {
    return '';
  }
};

export const clearPublicDescriptionDraft = (token: string): void => {
  try {
    sessionStorage.removeItem(storageKey(token));
    sessionStorage.removeItem(LEGACY_KEY(token));
  } catch {
    /* ignore */
  }
};

export const MIN_PUBLIC_DESCRIPTION_LENGTH = 10;
