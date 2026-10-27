import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, Dropdown, Input } from 'antd';
import {
  BookOutlined,
  CloseOutlined,
  RobotOutlined,
  SendOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import axios from 'axios';

import {
  buildFormWithAi,
  mapPagesToPayload,
  payloadToInstance,
  type CreateFormFieldPayload,
  type FormAiBuildResponse,
  type FormAiChatMessage,
} from '../../api/forms.api';
import type {
  FieldOption,
  FormFieldInstance,
  FormPageInstance,
} from '../../types/form-builder.types';
import { getDefaultFieldConfig } from '../../utils/fieldConfig';
import {
  buildSurveyWithAi,
  type MethodologyMeta,
  type SurveyAiBuildResponse,
  type MethodologySummary,
} from '../../api/surveys.api';
import { AiQuotaNote } from '../../../components/billing/AiQuotaNote';
import { useSubscription } from '../../hooks/subscription.hooks';
import { getAiQuota } from '../../lib/aiQuota';
import { billingErrorMessage } from '../../lib/billingErrors';
import { MethodologyReportModal } from '../survey/MethodologyReportModal';
import { MethodologyPickerModal } from '../survey/MethodologyPickerModal';

// ─── Response → builder state ─────────────────────────────────────────────────

const indexFieldsById = (pages: FormPageInstance[]): Map<string, FormFieldInstance> => {
  const map = new Map<string, FormFieldInstance>();
  const walk = (fields: FormFieldInstance[]) => {
    for (const field of fields) {
      map.set(field.id, field);
      if (field.children) walk(field.children);
    }
  };
  pages.forEach((page) => walk(page.fields));
  return map;
};

/** Keeps option ids stable when the model returns the same option labels */
const reuseOptionIds = (
  options: FieldOption[] | undefined,
  previous: FieldOption[] | undefined,
): FieldOption[] | undefined => {
  if (!options || !previous?.length) return options;
  const byLabel = new Map(previous.map((opt) => [opt.label.trim().toLowerCase(), opt]));
  return options.map((opt) => {
    const prev = byLabel.get(opt.label.trim().toLowerCase());
    return prev ? { ...opt, id: prev.id, isOther: prev.isOther } : opt;
  });
};

/** Question titles are shown without a trailing colon ("Вопрос?:" → "Вопрос?") */
const stripTrailingColon = (label: string): string => label.replace(/\s*:+\s*$/, '');

const normalizeAiField = (
  payload: CreateFormFieldPayload,
  existing: Map<string, FormFieldInstance>,
): FormFieldInstance => {
  const field = payloadToInstance({ ...payload, children: undefined });
  field.label = stripTrailingColon(field.label);
  const previous = payload.id ? existing.get(payload.id) : undefined;
  const sameType = previous?.type === field.type;
  const config = {
    ...(getDefaultFieldConfig(field.type) ?? {}),
    ...(sameType ? previous?.config : undefined),
    ...(field.config ?? {}),
  };

  return {
    ...field,
    options: reuseOptionIds(field.options, sameType ? previous?.options : undefined),
    config: Object.keys(config).length ? config : undefined,
    children:
      field.type === 'group'
        ? (payload.children ?? []).map((child) => normalizeAiField(child, existing))
        : undefined,
  };
};

export interface MethodologyState {
  meta: MethodologyMeta | null;
  summary: MethodologySummary | null;
}

const responseToPages = (
  response: NonNullable<FormAiBuildResponse['pages']>,
  currentPages: FormPageInstance[],
): FormPageInstance[] => {
  const existing = indexFieldsById(currentPages);
  return response.map((page, index) => ({
    id: currentPages[index]?.id ?? crypto.randomUUID(),
    title: page.title || `Страница ${index + 1}`,
    fields: page.fields.map((field) => normalizeAiField(field, existing)),
  }));
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface ChatEntry extends FormAiChatMessage {
  id: string;
  isError?: boolean;
  /** Form state before this assistant message applied its changes */
  snapshot?: { title: string; pages: FormPageInstance[]; methodology?: MethodologyState };
}

export interface AiFormBuilderPanelProps {
  formTitle: string;
  pages: FormPageInstance[];
  /** Chat history lives in the editor so it survives preview mode and closing the panel */
  entries: ChatEntry[];
  onEntriesChange: Dispatch<SetStateAction<ChatEntry[]>>;
  draft: string;
  onDraftChange: (draft: string) => void;
  /** A number is a fixed side column; a string ('100%') fills the container (mobile drawer) */
  width?: number | string;
  onApply: (title: string | null, pages: FormPageInstance[]) => void;
  onRestore: (title: string, pages: FormPageInstance[], methodology?: MethodologyState) => void;
  onClose: () => void;
  /** 'survey' enables methodology selection and the methodology summary */
  mode?: 'form' | 'survey';
  methodology?: MethodologyState;
  onMethodologyChange?: (state: MethodologyState) => void;
}

const EXAMPLE_PROMPTS = [
  'Форма заявки на печать баннера: размеры, материал, макет, сроки и контакты',
  'Анкета обратной связи после мероприятия с оценкой и комментарием',
  'Заявка на закупку оборудования с обоснованием и бюджетом',
];

const SURVEY_EXAMPLE_PROMPTS = [
  'Анкета для курсовой: удовлетворённость студентов расписанием и готовность рекомендовать вуз',
  'Интервью для проверки идеи сервиса доставки домашней еды',
  'Оценка юзабилити сайта кафедры',
  'Обратная связь клиентов после обращения в поддержку',
];

const getErrorMessage = (error: unknown): string => {
  const billing = billingErrorMessage(error);
  if (billing) return billing;
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (error.code === 'ECONNABORTED') return 'ИИ отвечает слишком долго. Попробуйте ещё раз.';
  }
  return 'Не удалось получить ответ ИИ. Попробуйте ещё раз.';
};

export const AiFormBuilderPanel = ({
  formTitle,
  pages,
  entries,
  onEntriesChange: setEntries,
  draft,
  onDraftChange: setDraft,
  width = 380,
  onApply,
  onRestore,
  onClose,
  mode = 'form',
  methodology,
  onMethodologyChange,
}: AiFormBuilderPanelProps) => {
  const isSurvey = mode === 'survey';
  // Only the survey builder spends the plan's AI actions; the base product's form builder is not metered
  const { subscription, refresh: refreshSubscription } = useSubscription();
  const quotaExhausted = isSurvey && getAiQuota(subscription).exhausted;
  const [reportOpen, setReportOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pagePayload = useMemo(() => mapPagesToPayload(pages), [pages]);
  const selectedMethodIds = useMemo(
    () => methodology?.summary?.methodologies.map((m) => m.id) ?? [],
    [methodology],
  );
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, isLoading]);

  const lastAppliedId = [...entries].reverse().find((entry) => entry.snapshot)?.id;

  const send = async (text: string, methodologyIds?: string[]) => {
    const content = text.trim();
    if (!content || isLoading || quotaExhausted) return;

    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: 'user', content };
    const history = [...entries, userEntry];
    setEntries(history);
    setDraft('');
    setIsLoading(true);

    try {
      const chatMessages = history
        .filter((entry) => !entry.isError)
        .map(({ role, content: c }) => ({ role, content: c }));
      const response = isSurvey
        ? await buildSurveyWithAi({
            messages: chatMessages,
            title: formTitle,
            pages: pagePayload,
            methodology_meta: methodology?.meta ?? null,
            methodology_ids: methodologyIds,
          })
        : await buildFormWithAi({
            messages: chatMessages,
            title: formTitle,
            pages: pagePayload,
          });

      const previousMethodology: MethodologyState | undefined = isSurvey
        ? (methodology ?? { meta: null, summary: null })
        : undefined;
      let snapshot: ChatEntry['snapshot'];
      if (response.pages) {
        snapshot = { title: formTitle, pages, methodology: previousMethodology };
        onApply(response.title, responseToPages(response.pages, pages));
        if (isSurvey) {
          const surveyResponse = response as SurveyAiBuildResponse;
          onMethodologyChange?.({
            meta: surveyResponse.methodology_meta,
            summary: surveyResponse.methodology_summary,
          });
        }
      } else if (response.title) {
        snapshot = { title: formTitle, pages, methodology: previousMethodology };
        onApply(response.title, pages);
      }

      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: response.reply, snapshot },
      ]);
    } catch (error) {
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: getErrorMessage(error),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      // The action used one unit of the plan, whether it worked or was refused
      if (isSurvey) void refreshSubscription();
    }
  };

  const handleUndo = (entry: ChatEntry) => {
    if (!entry.snapshot) return;
    onRestore(entry.snapshot.title, entry.snapshot.pages, entry.snapshot.methodology);
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, snapshot: undefined } : e)),
    );
  };

  return (
    <div
      style={{
        width,
        minWidth: typeof width === 'number' ? width : 0,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: typeof width === 'number' ? '1px solid var(--app-border)' : 'none',
        background: 'var(--app-surface)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--app-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          <RobotOutlined style={{ color: 'var(--app-primary)' }} />
          {isSurvey ? 'ИИ-конструктор опросов' : 'ИИ-конструктор'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isSurvey && methodology?.summary && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'report',
                    label: 'Подробный обзор методик',
                    onClick: () => setReportOpen(true),
                  },
                  {
                    key: 'edit',
                    label: 'Изменить набор',
                    disabled: isLoading,
                    onClick: () => setPickerOpen(true),
                  },
                ],
              }}
            >
              <Button type="text" size="small" icon={<BookOutlined />} aria-label="Методики">
                Методики
              </Button>
            </Dropdown>
          )}
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label="Скрыть ИИ-конструктор"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {entries.length === 0 && (
          <div style={{ color: 'var(--app-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}>
              {isSurvey
                ? 'Опишите, что нужно выяснить и у кого, — ИИ определит цели, подберёт методики исследования и соберёт опрос. Потом его можно доработать сообщениями или вручную.'
                : 'Опишите, какая форма нужна, — ИИ соберёт её из доступных полей. Можно попросить изменить текущую форму: добавить, удалить или переименовать поля.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(isSurvey ? SURVEY_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  disabled={quotaExhausted}
                  style={{
                    opacity: quotaExhausted ? 0.5 : 1,
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: '1px solid var(--app-border)',
                    borderRadius: 8,
                    background: 'var(--app-bg)',
                    color: 'var(--app-text)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => {
          const isUser = entry.role === 'user';
          return (
            <div
              key={entry.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: 4,
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: isUser
                    ? 'var(--app-primary)'
                    : entry.isError
                      ? 'color-mix(in srgb, var(--app-error) 10%, var(--app-surface))'
                      : 'var(--app-bg)',
                  color: isUser
                    ? '#fff'
                    : entry.isError
                      ? 'var(--app-text-error)'
                      : 'var(--app-text)',
                }}
              >
                {entry.content}
              </div>
              {entry.snapshot && entry.id === lastAppliedId && (
                <Button
                  type="link"
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={() => handleUndo(entry)}
                  disabled={isLoading}
                  style={{ padding: 0, height: 'auto', fontSize: 12 }}
                >
                  Отменить изменения
                </Button>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              borderRadius: 12,
              background: 'var(--app-bg)',
              color: 'var(--app-text-secondary)',
              fontSize: 13,
            }}
          >
            {isSurvey ? 'Подбираю методики и собираю опрос…' : 'Собираю форму…'}
          </div>
        )}
      </div>

      {isSurvey && <AiQuotaNote className="ai-quota-note" />}

      {/* Composer */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid var(--app-border)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder={
            isSurvey ? 'Например: сделай короче и добавь вопрос про общежитие' : 'Например: добавь поле с датой доставки'
          }
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={isLoading || quotaExhausted}
          maxLength={4000}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          aria-label="Отправить"
          onClick={() => send(draft)}
          disabled={isLoading || quotaExhausted || !draft.trim()}
          loading={isLoading}
        />
      </div>

      {isSurvey && (
        <>
          {reportOpen && (
            <MethodologyReportModal
              open
              onClose={() => setReportOpen(false)}
              surveyName={formTitle}
              methodologyMeta={methodology?.meta ?? null}
              pages={pagePayload}
            />
          )}
          <MethodologyPickerModal
            key={pickerOpen ? 'open' : 'closed'}
            open={pickerOpen}
            selectedIds={selectedMethodIds}
            onCancel={() => setPickerOpen(false)}
            onConfirm={(ids) => {
              setPickerOpen(false);
              void send('Перестрой опрос с учётом выбранного набора методик.', ids);
            }}
          />
        </>
      )}
    </div>
  );
};
