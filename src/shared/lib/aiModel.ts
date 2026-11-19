/** The model a team with Токены+ picked for its AI actions (docs/MONETIZATION_TEAM_SPEC.md, section 2).
 * Kept per browser; the server checks it again on every request and refuses a model the team may not use. */

const KEY = 'svod.ai-model';

export const getAiModel = (): string | null => {
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
};

export const setAiModel = (model: string | null): void => {
  try {
    if (model) window.localStorage.setItem(KEY, model);
    else window.localStorage.removeItem(KEY);
  } catch {
    // The choice just is not remembered
  }
};

/** The `model` field of an AI request: nothing when the base model is in use */
export const aiModelField = (): { model?: string } => {
  const model = getAiModel();
  return model ? { model } : {};
};
