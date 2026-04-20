import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Button,
  InlineNotification,
  InlineLoading,
  Loading,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPublicPageData,
  suggestPublicForms,
  type PublicPageData,
  type PublicPopularFormSummary,
  type PublicSuggestedFormCard,
} from '../shared/api/public.api';
import {
  countWords,
  savePublicApplicantDraft,
  type PublicApplicantDraft,
} from '../shared/utils/publicApplicantDraft';

const DEBOUNCE_MS = 3000;
const UNIVERSAL_CHARS = 50;

interface MetaErrors {
  fullName?: string;
  company?: string;
  contact?: string;
}

const FormChoiceCard = ({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) => (
  <Tile
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
    style={{
      cursor: 'pointer',
      padding: '1rem',
      marginBottom: 8,
      border: '1px solid var(--cds-border-subtle)',
      borderRadius: 4,
      background: 'var(--cds-layer-01)',
    }}
  >
    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>{title}</div>
    <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.35 }}>
      {subtitle}
    </div>
  </Tile>
);

export const PublicFormLandingPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [pageData, setPageData] = useState<PublicPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [metaErrors, setMetaErrors] = useState<MetaErrors>({});

  const [debounceBusy, setDebounceBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [aiForms, setAiForms] = useState<PublicSuggestedFormCard[]>([]);
  const [aiHint, setAiHint] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicPageData(token)
      .then((data) => {
        setPageData(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const text = taskDescription;
    if (!token) return;

    if (!text.trim()) {
      setDebounceBusy(false);
      setFetchBusy(false);
      setAiForms([]);
      setAiHint(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    setDebounceBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = window.setTimeout(async () => {
      setDebounceBusy(false);
      const words = countWords(text);
      if (words < 3) {
        setAiHint('Опишите задачу подробнее');
        setAiForms([]);
        return;
      }

      setAiHint(null);
      setFetchBusy(true);
      try {
        const res = await suggestPublicForms(token, text, controller.signal);
        if (!controller.signal.aborted) {
          setAiForms(res.forms ?? []);
          setAiHint(res.hint ?? null);
        }
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('abort') && !msg.includes('canceled')) {
          setAiForms([]);
          setAiHint(null);
        }
      } finally {
        if (!controller.signal.aborted) setFetchBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [taskDescription, token]);

  const showPopular = taskDescription.trim().length === 0;
  const showSpinner =
    taskDescription.trim().length >= 1 && (debounceBusy || fetchBusy);
  const words = useMemo(() => countWords(taskDescription), [taskDescription]);
  const showAiNoMatch =
    !showSpinner &&
    taskDescription.trim().length > 0 &&
    words >= 3 &&
    aiForms.length === 0 &&
    !aiHint;

  const showUniversalCta =
    showAiNoMatch &&
    taskDescription.trim().length >= UNIVERSAL_CHARS &&
    Boolean(pageData?.universal_form_id);

  const validateContact = (): boolean => {
    const newErrors: MetaErrors = {};
    if (!fullName.trim()) newErrors.fullName = 'Укажите ФИО';
    if (!company.trim()) newErrors.company = 'Укажите филиал или компанию';
    const hasEmail = email.trim().length > 0;
    const hasPhone = phone.trim().length > 0;
    if (!hasEmail && !hasPhone) {
      newErrors.contact = 'Укажите телефон или email';
    } else if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.contact = 'Некорректный email';
    }
    setMetaErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goToFill = useCallback(
    (formId: string) => {
      if (!token || !validateContact()) return;
      const draft: PublicApplicantDraft = {
        fullName: fullName.trim(),
        company: company.trim(),
        email: email.trim(),
        phone: phone.trim(),
        draftDescription: taskDescription.trim(),
      };
      savePublicApplicantDraft(token, draft);
      navigate(`/form/${token}/fill/${formId}`);
    },
    [token, fullName, company, email, phone, taskDescription, navigate],
  );

  const goToUniversal = useCallback(() => {
    const id = pageData?.universal_form_id;
    if (id) goToFill(id);
  }, [pageData?.universal_form_id, goToFill]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--cds-background)',
        }}
      >
        <Loading withOverlay={false} />
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <InlineNotification
          kind="error"
          title="Ссылка недействительна"
          subtitle={error || 'Не удалось загрузить данные'}
          lowContrast
          hideCloseButton
        />
      </div>
    );
  }

  const popularForms = pageData.popular_forms ?? [];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--cds-background)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          height: '3rem',
          display: 'flex',
          alignItems: 'center',
          paddingInline: '1rem',
          background: 'var(--cds-layer-01)',
          borderBottom: '1px solid var(--cds-border-subtle)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
          {pageData.organization_name} — Подать заявку
        </span>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {pageData.organization_description && (
            <p
              style={{
                color: 'var(--cds-text-secondary)',
                marginBottom: 24,
                fontSize: '0.875rem',
              }}
            >
              {pageData.organization_description}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextInput
              id="pub-fullName"
              labelText="ФИО"
              placeholder="Иванов Иван Иванович"
              value={fullName}
              invalid={!!metaErrors.fullName}
              invalidText={metaErrors.fullName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setFullName(e.target.value);
                setMetaErrors((p) => ({ ...p, fullName: undefined }));
              }}
            />
            <TextInput
              id="pub-company"
              labelText="Филиал / компания"
              placeholder="Название филиала или компании"
              value={company}
              invalid={!!metaErrors.company}
              invalidText={metaErrors.company}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setCompany(e.target.value);
                setMetaErrors((p) => ({ ...p, company: undefined }));
              }}
            />
            <TextInput
              id="pub-email"
              labelText="Email"
              placeholder="example@mail.com"
              value={email}
              invalid={!!metaErrors.contact}
              invalidText={metaErrors.contact}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setEmail(e.target.value);
                setMetaErrors((p) => ({ ...p, contact: undefined }));
              }}
            />
            <TextInput
              id="pub-phone"
              labelText="Телефон"
              placeholder="+7 (999) 123-45-67"
              value={phone}
              invalid={!!metaErrors.contact}
              invalidText={metaErrors.contact}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setPhone(e.target.value);
                setMetaErrors((p) => ({ ...p, contact: undefined }));
              }}
            />

            <TextArea
              id="pub-task"
              labelText="Кратко опишите задачу"
              placeholder="Например: нужен баннер 2×3 м для новой точки в Екатеринбурге…"
              value={taskDescription}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setTaskDescription(e.target.value)
              }
              rows={4}
              enableCounter
              maxCount={4000}
            />

            {showPopular && popularForms.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12 }}>
                  Популярные типы заявок
                </p>
                {popularForms.map((f: PublicPopularFormSummary) => (
                  <FormChoiceCard
                    key={f.id}
                    title={f.name}
                    subtitle={f.short_description}
                    onClick={() => goToFill(f.id)}
                  />
                ))}
              </div>
            )}

            {showSpinner && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 8,
                  color: 'var(--cds-text-secondary)',
                  fontSize: '0.875rem',
                }}
                aria-busy="true"
              >
                <InlineLoading description="Анализируем ваш запрос…" />
              </div>
            )}

            {aiHint && !showSpinner && (
              <InlineNotification
                kind="info"
                title=""
                subtitle={aiHint}
                lowContrast
                hideCloseButton
              />
            )}

            {!showPopular && aiForms.length > 0 && !showSpinner && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12 }}>
                  Подходящие типы заявок
                </p>
                {aiForms.map((f) => (
                  <FormChoiceCard
                    key={f.id}
                    title={f.name}
                    subtitle={f.short_description}
                    onClick={() => goToFill(f.id)}
                  />
                ))}
              </div>
            )}

            {showAiNoMatch && (
              <InlineNotification
                kind="warning"
                title=""
                subtitle="Не удалось определить тип задачи. Пожалуйста, добавьте больше деталей"
                lowContrast
                hideCloseButton
              />
            )}

            {showUniversalCta && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: '0.875rem', marginBottom: 8, color: 'var(--cds-text-secondary)' }}>
                  Можно заполнить универсальную форму заявки — опишите задачу в свободной форме и
                  прикрепите файлы.
                </p>
                <Button kind="tertiary" onClick={goToUniversal}>
                  Заполнить универсальную форму
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
