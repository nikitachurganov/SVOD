import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Result, Tag } from 'antd';
import { CheckCircleFilled, CloseOutlined } from '../shared/ui/materialIcons';
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
import { FormTextBlock } from '../shared/formily/components/FormTextBlock';
import { pruneAnswers, surveyPath } from '../shared/survey-logic/surveyLogic';
import { useSurveyNavigation } from '../shared/survey-logic/useSurveyNavigation';
import { LEGAL } from '../shared/config/legal';
import { PublicFormSkeleton } from '../shared/ui/skeletons/PageSkeletons';

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
  /** Preview inside a modal: the survey is given directly and "back" closes the modal instead of navigating */
  surveyId?: string;
  onClose?: () => void;
}

export const PublicSurveyPage = ({
  preview = false,
  surveyId: surveyIdProp,
  onClose,
}: PublicSurveyPageProps) => {
  const { token, id: routeSurveyId } = useParams<{ token: string; id: string }>();
  const surveyId = surveyIdProp ?? routeSurveyId;
  const navigate = useNavigate();
  const goBack = () => (onClose ? onClose() : navigate(`/surveys/${surveyId}/form`));
  const source = preview ? surveyId : token;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** Ending screen chosen by a jump; null shows the default thanks */
  const [endingIndex, setEndingIndex] = useState<number | null>(null);

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

  // All pages, empty and ending ones included: jumps refer to pages by id, and the navigation
  // passes empty pages through and shows ending screens only after sending
  const pages = useMemo(() => (survey ? pagesPayloadToInstances(survey.pages) : []), [survey]);
  const nav = useSurveyNavigation(pages);
  const hasQuestions = nav.current >= 0;

  // A first page made only of text blocks is the greeting: it is not numbered in the progress line
  const firstShown = surveyPath(pages, {}).pages[0];
  const hasWelcomePage =
    firstShown !== undefined &&
    pages[firstShown].fields.every((field) => field.type === 'textBlock');
  const welcomeOffset = hasWelcomePage ? 1 : 0;

  const currentPage = hasQuestions ? pages[nav.current] : undefined;
  const isFirst = nav.isFirst;
  const isLast = nav.isLast;

  useEffect(() => {
    if (survey && !onClose) document.title = survey.name;
  }, [survey, onClose]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = async () => {
    if (!currentPage) return;
    try {
      // The author only looks through the pages: nothing has to be filled in to go on
      if (!preview) await fillRef.current?.validateFields(collectFieldIds(currentPage.fields));
    } catch {
      return; // inline validation errors
    }
    const step = nav.goNext(fillRef.current?.getFieldsValue() ?? {});
    // The answer just given ends the survey (the button had no time to change): send right away
    if (step.kind === 'end') {
      void handleSubmit();
      return;
    }
    scrollToTop();
  };

  const handlePrev = () => {
    nav.goBack();
    scrollToTop();
  };

  const handleSubmit = useCallback(async () => {
    if (!token && !preview) return;
    setSubmitError(null);
    const raw = fillRef.current?.getFieldsValue() ?? {};
    const path = surveyPath(pages, raw);
    if (preview) {
      // The author only looks at the form: nothing is validated, sent or stored
      setEndingIndex(path.ending);
      setSubmitted(true);
      return;
    }
    try {
      // Only the pages on the respondent's path: required questions of other branches stay empty
      await fillRef.current?.validateFields(
        path.pages.flatMap((index) => collectFieldIds(pages[index].fields)),
      );
    } catch {
      scrollToTop();
      return;
    }

    if (!token) return;

    setSubmitting(true);
    try {
      const leaves = pages.flatMap((page) => collectLeafFields(page.fields));
      // Answers left on a branch the respondent turned away from are not sent
      const answers = pruneAnswers(pages, raw, serializeFormValuesWithFields(raw, leaves));
      await submitPublicSurvey(token, {
        answers,
        duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
      });
      setEndingIndex(path.ending);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof PublicSurveyError ? err.message : 'Не удалось отправить ответы.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [token, preview, pages]);

  const previewBar = preview && onClose ? (
    <div className="survey-preview-bar" role="status">
      <strong style={{ fontSize: 16 }}>Предпросмотр</strong>
      <Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Закрыть предпросмотр" />
    </div>
  ) : preview ? (
    <div className="survey-preview-bar" role="status">
      <span>
        <Tag color="blue" style={{ marginInlineEnd: 8 }}>
          Предпросмотр
        </Tag>
        Так форму увидит респондент. Ответы не сохраняются и не попадают в статистику.
      </span>
      <Button onClick={goBack}>{onClose ? 'Закрыть' : 'Вернуться к опросу'}</Button>
    </div>
  ) : null;

  if (state.status === 'loading') {
    return <PublicFormSkeleton embedded={!!onClose} />;
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
              <Button onClick={goBack}>{onClose ? 'Закрыть' : 'Вернуться к опросу'}</Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const endingPage = endingIndex !== null ? pages[endingIndex] : undefined;
  const endingBlocks = endingPage?.fields.filter((field) => field.type === 'textBlock') ?? [];

  if (submitted && endingBlocks.length > 0) {
    // Ending screen of the branch: the author's own text instead of the default thanks
    return (
      <div className="public-form-flow">
        {previewBar}
        <div className="public-form-flow--centered public-form-flow--fade-in" style={{ flex: 1 }}>
          <div style={{ maxWidth: 560, width: '100%', padding: '0 16px', textAlign: 'center' }}>
            <CheckCircleFilled style={{ color: 'var(--app-success)', fontSize: 56, marginBottom: 16 }} />
            {endingBlocks.map((block) => (
              <FormTextBlock key={block.id} title={block.label} text={block.description} />
            ))}
            {preview && (
              <p style={{ color: 'var(--app-text-secondary)', fontSize: 13, marginTop: 16 }}>
                Это предпросмотр: ответ не сохранён, статистика не изменилась.
              </p>
            )}
            {preview && (
              <Button type="primary" onClick={goBack} style={{ marginTop: 8 }}>
                {onClose ? 'Закрыть' : 'Вернуться к опросу'}
              </Button>
            )}
          </div>
        </div>
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
                <Button type="primary" onClick={goBack}>
                  {onClose ? 'Закрыть' : 'Вернуться к опросу'}
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
          pageIndex={nav.position - welcomeOffset}
          pageCount={nav.total - welcomeOffset}
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
          actions={hasQuestions ? actions : undefined}
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

          {hasQuestions ? (
            <FormFillRenderer
              ref={fillRef}
              pages={pages}
              pageIndex={nav.current}
              legacyStore={formStore}
              onValuesChange={nav.onValuesChange}
            />
          ) : (
            <p style={{ color: 'var(--app-text-secondary)' }}>В этом опросе пока нет вопросов.</p>
          )}
        </FormFillWizardLayout>
        {!onClose && <footer
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
        </footer>}
      </div>
    </div>
  );
};
