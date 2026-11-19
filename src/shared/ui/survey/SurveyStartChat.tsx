import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select } from 'antd';
import { CreditCardOutlined, InboxOutlined, MessageOutlined, SendOutlined, TeamOutlined } from '../materialIcons';
import { useNavigate } from 'react-router-dom';
import { buildSurveyWithAi, createSurvey, type MethodologyMeta, type SurveyProject } from '../../api/surveys.api';
import type { CreateFormPagePayload } from '../../api/forms.api';
import { useSubscription } from '../../hooks/subscription.hooks';
import { getAiQuota } from '../../lib/aiQuota';
import { billingErrorMessage } from '../../lib/billingErrors';
import { AiModelSelect } from './AiModelSelect';
import './SurveyStartChat.css';
import { useResearchUnsavedChanges } from '../../hooks/useResearchUnsavedChanges';
import { useAuth } from '../../hooks/auth.hooks';

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean };
interface Preparation {
  messages: Message[]; draft: string; title: string; pages: CreateFormPagePayload[];
  methodology: MethodologyMeta | null; projectId?: string;
}

const readPreparation = (key: string): Preparation | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Preparation | null;
    if (!value || !Array.isArray(value.messages) || !Array.isArray(value.pages) || typeof value.draft !== 'string' || typeof value.title !== 'string') return null;
    if (!value.messages.every((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string') || !value.pages.every((page) => Array.isArray(page.fields))) return null;
    return value;
  } catch { return null; }
};
const prompts = [
  { icon: InboxOutlined, title: 'Качество доставки', detail: 'NPS + CSAT', prompt: 'Создай опрос о качестве доставки для клиентов с вопросами NPS и CSAT' },
  { icon: TeamOutlined, title: 'Вовлечённость команды', detail: 'eNPS', prompt: 'Создай опрос вовлечённости сотрудников с вопросом eNPS' },
  { icon: CreditCardOutlined, title: 'Ценность тарифа', detail: 'NPS + CSAT', prompt: 'Создай опрос о ценности тарифа для клиентов с вопросами NPS и CSAT' },
  { icon: MessageOutlined, title: 'Работа поддержки', detail: 'CSAT', prompt: 'Создай опрос CSAT об удовлетворённости поддержкой после обращения' },
];

export const SurveyStartChat = ({ organizationId, projects, initialProjectId, initialPrompt, preparationId }: { organizationId: string; projects: SurveyProject[]; initialProjectId?: string; initialPrompt?: string; preparationId?: string }) => {
  const navigate = useNavigate();
  const { subscription, team, refresh } = useSubscription();
  const { user } = useAuth();
  const storageKey = `survey-creation:${user?.id}:${organizationId}:${initialProjectId ?? 'default'}${preparationId ? `:${preparationId}` : ''}`;
  const [restored] = useState(() => readPreparation(storageKey));
  const [messages, setMessages] = useState<Message[]>(restored?.messages ?? []);
  const [draft, setDraft] = useState(restored?.draft ?? initialPrompt ?? '');
  const [title, setTitle] = useState(restored?.title ?? 'Новый опрос');
  const [pages, setPages] = useState<CreateFormPagePayload[]>(restored?.pages ?? []);
  const [methodology, setMethodology] = useState<MethodologyMeta | null>(restored?.methodology ?? null);
  const [projectId, setProjectId] = useState<string | undefined>(restored?.projectId ?? initialProjectId);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingNavigation = useRef(false);
  useResearchUnsavedChanges(messages.length > 0 || draft.trim().length > 0, savingNavigation);
  const feed = useRef<HTMLDivElement>(null);
  const initialPromptHandled = useRef(false);
  const exhausted = getAiQuota(subscription, team).exhausted;
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ messages, draft, title, pages, methodology, projectId })); } catch { /* The unsaved-work guard still protects this session. */ }
  }, [storageKey, messages, draft, title, pages, methodology, projectId]);

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy || saving || exhausted) return;
    const history: Message[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setDraft('');
    setBusy(true);
    try {
      const result = await buildSurveyWithAi({
        messages: history.filter((m) => !m.error).map(({ role, content: message }) => ({ role, content: message })),
        title, pages, methodology_meta: methodology, organization_id: organizationId,
      });
      if (result.title) setTitle(result.title);
      if (result.pages) {
        setPages(result.pages.map((page, index) => ({ ...page, id: pages[index]?.id ?? crypto.randomUUID() })));
        setMethodology(result.methodology_meta);
      }
      setMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: billingErrorMessage(error) ?? 'Не удалось получить ответ ИИ. Попробуйте ещё раз.', error: true }]);
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [busy, saving, exhausted, messages, title, pages, methodology, organizationId, refresh]);

  useEffect(() => {
    if (!initialPrompt || initialPromptHandled.current || restored?.messages.length || exhausted) return;
    initialPromptHandled.current = true;
    void send(initialPrompt);
  }, [initialPrompt, restored, exhausted, send]);

  const save = async () => {
    if (!pages.length || busy || saving || savingNavigation.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const survey = await createSurvey(organizationId, { name: title.trim() || 'Новый опрос', pages, methodology_meta: methodology }, projectId);
      try { sessionStorage.setItem(`survey-preparation:${user?.id}:${organizationId}:${survey.id}`, JSON.stringify(messages.filter((message) => !message.error).map(({ role, content }) => ({ id: crypto.randomUUID(), role, content })))); sessionStorage.removeItem(storageKey); } catch { /* Editing also works when storage is unavailable. */ }
      savingNavigation.current = true;
      navigate(`/surveys/${survey.id}/edit`);
    } catch (error) {
      setSaveError(billingErrorMessage(error) ?? 'Не удалось сохранить опрос. Попробуйте ещё раз.');
    } finally { setSaving(false); }
  };

  return (
    <div className="survey-start">
      <section className="survey-start__chat" aria-label="Создание опроса с ИИ">
        <div className="survey-start__feed" ref={feed} aria-live="polite">
          {messages.length === 0 ? (
            <div className="survey-start__intro">
              <p className="survey-start__greeting">Привет!</p>
              <h1>Какой опрос создадим?</h1>
              <p>Опишите, что хотите выяснить, или выберите пример для начала.</p>
              <div className="survey-start__prompts">{prompts.map(({ icon: Icon, title: promptTitle, detail, prompt }) => <button key={prompt} type="button" onClick={() => void send(prompt)} disabled={busy || exhausted} aria-label={prompt}><span className="survey-start__prompt-icon"><Icon aria-hidden="true" /></span><strong>{promptTitle}</strong><small>{detail}</small></button>)}</div>
            </div>
          ) : messages.map((message, index) => (
            <div key={index} className={`survey-start__message survey-start__message--${message.role}${message.error ? ' survey-start__message--error' : ''}`}><div>{message.content}</div></div>
          ))}
          {busy && <div className="survey-start__working" role="status">Готовлю опрос…</div>}
        </div>
        <div className="survey-start__bottom">
          {exhausted && <Alert type="info" showIcon message="Лимит ИИ исчерпан" description="Вы можете сохранить готовый черновик или создать исследование вручную." />}
          <div className="survey-start__composer">
            <Input.TextArea aria-label="Сообщение ИИ" variant="borderless" value={draft} onChange={(event) => setDraft(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} placeholder="Опишите, какой опрос хотите провести" autoSize={{ minRows: 1, maxRows: 6 }} maxLength={4000} disabled={busy || saving || exhausted} />
            <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="Отправить" onClick={() => void send(draft)} disabled={!draft.trim() || busy || saving || exhausted} />
          </div>
          <AiModelSelect />
          <p>ИИ может ошибаться. Проверьте вопросы перед публикацией.</p>
        </div>
      </section>
      {pages.length > 0 && <aside className="survey-start__panel" aria-label="Черновик опроса">
        <div className="survey-start__panel-head"><span>ЧЕРНОВИК ОПРОСА</span><h2>{title}</h2><p>Проверьте вопросы или попросите ИИ их изменить.</p></div>
        <div className="survey-start__questions">{pages.map((page) => <section key={page.id}>{pages.length > 1 && <h3>{page.title}</h3>}<ol>{page.fields.map((field, index) => <li key={field.id ?? index}>{field.label || 'Вопрос без названия'}</li>)}</ol></section>)}</div>
        <div className="survey-start__save"><label htmlFor="survey-start-project">Проект</label><Select id="survey-start-project" value={projectId} onChange={setProjectId} allowClear placeholder="Мои опросы (по умолчанию)" options={projects.map((project) => ({ value: project.id, label: project.name }))} style={{ width: '100%' }} />{saveError && <Alert type="error" showIcon message={saveError} />}<Button type="primary" block size="large" loading={saving} disabled={busy} onClick={() => void save()}>Открыть черновик в конструкторе</Button></div>
      </aside>}
    </div>
  );
};
