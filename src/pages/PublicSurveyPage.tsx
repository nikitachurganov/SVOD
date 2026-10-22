import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Result, Spin } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { useParams } from 'react-router-dom';

import {
  PublicSurveyError,
  getPublicSurvey,
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

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; survey: PublicSurvey }
  | { status: 'error'; error: PublicSurveyError };

export const PublicSurveyPage = () => {
  const { token } = useParams<{ token: string }>();
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
    if (!token) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicSurvey(token)
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
  }, [token]);

  const survey = state.status === 'ready' ? state.survey : null;

  const pages = useMemo(
    () =>
      survey
        ? pagesPayloadToInstances(survey.pages).filter((page) => page.fields.length > 0)
        : [],
    [survey],
  );

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
    if (!token) return;
    setSubmitError(null);
    try {
      await fillRef.current?.validateFields();
    } catch {
      scrollToTop();
      return;
    }

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
  }, [token, pages]);

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
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-form-flow public-form-flow--centered public-form-flow--fade-in">
        <Result
          icon={<CheckCircleFilled style={{ color: 'var(--app-success)', fontSize: 64 }} />}
          title="Спасибо за участие!"
          subTitle="Ваши ответы сохранены. Это окно можно закрыть."
        />
      </div>
    );
  }

  const actions = (
    <div className="public-form-flow__submit-bar">
      {!isFirst && <Button onClick={handlePrev}>Назад</Button>}
      {isLast ? (
        <Button type="primary" onClick={() => void handleSubmit()} loading={submitting}>
          {submitting ? 'Отправка…' : 'Отправить ответы'}
        </Button>
      ) : (
        <Button type="primary" onClick={() => void handleNext()}>
          Далее
        </Button>
      )}
    </div>
  );

  return (
    <div className="public-form-flow public-form-flow--fill">
      <div className="public-form-flow__fill-main">
        <FormFillWizardLayout
          contentRef={contentRef}
          pageIndex={pageIndex}
          pageCount={pages.length}
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
          {survey?.description && (
            <p style={{ color: 'var(--app-text-secondary)' }}>{survey.description}</p>
          )}
          {survey?.organization_name && (
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
      </div>
    </div>
  );
};
