/**
 * Helpers for editing answer jumps in the survey builder: target lists, labels, checks and
 * clean-up. The rules themselves are in ./surveyLogic.
 */
import type { FormFieldInstance, FormPageInstance } from '../types/form-builder.types';
import {
  END_TARGET,
  JUMP_FIELD_TYPES,
  fieldOptions,
  isEnding,
  jumpsOf,
  leafFields,
} from './surveyLogic';

const clip = (text: string, max = 40): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** «Страница 3 — Почему вы ушли?»: the number as on the tabs plus the first text on the page */
export const pageLabel = (pages: FormPageInstance[], index: number): string => {
  const page = pages[index];
  if (!page) return 'Удалённая страница';
  const base = isEnding(page) ? `Завершение (стр. ${index + 1})` : `Страница ${index + 1}`;
  const first = leafFields(page.fields).find((f) => f.label.trim() || f.description.trim());
  const hint = first ? first.label.trim() || first.description.trim() : '';
  return hint ? `${base} — ${clip(hint)}` : base;
};

export interface TargetOption {
  value: string;
  label: string;
}

/** Where a page can send the respondent: only pages below it, then «Завершить опрос» */
export const targetOptions = (pages: FormPageInstance[], fromIndex: number): TargetOption[] => [
  ...pages
    .map((page, index) => ({ page, index }))
    .filter(({ index }) => index > fromIndex)
    .map(({ page, index }) => ({ value: page.id, label: pageLabel(pages, index) })),
  { value: END_TARGET, label: 'Завершить опрос' },
];

export const canHaveJumps = (field: FormFieldInstance): boolean => JUMP_FIELD_TYPES.has(field.type);

/** New config with the jump of one option set (target) or removed (null) */
export const withJump = (
  field: FormFieldInstance,
  optionId: string,
  target: string | null,
): Record<string, unknown> => {
  const jumps = { ...jumpsOf(field) };
  if (target) jumps[optionId] = target;
  else delete jumps[optionId];
  const config = { ...(field.config ?? {}) };
  if (Object.keys(jumps).length) config.jumps = jumps;
  else delete config.jumps;
  return config;
};

const mapFields = (
  fields: FormFieldInstance[],
  fn: (field: FormFieldInstance) => FormFieldInstance,
): FormFieldInstance[] =>
  fields.map((field) =>
    fn(field.children ? { ...field, children: mapFields(field.children, fn) } : field),
  );

/** After a page is deleted: jumps and «after this page» that led to it go back to the default */
export const removePageReferences = (
  pages: FormPageInstance[],
  pageId: string,
): FormPageInstance[] =>
  pages.map((page) => {
    const kept: FormPageInstance = { ...page };
    if (kept.next === pageId) delete kept.next;
    kept.fields = mapFields(page.fields, (field) => {
      const jumps = jumpsOf(field);
      if (!Object.values(jumps).includes(pageId)) return field;
      let current = field;
      for (const [optionId, target] of Object.entries(jumps)) {
        if (target === pageId) current = { ...current, config: withJump(current, optionId, null) };
      }
      return current;
    });
    return kept;
  });

export interface IncomingJump {
  fromPage: number;
  text: string;
}

/** What leads to the page: «Страница 1: «Вы клиент?» → Нет» */
export const incomingJumps = (pages: FormPageInstance[], pageId: string): IncomingJump[] => {
  const out: IncomingJump[] = [];
  pages.forEach((page, index) => {
    for (const field of leafFields(page.fields)) {
      const jumps = jumpsOf(field);
      for (const option of fieldOptions(field)) {
        if (jumps[option.id] === pageId) {
          out.push({
            fromPage: index,
            text: `«${clip(field.label || 'Без названия', 30)}» → ${clip(option.label, 24)}`,
          });
        }
      }
    }
    if (page.next === pageId) out.push({ fromPage: index, text: 'после страницы' });
  });
  return out;
};

export interface LogicProblem {
  pageIndex: number;
  message: string;
}

const pageIndexOf = (pages: FormPageInstance[], id: string): number =>
  pages.findIndex((p) => p.id === id);

/** Checks for the builder: jumps that will not work, screens nobody reaches */
export const logicProblems = (pages: FormPageInstance[]): LogicProblem[] => {
  const problems: LogicProblem[] = [];
  const isForward = (from: number, target: string) =>
    target === END_TARGET || pageIndexOf(pages, target) > from;

  pages.forEach((page, index) => {
    const n = index + 1;
    if (isEnding(page)) {
      if (leafFields(page.fields).some((f) => f.type !== 'textBlock')) {
        problems.push({
          pageIndex: index,
          message: `На экране завершения (стр. ${n}) есть вопросы: их никто не увидит. Оставьте здесь только текст.`,
        });
      }
      return;
    }
    if (page.next && !isForward(index, page.next)) {
      problems.push({
        pageIndex: index,
        message: `Страница ${n}: «после этой страницы» ведёт на страницу выше. Переход назад не работает.`,
      });
    }
    for (const field of leafFields(page.fields)) {
      const jumps = jumpsOf(field);
      if (!Object.keys(jumps).length) continue;
      const options = fieldOptions(field);
      for (const option of options) {
        const target = jumps[option.id];
        if (target && !isForward(index, target)) {
          problems.push({
            pageIndex: index,
            message: `Страница ${n}, «${clip(field.label || 'Без названия', 30)}»: ответ «${clip(option.label, 24)}» ведёт на страницу выше. Переход назад не работает.`,
          });
        }
      }
      const labels = options.map((o) => o.label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) {
        problems.push({
          pageIndex: index,
          message: `Страница ${n}, «${clip(field.label || 'Без названия', 30)}»: у вариантов одинаковые названия. Переходы по ним могут сработать неверно.`,
        });
      }
    }
  });

  // Pages nobody reaches: walk every possible exit from the first page
  const nextInOrder = (from: number): number => {
    let k = from + 1;
    while (k < pages.length && isEnding(pages[k])) k += 1;
    return k;
  };
  const reached = new Set<number>();
  const queue = [nextInOrder(-1)];
  while (queue.length) {
    const index = queue.shift()!;
    if (index >= pages.length || reached.has(index)) continue;
    reached.add(index);
    const page = pages[index];
    if (isEnding(page)) continue;
    for (const field of leafFields(page.fields)) {
      for (const target of Object.values(jumpsOf(field))) {
        const t = pageIndexOf(pages, target);
        if (t > index) queue.push(t);
      }
    }
    if (page.next === END_TARGET) continue;
    const nextTarget = page.next ? pageIndexOf(pages, page.next) : -1;
    queue.push(nextTarget > index ? nextTarget : nextInOrder(index));
  }
  pages.forEach((page, index) => {
    if (reached.has(index) || page.fields.length === 0) return;
    problems.push({
      pageIndex: index,
      message: isEnding(page)
        ? `Экран завершения (стр. ${index + 1}) не подключён: выберите его в переходах ответа или в «после этой страницы».`
        : `Страница ${index + 1} недоступна: переходы её обходят.`,
    });
  });
  return problems;
};
