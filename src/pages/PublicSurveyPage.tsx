import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Result, Spin, Tag } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';

import {
  PublicSurveyError,
  getPublicSurvey,
  getSurveyById,
  submitPublicSurvey,
  type PublicSurvey,
} from '../shared/api/surveys.api';
import { pagesPayloadToInstances } from '../shared/api/forms.api';
import { collectFieldIds, collectLeafFields } from '../shared/formily/collectFieldIds';
import { serializeFormValuesWithFields } from '../shared/formily/formSubmit.utils';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../shared/ui/form-fill/FormFillRenderer';
import { FormFillWizardLayout } from '../shared/ui/form-fill/FormFillWizardLayout';
import { useFormStore } from '../shared/hooks/useFormStore';
import { LEGAL } from '../shared/config/legal';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; survey: PublicSurvey }
  | { status: 'error'; error: PublicSurveyError };

interface PublicSurveyPageProps {
  /**
   * Preview for the survey's author: the form is taken from the survey itself (open, stopped or
   * draft alike) and nothing is ever sent — no response is created, the statistics stay as is.
   */
  preview?: boolean;
}

export const PublicSurveyPage = ({ preview = false }: PublicSurveyPageProps) => {
  const { token, id: surveyId } = useParams<{ token: string; id: string }>();
  const navigate = useNavigate();
  const source = preview ? surveyId : token;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pageIndex, setPageIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const formStore = useFormStore();
  const fillRef = useRef<FormFillRendererHandle>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setState({ status: 'loading' });
    const load: Promise<PublicSurvey> = preview
      ? getSurveyById(source).then((detail) => ({
          name: detail.name,
          description: detail.description,
          pages: detail.pages,
          organization_name: null,
          anonymous: detail.anonymous,
        }))
      : getPublicSurvey(source);
    load
      .then((survey) => {
        if (cancelled) return;
        startedAtRef.current = Date.now();
        setState({ status: 'ready', survey });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error:
            err instanceof PublicSurveyError
              ? err
              : new PublicSurveyError('unknown', 'Не удалось загрузить опрос.'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [source, preview]);

  const survey = state.status === 'ready' ? state.survey : null;

  const pages = useMemo(
    () =>
      survey
        ? pagesPayloadToInstances(survey.pages).filter((page) => page.fields.length > 0)
        : [],
    [survey],
  );

  // A first page made only of text blocks is the greeting: it is not numbered in the progress line
  const hasWelcomePage = pages[0]?.fields.every((field) => field.type === 'textBlock') ?? false;
  const welcomeOffset = hasWelcomePage ? 1 : 0;

  const currentPage = pages[Math.min(pageIndex, Math.max(pages.length - 1, 0))];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex >= pages.length - 1;

  useEffect(() => {
    if (survey) document.title = survey.name;
  }, [survey]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = async () => {
    if (!currentPage) return;
    try {
      await fillRef.current?.validateFields(collectFieldIds(currentPage.fields));
      setPageIndex((idx) => Math.min(idx + 1, pages.length - 1));
      scrollToTop();
    } catch {
      // inline validation errors
    }
  };

  const handlePrev = () => {
    setPageIndex((idx) => Math.max(0, idx - 1));
    scrollToTop();
  };

  const handleSubmit = useCallback(async () => {
    if (!token && !preview) return;
    setSubmitError(null);
    try {
      await fillRef.current?.validateFields();
    } catch {
      scrollToTop();
      return;
    }

    if (preview) {
      // The author only looks at the form: validation ran, but nothing is sent or stored
      setSubmitted(true);
      return;
    }
    if (!token) return;

    setSubmitting(true);
    try {
      const raw = fillRef.current?.getFieldsValue() ?? {};
      const leaves = pages.flatMap((page) => collectLeafFields(page.fields));
      const answers = serializeFormValuesWithFields(raw, leaves);
      await submitPublicSurvey(token, {
        answers,
        duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof PublicSurveyError ? err.message : 'Не удалось отправить ответы.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [token, preview, pages]);

  const previewBar = preview ? (
    <div className="survey-preview-bar" role="status">
      <span>
        <Tag color="blue" style={{ marginInlineEnd: 8 }}>
          Предпросмотр
        </Tag>
        Так форму увидит респондент. Ответы не сохраняются и не попадают в статистику.
      </span>
      <Button onClick={() => navigate(`/surveys/${surveyId}/form`)}>Вернуться к опросу</Button>
    </div>
  ) : null;

  if (state.status === 'loading') {
    return (
      <div className="public-form-flow public-form-flow--centered">
        <Spin size="large" tip="Загрузка опроса…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="public-form-flow public-form-flow--centered">
        <Result
          status={state.error.code === 'closed' ? 'info' : 'warning'}
          title={state.error.code === 'closed' ? 'Опрос завершён' : 'Опрос недоступен'}
          subTitle={state.error.message}
          extra={
            preview ? (
              <Button onClick={() => navigate(`/surveys/${surveyId}/form`)}>Вернуться к опросу</Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-form-flow">
        {previewBar}
        <div className="public-form-flow--centered public-form-flow--fade-in" style={{ flex: 1 }}>
          {preview ? (
            <Result
              icon={<CheckCircleFilled style={{ color: 'var(--app-success)', fontSize: 64 }} />}
              title="Так выглядит завершение опроса"
              subTitle="Это предпросмотр: ответ не сохранён, статистика не изменилась."
              extra={
                <Button type="primary" onClick={() => navigate(`/surveys/${surveyId}/form`)}>
                  Вернуться к опросу
                </Button>
              }
            />
          ) : (
            <Result
              icon={<CheckCircleFilled style={{ color: 'var(--app-success)', fontSize: 64 }} />}
              title="Спасибо за участие!"
              subTitle="Ваши ответы сохранены. Это окно можно закрыть."
            />
          )}
        </div>
      </div>
    );
  }

  const actions = (
    <div className="public-form-flow__submit-bar">
      {!isFirst && (
        <Button size="large" onClick={handlePrev}>
          Назад
        </Button>
      )}
      {isLast ? (
        <Button size="large" type="primary" onClick={() => void handleSubmit()} loading={submitting}>
          {submitting ? 'Отправка…' : 'Отправить ответы'}
        </Button>
      ) : (
        <Button size="large" type="primary" onClick={() => void handleNext()}>
          Далее
        </Button>
      )}
    </div>
  );

  return (
    <div className="public-form-flow public-form-flow--fill">
      {previewBar}
      <div className="public-form-flow__fill-main">
        <FormFillWizardLayout
          contentRef={contentRef}
          pageIndex={pageIndex - welcomeOffset}
          pageCount={pages.length - welcomeOffset}
          pageTitle={currentPage?.title}
          notification={
            submitError ? (
              <Alert
                type="error"
                message="Ошибка отправки"
                description={submitError}
                closable
                onClose={() => setSubmitError(null)}
                style={{ marginBottom: 16 }}
              />
            ) : null
          }
          actions={pages.length > 0 ? actions : undefined}
        >
          <h1 className="public-form-flow__form-title">{survey?.name}</h1>
          {isFirst && survey?.description && (
            <p style={{ color: 'var(--app-text-secondary)' }}>{survey.description}</p>
          )}
          {isFirst && survey?.organization_name && (
            <p style={{ color: 'var(--app-text-secondary)', fontSize: 13 }}>
              {survey.organization_name}
            </p>
          )}

          {pages.length > 0 ? (
            <FormFillRenderer
              ref={fillRef}
              pages={pages}
              pageIndex={Math.min(pageIndex, pages.length - 1)}
              legacyStore={formStore}
            />
          ) : (
            <p style={{ color: 'var(--app-text-secondary)' }}>В этом опросе пока нет вопросов.</p>
          )}
        </FormFillWizardLayout>
        <footer
          style={{
            marginTop: 20,
            marginBottom: 20,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--app-text-tertiary, #8c8c8c)',
          }}
        >
          <span>Платформа {LEGAL.serviceName}. Сервис предоставляет техническую инфраструктуру и не является организатором опроса.{' '}</span>
          <a
            href={`mailto:${LEGAL.email}?subject=Жалоба на опрос`}
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            Пожаловаться на опрос
          </a>
        </footer>
      </div>
    </div>
  );
};
