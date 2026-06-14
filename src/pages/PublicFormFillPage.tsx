import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  getPublicPageData,
  submitPublicRequest,
  type PublicFormSummary,
} from '../shared/api/public.api';
import {
  pagesPayloadToInstances,
  type CreateFormPagePayload,
} from '../shared/api/forms.api';
import { mapDataToSnapshot } from '../shared/utils/mapDataToSnapshot';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { collectFieldIds, collectLeafFields } from '../shared/formily/collectFieldIds';
import {
  buildFormSnapshot,
  serializeFormValues,
} from '../shared/formily/formSubmit.utils';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../shared/ui/form-fill/FormFillRenderer';
import { useFormStore } from '../shared/hooks/useFormStore';
import { loadPublicApplicantDraft } from '../shared/utils/publicApplicantDraft';

/** First text-like field across pages — used to pre-fill draft description for universal flows. */
const findFirstTextFieldId = (pages: FormPageInstance[]): string | null => {
  for (const page of pages) {
    const leaves = collectLeafFields(page.fields);
    const hit = leaves.find((f) => f.type === 'shortText' || f.type === 'longText');
    if (hit) return hit.id;
  }
  return null;
};

export const PublicFormFillPage = () => {
  const { token, formId } = useParams<{ token: string; formId: string }>();
  const navigate = useNavigate();

  const draft = token ? loadPublicApplicantDraft(token) : null;

  const [pageData, setPageData] = useState<Awaited<
    ReturnType<typeof getPublicPageData>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    kind: 'success' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);

  const formStore = useFormStore();
  const fillRef = useRef<FormFillRendererHandle>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'fill' | 'done'>('fill');
  const contentRef = useRef<HTMLDivElement | null>(null);
  const prefilledRef = useRef(false);

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

  const selectedForm: PublicFormSummary | undefined = useMemo(
    () => pageData?.forms.find((f) => f.id === formId),
    [pageData, formId],
  );

  const pageInstances: FormPageInstance[] = useMemo(
    () =>
      selectedForm
        ? pagesPayloadToInstances(selectedForm.pages as CreateFormPagePayload[])
        : [],
    [selectedForm],
  );

  const hasPages = pageInstances.length > 0;
  const currentPage = hasPages
    ? pageInstances[Math.min(pageIndex, pageInstances.length - 1)]
    : null;
  const isFirst = pageIndex === 0;
  const isLast = hasPages && pageIndex === pageInstances.length - 1;

  useEffect(() => {
    setPageIndex(0);
    fillRef.current?.resetFields();
    prefilledRef.current = false;
  }, [selectedForm?.id]);

  useEffect(() => {
    if (!draft?.draftDescription || !pageInstances.length || prefilledRef.current) return;
    const fieldId = findFirstTextFieldId(pageInstances);
    if (fieldId) {
      fillRef.current?.setFieldsValue({ [fieldId]: draft.draftDescription });
      prefilledRef.current = true;
    }
  }, [draft?.draftDescription, pageInstances]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextPage = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await fillRef.current?.validateFields(ids);
      setPageIndex((idx) => Math.min(idx + 1, pageInstances.length - 1));
      scrollToTop();
    } catch {
      // inline errors
    }
  };

  const handlePrevPage = () => {
    if (isFirst) {
      if (token) navigate(`/form/${token}`);
      return;
    }
    setPageIndex((idx) => Math.max(0, idx - 1));
    scrollToTop();
  };

  const handleSubmit = async () => {
    if (!token || !selectedForm || !draft) return;
    try {
      await fillRef.current?.validateFields();
      setIsSubmitting(true);

      const rawValues = fillRef.current?.getFieldsValue() ?? {};
      const processed = serializeFormValues(rawValues);

      const snapshot = buildFormSnapshot(selectedForm, pageInstances);
      const alignedData = mapDataToSnapshot(processed, snapshot);

      const titleBase =
        draft.draftDescription.trim().slice(0, 120) ||
        selectedForm.name ||
        'Заявка';

      await submitPublicRequest(token, {
        full_name: draft.fullName,
        applicant_company: draft.company,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        form_id: selectedForm.id,
        title: titleBase.slice(0, 500),
        data: alignedData,
        form_snapshot: snapshot,
      });

      setStep('done');
    } catch (err) {
      if (err instanceof Error && !('errorFields' in err)) {
        setNotification({
          kind: 'error',
          title: 'Ошибка отправки',
          subtitle: err.message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token || !formId) {
    return null;
  }

  if (!draft) {
    return <Navigate to={`/form/${token}`} replace />;
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--app-bg)',
        }}
      >
        <Spin />
      </div>
    );
  }

  if (error || !pageData || !selectedForm) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <Alert
          type="error"
          message="Ошибка"
          description={error || 'Форма не найдена'}
          showIcon
        />
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          background: 'var(--app-bg)',
        }}
      >
        <Alert
          type="success"
          message="Заявка отправлена"
          description="Ваша заявка была успешно создана. Спасибо!"
          showIcon
          style={{ maxWidth: 480 }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg)',
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
          background: 'var(--app-surface)',
          borderBottom: '1px solid var(--app-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
          {pageData.organization_name} — {selectedForm.name}
        </span>
      </header>

      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {notification && (
            <div style={{ marginBottom: 16 }}>
              <Alert
                type={notification.kind}
                message={notification.title}
                description={notification.subtitle}
                closable
                onClose={() => setNotification(null)}
              />
            </div>
          )}

          {hasPages && currentPage && currentPage.fields.length > 0 ? (
            <>
              {pageInstances.length > 1 && (
                <p
                  style={{
                    color: 'var(--app-text-secondary)',
                    fontSize: '0.75rem',
                    marginBottom: 12,
                  }}
                >
                  Страница {pageIndex + 1} из {pageInstances.length} — {currentPage.title}
                </p>
              )}

              <FormFillRenderer
                ref={fillRef}
                pages={pageInstances}
                pageIndex={pageIndex}
                legacyStore={formStore}
              />

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <Button onClick={handlePrevPage}>
                  Назад
                </Button>
                {!isLast && (
                  <Button type="primary" onClick={handleNextPage}>
                    Далее
                  </Button>
                )}
                {isLast && (
                  <Button
                    type="primary"
                    onClick={handleSubmit}
                    loading={isSubmitting}
                  >
                    {isSubmitting ? 'Отправка…' : 'Отправить заявку'}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--app-text-secondary)' }}>
              У выбранной формы нет полей.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
