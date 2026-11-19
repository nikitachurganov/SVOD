import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Drawer, Grid, Input, Tag } from 'antd';
import { CopyOutlined, RobotOutlined, SendOutlined } from '../materialIcons';
import axios from 'axios';

import {
  askSurveyAnalysisChat,
  type CrosstabResult,
  type SurveyAiQuote,
} from '../../api/surveys.api';
import { AiQuotaNote } from '../../../components/billing/AiQuotaNote';
import { useSubscription } from '../../hooks/subscription.hooks';
import { getAiQuota } from '../../lib/aiQuota';
import { billingErrorMessage } from '../../lib/billingErrors';
import { CrosstabView } from './CrosstabView';

const EXAMPLE_PROMPTS = [
  'Какие главные выводы по результатам опроса?',
  'Чем различаются ответы разных групп респондентов?',
  'Что чаще всего критикуют в открытых ответах? Приведи цитаты',
];

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quotes?: SurveyAiQuote[];
  crosstab?: CrosstabResult | null;
  isError?: boolean;
}

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

const SECTION_RE = /^(Факты|Интерпретация|Что можно сделать)(?:\s*\([^)]*\))?:\s*(.*)$/;
const SECTION_COLOR: Record<string, string> = {
  Факты: 'blue',
  Интерпретация: 'gold',
  'Что можно сделать': 'green',
};

/** The model separates facts from guesses and advice; show each part under its own label */
const ReplyText = ({ text }: { text: string }) => (
  <>
    {text
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line, index) => {
        const match = SECTION_RE.exec(line.trim());
        return match ? (
          <p key={index} style={{ margin: '0 0 6px' }}>
            <Tag color={SECTION_COLOR[match[1]]} style={{ marginInlineEnd: 6 }}>
              {match[1]}
            </Tag>
            {match[2]}
          </p>
        ) : (
          <p key={index} style={{ margin: '0 0 6px' }}>
            {line}
          </p>
        );
      })}
  </>
);

interface SurveyAiChatPanelProps {
  open: boolean;
  onClose: () => void;
  consentOpen?: boolean;
  onConsentConfirm?: () => void;
  onConsentCancel?: () => void;
  surveyId: string;
  excludeFlagged: boolean;
  /** Starter questions that fit the tab the user is on */
  suggestions?: string[];
  /** Draw the chat as a column of the page layout (no overlay) instead of a Drawer */
  dock?: boolean;
  /** Shown in the intro of the docked agent: survey name and a one-line summary */
  agentContext?: { name: string; meta: string };
  /** Ask for consent before sending survey data to the AI service. */
  requestConsent?: (action: () => void) => void;
  headerBack?: ReactNode;
  headerStatus?: ReactNode;
  headerActions?: ReactNode;
}

