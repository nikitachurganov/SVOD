export const publicApplicantStorageKey = (token: string) =>
  `svod_public_applicant_${token}`;

export interface PublicApplicantDraft {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  draftDescription: string;
}

export function savePublicApplicantDraft(
  token: string,
  draft: PublicApplicantDraft,
): void {
  try {
    sessionStorage.setItem(publicApplicantStorageKey(token), JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPublicApplicantDraft(token: string): PublicApplicantDraft | null {
  try {
    const raw = sessionStorage.getItem(publicApplicantStorageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicApplicantDraft>;
    if (
      typeof parsed.fullName !== 'string' ||
      typeof parsed.company !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.phone !== 'string' ||
      typeof parsed.draftDescription !== 'string'
    ) {
      return null;
    }
    return {
      fullName: parsed.fullName,
      company: parsed.company,
      email: parsed.email,
      phone: parsed.phone,
      draftDescription: parsed.draftDescription,
    };
  } catch {
    return null;
  }
}

/** Split on whitespace; counts non-empty tokens (supports Russian/Latin). */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}
