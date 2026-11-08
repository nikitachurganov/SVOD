/**
 * Answer-based jumps between survey pages (pure functions, no runtime imports).
 *
 * The same rules live in `backend/app/services/survey_logic.py`; both are checked against
 * `backend/tests/fixtures/survey_logic_cases.json` (`npm run test:logic` and pytest).
 *
 * - On a one-answer question (`radio`, `dropdown`, `yesNo`) `config.jumps` maps an option id to a
 *   page id or to `'end'`.
 * - `page.next` is where to go after the page when no jump fired (default: the next page).
 * - A page with `ending: true` is an ending screen: shown after the answers are sent, only when a
 *   jump or `next` leads to it. Going in order skips it.
 * - Jumps work only forward; an unknown or backward target is ignored.
 * - A page without fields is passed through: never shown, but its `next` applies.
 */

export const END_TARGET = 'end';
export const JUMP_FIELD_TYPES: ReadonlySet<string> = new Set(['radio', 'dropdown', 'yesNo']);
const OTHER_PREFIX = '__other__:';

export interface LogicOption {
  id: string;
  label: string;
  isOther?: boolean;
}

const YES_NO_OPTIONS: LogicOption[] = [
  { id: 'yes', label: 'Да' },
  { id: 'no', label: 'Нет' },
];

/** The part of a field the rules need: fits both FormFieldInstance and the stored payload */
export interface LogicField {
  id?: string;
  type: string;
  label?: string;
  options?: Array<LogicOption | string>;
  children?: LogicField[];
  config?: Record<string, unknown>;
}

export interface LogicPage {
  id: string;
  title?: string;
  fields: LogicField[];
  next?: string;
  ending?: boolean;
}

export type Step = { kind: 'page'; index: number } | { kind: 'end'; ending: number | null };

export const leafFields = <F extends LogicField>(fields: F[] | undefined): F[] => {
  const out: F[] = [];
  const walk = (list: F[] | undefined) => {
    for (const field of list ?? []) {
      if (field.type === 'group') walk(field.children as F[] | undefined);
      else out.push(field);
    }
  };
  walk(fields);
  return out;
};

export const isEnding = (page: LogicPage | undefined): boolean => page?.ending === true;

export const fieldOptions = (field: LogicField): LogicOption[] => {
  if (field.type === 'yesNo' && !field.options?.length) return YES_NO_OPTIONS;
  return (field.options ?? []).filter(
    (o): o is LogicOption => typeof o === 'object' && o !== null && typeof o.id === 'string',
  );
};

export const jumpsOf = (field: LogicField): Record<string, string> => {
  if (!JUMP_FIELD_TYPES.has(field.type)) return {};
  const raw = field.config?.jumps;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
};

/**
 * The option a one-answer question was answered with: accepts the live form value (an option id,
 * or `{ selected }` when the question has «Другое») and the stored one (a label, `__other__:text`).
 */
export const chosenOptionId = (field: LogicField, value: unknown): string | null => {
  let raw: unknown = value;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const selected = (raw as { selected?: unknown }).selected;
    raw = typeof selected === 'string' ? selected : null;
  }
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const options = fieldOptions(field);
  if (options.some((o) => o.id === text)) return text;
  if (text.startsWith(OTHER_PREFIX)) return options.find((o) => o.isOther)?.id ?? null;
  const lowered = text.toLowerCase();
  return options.find((o) => String(o.label ?? '').trim().toLowerCase() === lowered)?.id ?? null;
};

/** Where the page sends the respondent: the first fired jump from the top, else `page.next` */
export const pageTarget = (page: LogicPage, answers: Record<string, unknown>): string | null => {
  for (const field of leafFields(page.fields)) {
    const jumps = jumpsOf(field);
    if (!field.id || Object.keys(jumps).length === 0) continue;
    const optionId = chosenOptionId(field, answers[field.id]);
    if (optionId !== null && optionId in jumps) return jumps[optionId];
  }
  return typeof page.next === 'string' && page.next ? page.next : null;
};

const resolve = (pages: LogicPage[], current: number, target: string | null): Step => {
  if (target === END_TARGET) return { kind: 'end', ending: null };
  if (target !== null) {
    const index = pages.findIndex((p) => p.id === target);
    if (index > current) {
      return isEnding(pages[index]) ? { kind: 'end', ending: index } : { kind: 'page', index };
    }
  }
  let k = current + 1;
  while (k < pages.length && isEnding(pages[k])) k += 1;
  return k < pages.length ? { kind: 'page', index: k } : { kind: 'end', ending: null };
};

const hasContent = (page: LogicPage): boolean => (page.fields?.length ?? 0) > 0;

/** From page `current` (or -1 for the start), the next page that is shown, or the end */
export const nextStep = (
  pages: LogicPage[],
  current: number,
  answers: Record<string, unknown>,
): Step => {
  let step = resolve(pages, current, current >= 0 ? pageTarget(pages[current], answers) : null);
  while (step.kind === 'page' && !hasContent(pages[step.index])) {
    step = resolve(pages, step.index, pageTarget(pages[step.index], answers));
  }
  return step;
};

export interface SurveyPath {
  pages: number[];
  ending: number | null;
}

export const surveyPath = (pages: LogicPage[], answers: Record<string, unknown>): SurveyPath => {
  const path: number[] = [];
  let step = nextStep(pages, -1, answers);
  while (step.kind === 'page') {
    path.push(step.index);
    step = nextStep(pages, step.index, answers);
  }
  return { pages: path, ending: step.ending };
};

export const shownFieldIds = (pages: LogicPage[], answers: Record<string, unknown>): Set<string> => {
  const ids = new Set<string>();
  for (const index of surveyPath(pages, answers).pages) {
    for (const field of leafFields(pages[index].fields)) if (field.id) ids.add(field.id);
  }
  return ids;
};

/** Answers only for the questions on the respondent's path: a branch left behind is not sent */
export const pruneAnswers = (
  pages: LogicPage[],
  liveValues: Record<string, unknown>,
  answers: Record<string, unknown>,
): Record<string, unknown> => {
  const shown = shownFieldIds(pages, liveValues);
  return Object.fromEntries(Object.entries(answers).filter(([id]) => shown.has(id)));
};

export const hasLogic = (pages: LogicPage[]): boolean =>
  pages.some(
    (page) =>
      isEnding(page) ||
      Boolean(page.next) ||
      leafFields(page.fields).some((f) => Object.keys(jumpsOf(f)).length > 0),
  );