export const SurveyAiChatPanel = ({
  open,
  onClose,
  consentOpen = false,
  onConsentConfirm,
  onConsentCancel,
  surveyId,
  excludeFlagged,
  suggestions,
  dock = false,
  agentContext,
  requestConsent,
  headerBack,
  headerStatus,
  headerActions,
}: SurveyAiChatPanelProps) => {
  // Inside the docked glass page --app-bg is transparent, so bubbles need a visible fill
  const bubbleBg = dock ? 'var(--app-surface-elevated)' : 'var(--app-bg)';
  const isMobile = Grid.useBreakpoint().md === false;
  const { subscription, team, refresh: refreshSubscription } = useSubscription();
  const quotaExhausted = getAiQuota(subscription, team).exhausted;
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, isLoading]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || isLoading || quotaExhausted) return;
    if (requestConsent) {
      requestConsent(() => void sendWithConsent(content));
    } else {
      void sendWithConsent(content);
    }
  };

  const sendWithConsent = async (content: string) => {
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: 'user', content };
    const history = [...entries, userEntry];
    setEntries(history);
    setDraft('');
    setIsLoading(true);
    try {
      const response = await askSurveyAnalysisChat(
        surveyId,
        history.filter((e) => !e.isError).map(({ role, content: c }) => ({ role, content: c })),
        excludeFlagged,
      );
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.reply,
          quotes: response.quotes,
          crosstab: response.crosstab,
        },
      ]);
    } catch (error) {
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: getErrorMessage(error), isError: true },
      ]);
    } finally {
      setIsLoading(false);
      // The question used one unit of the plan, whether it was answered or refused
      void refreshSubscription();
    }
  };

  const title = (
    <span>
      <RobotOutlined style={{ color: 'var(--app-primary)', marginRight: 8 }} />
      Спросить ИИ о результатах
    </span>
  );

  const consentContent = (
    <section
      aria-labelledby="survey-ai-consent-title"
      style={{
        margin: 16,
        padding: 20,
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        background: 'var(--app-surface-elevated)',
        color: 'var(--app-text)',
        lineHeight: 1.55,
      }}
    >
      <h2 id="survey-ai-consent-title" style={{ margin: '0 0 8px', fontSize: 18 }}>
        Передать данные опроса ИИ?
      </h2>
      <p style={{ margin: '0 0 8px' }}>
        ИИ-помощник работает через внешний сервис (OpenRouter). Ему будут переданы:
      </p>
      <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
        <li>сводные цифры по вопросам и показатели опроса;</li>
        <li>до 30 цитат из открытых ответов, телефоны и e-mail в них заменяются метками;</li>
        <li>тексты вопросов анкеты.</li>
      </ul>
      <p style={{ margin: '0 0 16px' }}>
        Продолжая, вы подтверждаете, что вправе передавать эти данные: опрос анонимный или респонденты
        согласились на такую обработку. Решение запоминается для этого опроса в вашем браузере.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onConsentCancel}>Отмена</Button>
        <Button type="primary" onClick={onConsentConfirm}>Да, продолжить</Button>
      </div>
    </section>
  );

  const content = (
    <>
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
              Задайте вопрос на естественном языке, например «Почему студенты 3 курса оценивают
              сервис хуже, чем 1 курса?». ИИ сопоставит группы, посчитает различия и найдёт цитаты в
              открытых ответах именно этой группы.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(suggestions ?? EXAMPLE_PROMPTS).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: '1px solid var(--app-border)',
                    borderRadius: 8,
                    background: bubbleBg,
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
                alignSelf: isUser ? 'flex-end' : 'stretch',
                maxWidth: isUser ? '88%' : '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: isUser ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  background: isUser
                    ? 'var(--app-primary)'
                    : entry.isError
                      ? 'color-mix(in srgb, var(--app-error) 10%, var(--app-surface))'
                      : bubbleBg,
                  color: isUser
                    ? '#fff'
                    : entry.isError
                      ? 'var(--app-text-error)'
                      : 'var(--app-text)',
                }}
              >
                {isUser || entry.isError ? entry.content : <ReplyText text={entry.content} />}
              </div>
              {entry.crosstab && (
                <div
                  style={{
                    border: '1px solid var(--app-border)',
                    borderRadius: 8,
                    padding: 10,
                    background: 'var(--app-surface)',
                  }}
                >
                  <CrosstabView result={entry.crosstab} />
                </div>
              )}
              {entry.quotes?.map((quote, index) => (
                <blockquote
                  key={index}
                  style={{
                    margin: 0,
                    padding: '8px 12px',
                    borderLeft: '3px solid var(--app-primary)',
                    background: bubbleBg,
                    borderRadius: 4,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  «{quote.text}»
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    — ответ на вопрос «{quote.question}»
                  </div>
                </blockquote>
              ))}
            </div>
          );
        })}

        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              borderRadius: 12,
              background: bubbleBg,
              color: 'var(--app-text-secondary)',
              fontSize: 13,
            }}
          >
            Анализирую ответы…
          </div>
        )}
      </div>

      <AiQuotaNote className="ai-quota-note" />

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
          placeholder="Например: почему студенты с 3 курса оценивают хуже?"
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={isLoading || quotaExhausted}
          maxLength={2000}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          aria-label="Отправить"
          onClick={() => void send(draft)}
          disabled={isLoading || quotaExhausted || !draft.trim()}
          loading={isLoading}
        />
      </div>
    </>
  );

  if (dock) {
    // The chat state lives in this component, so closing the column keeps the conversation
    if (!open) return null;
    const canSend = !isLoading && !quotaExhausted && draft.trim().length > 0;
    return (
      <aside className="survey-ai-dock" aria-label="Агент">
        <div className="survey-ai-dock__head">
          {headerBack && <div className="survey-ai-dock__back">{headerBack}</div>}
          <div className="survey-ai-dock__title-row">
            <span className="survey-ai-dock__title">{agentContext?.name ?? 'Опрос'}</span>
            {headerStatus}
            {headerActions}
            <Button className="survey-ai-dock__panel-button" aria-label="Закрыть ИИ-помощника" onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        {consentOpen ? consentContent : <div className="ag-feed" ref={listRef}>
          {entries.length === 0 && (
            <div className="ag-intro">
              <h2>Что вы хотите узнать?</h2>
              <p>
                {agentContext?.meta ? `${agentContext.meta}. ` : ''}
                Спросите про ответы: агент сопоставит группы, посчитает различия и найдёт цитаты.
              </p>
              <div className="ag-chips">
                {(suggestions ?? EXAMPLE_PROMPTS).map((prompt) => (
                  <button key={prompt} type="button" className="ag-chip" onClick={() => void send(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((entry) =>
            entry.role === 'user' ? (
              <div key={entry.id} className="ag-msg ag-msg--user">
                <div className="ag-bubble">{entry.content}</div>
              </div>
            ) : (
              <div key={entry.id} className={entry.isError ? 'ag-msg ag-msg--error' : 'ag-msg'}>
                <div className="ag-text">
                  {entry.isError ? entry.content : <ReplyText text={entry.content} />}
                </div>
                {entry.crosstab && (
                  <div className="ag-block">
                    <CrosstabView result={entry.crosstab} />
                  </div>
                )}
                {entry.quotes?.map((quote, index) => (
                  <blockquote key={index} className="ag-quote">
                    «{quote.text}»
                    <span>— ответ на вопрос «{quote.question}»</span>
                  </blockquote>
                ))}
                {!entry.isError && (
                  <div className="ag-actions">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label="Копировать ответ"
                      onClick={() => void navigator.clipboard?.writeText(entry.content)}
                    />
                  </div>
                )}
              </div>
            ),
          )}

          {isLoading && (
            <div className="ag-msg ag-working">
              <span className="ag-spin" />
              Работаю…
            </div>
          )}
        </div>}

        {!consentOpen && <div className="ag-composer-wrap">
          <div className="ag-composer">
            <Input.TextArea
              className="ag-input"
              variant="borderless"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Спросите об ответах опроса"
              autoSize={{ minRows: 1, maxRows: 6 }}
              disabled={isLoading || quotaExhausted}
              maxLength={2000}
            />
            <button
              type="button"
              className="ag-send"
              aria-label="Отправить"
              disabled={!canSend}
              onClick={() => void send(draft)}
            >
              <SendOutlined />
            </button>
          </div>
          <div className="ag-hint">Агент опирается на ответы опроса и может ошибаться</div>
        </div>}
      </aside>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={isMobile ? '100%' : 460}
      title={title}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
      {consentOpen ? consentContent : content}
    </Drawer>
  );
};
