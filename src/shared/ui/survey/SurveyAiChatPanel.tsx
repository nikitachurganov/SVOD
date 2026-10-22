import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Grid, Input, Tag } from 'antd';
import { RobotOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

import {
  askSurveyAnalysisChat,
  type CrosstabResult,
  type SurveyAiQuote,
} from '../../api/surveys.api';
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
  surveyId: string;
  excludeFlagged: boolean;
  /** Starter questions that fit the tab the user is on */
  suggestions?: string[];
}

export const SurveyAiChatPanel = ({
  open,
  onClose,
  surveyId,
  excludeFlagged,
  suggestions,
}: SurveyAiChatPanelProps) => {
  const isMobile = Grid.useBreakpoint().md === false;
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, isLoading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isLoading) return;
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
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={isMobile ? '100%' : 460}
      title={
        <span>
          <RobotOutlined style={{ color: 'var(--app-primary)', marginRight: 8 }} />
          Спросить ИИ о результатах
        </span>
      }
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
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
                      : 'var(--app-bg)',
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
                    background: 'var(--app-bg)',
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
              background: 'var(--app-bg)',
              color: 'var(--app-text-secondary)',
              fontSize: 13,
            }}
          >
            Анализирую ответы…
          </div>
        )}
      </div>

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
          disabled={isLoading}
          maxLength={2000}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          aria-label="Отправить"
          onClick={() => void send(draft)}
          disabled={isLoading || !draft.trim()}
          loading={isLoading}
        />
      </div>
    </Drawer>
  );
};
