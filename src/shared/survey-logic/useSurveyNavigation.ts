import { useCallback, useMemo, useState } from 'react';

import { JUMP_FIELD_TYPES, jumpsOf, leafFields, nextStep, type LogicPage, type Step } from './surveyLogic';

/** Ids of the questions whose answers can change the path: only their values need watching */
const jumpFieldIds = (pages: LogicPage[]): string[] =>
  pages.flatMap((page) =>
    leafFields(page.fields)
      .filter((f) => f.id && JUMP_FIELD_TYPES.has(f.type) && Object.keys(jumpsOf(f)).length > 0)
      .map((f) => f.id as string),
  );

export interface SurveyNavigation {
  /** Index in `pages` of the page shown now, or -1 when no page has fields */
  current: number;
  isFirst: boolean;
  /** No page after this one with the current answers: the button sends the answers */
  isLast: boolean;
  /** 0-based position of the current page on the path, and the path length with current answers */
  position: number;
  total: number;
  /** Moves on with the given answers; returns where it went */
  goNext: (values: Record<string, unknown>) => Step;
  goBack: () => void;
  reset: () => void;
  /** Feed live form values: re-renders only when an answer that drives a jump changes */
  onValuesChange: (values: Record<string, unknown>) => void;
}

/**
 * Page-by-page navigation that follows answer jumps. Pages visited are kept in a history, so
 * «Назад» returns along the respondent's own path, not to the page above.
 */
export const useSurveyNavigation = (pages: LogicPage[]): SurveyNavigation => {
  const first = useMemo(() => {
    const step = nextStep(pages, -1, {});
    return step.kind === 'page' ? step.index : -1;
  }, [pages]);
  const [history, setHistory] = useState<number[]>([]);
  const [jumpValues, setJumpValues] = useState<Record<string, unknown>>({});
  const watched = useMemo(() => jumpFieldIds(pages), [pages]);

  // A history from another set of pages (the survey reloaded) is dropped
  const path = useMemo(
    () =>
      history.length > 0 && history.every((i) => i < pages.length)
        ? history
        : first >= 0
          ? [first]
          : [],
    [history, pages.length, first],
  );
  const current = path.length ? path[path.length - 1] : -1;

  const remaining = useMemo(() => {
    if (current < 0) return 0;
    let count = 0;
    let step = nextStep(pages, current, jumpValues);
    while (step.kind === 'page') {
      count += 1;
      step = nextStep(pages, step.index, jumpValues);
    }
    return count;
  }, [pages, current, jumpValues]);

  const goNext = useCallback(
    (values: Record<string, unknown>): Step => {
      if (current < 0) return { kind: 'end', ending: null };
      const step = nextStep(pages, current, values);
      if (step.kind === 'page') setHistory([...path, step.index]);
      return step;
    },
    [pages, current, path],
  );

  const goBack = useCallback(() => {
    if (path.length > 1) setHistory(path.slice(0, -1));
  }, [path]);

  const reset = useCallback(() => {
    setHistory([]);
    setJumpValues({});
  }, []);

  const onValuesChange = useCallback(
    (values: Record<string, unknown>) => {
      if (watched.length === 0) return;
      const picked = Object.fromEntries(watched.map((id) => [id, values[id]]));
      setJumpValues((prev) => (JSON.stringify(prev) === JSON.stringify(picked) ? prev : picked));
    },
    [watched],
  );

  return {
    current,
    isFirst: path.length <= 1,
    isLast: remaining === 0,
    position: Math.max(0, path.length - 1),
    total: path.length + remaining,
    goNext,
    goBack,
    reset,
    onValuesChange,
  };
};
