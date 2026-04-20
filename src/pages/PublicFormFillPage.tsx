import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, InlineNotification, Loading } from '@carbon/react';
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
import type { Field, FieldOption, FormEntity } from '../types/form';
import type {
  FormFieldInstance,
  FormPageInstance,
} from '../shared/types/form-builder.types';
import { PreviewField } from '../shared/ui/form-builder/FormPreviewModal';
import { useFormStore, FormProvider } from '../shared/hooks/useFormStore';
import { loadPublicApplicantDraft } from '../shared/utils/publicApplicantDraft';

const collectFieldIds = (fields: FormFieldInstance[]): string[] => {
  const ids: string[] = [];
  for (const field of fields) {
    if (field.type === 'group' && field.children && field.children.length > 0) {
      ids.push(...collectFieldIds(field.children));
    } else {
      ids.push(field.id);
    }
  }
  return ids;
};

const collectLeafFields = (fields: FormFieldInstance[]): FormFieldInstance[] => {
  const result: FormFieldInstance[] = [];
  const walk = (inner: FormFieldInstance[]) => {
    for (const field of inner) {
      if (field.type === 'group' && field.children && field.children.length > 0) {
        walk(field.children);
      } else {
        result.push(field);
      }
    }
  };
  walk(fields);
  return result;
};

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
    formStore.resetFields();
    prefilledRef.current = false;
  }, [selectedForm?.id]);

  useEffect(() => {
    if (!draft?.draftDescription || !pageInstances.length || prefilledRef.current) return;
    const fieldId = findFirstTextFieldId(pageInstances);
    if (fieldId) {
      formStore.setFieldsValue({ [fieldId]: draft.draftDescription });
      prefilledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formStore is stable enough; avoid loop
  }, [draft, pageInstances]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextPage = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await formStore.validateFields(ids);
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

  const buildSnapshot = (
    formRow: PublicFormSummary,
    pages: FormPageInstance[],
  ): FormEntity => {
    const allLeaf: FormFieldInstance[] = [];
    for (const page of pages) {
      allLeaf.push(...collectLeafFields(page.fields));
    }
    const fields: Field[] = allLeaf.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options?.map<FieldOption>((opt) => ({
        id: opt.id,
        label: opt.label,
      })),
    }));
    return { id: formRow.id, title: formRow.name, fields };
  };

  const serializeOne = (val: unknown): unknown => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
      return val;
    if (typeof val === 'object' && val !== null) {
      if (
        'toISOString' in val &&
        typeof (val as Record<string, unknown>).toISOString === 'function'
      ) {
        return (val as { toISOString: () => string }).toISOString();
      }
      if (Array.isArray(val)) return val.map(serializeOne);
    }
    return val;
  };

  const handleSubmit = async () => {
    if (!token || !selectedForm || !draft) return;
    try {
      await formStore.validateFields();
      setIsSubmitting(true);

      const rawValues = formStore.getFieldsValue();
      const processed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawValues)) {
        processed[key] = serializeOne(val);
      }

      const snapshot = buildSnapshot(selectedForm, pageInstances);
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
          background: 'var(--cds-background)',
        }}
      >
        <Loading withOverlay={false} />
      </div>
    );
  }

  if (error || !pageData || !selectedForm) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <InlineNotification
          kind="error"
          title="Ошибка"
          subtitle={error || 'Форма не найдена'}
          lowContrast
          hideCloseButton
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
          background: 'var(--cds-background)',
        }}
      >
        <InlineNotification
          kind="success"
          title="Заявка отправлена"
          subtitle="Ваша заявка была успешно создана. Спасибо!"
          lowContrast
          hideCloseButton
          style={{ maxWidth: 480 }}
        />
      </div>
    );
  }

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
              <InlineNotification
                kind={notification.kind}
                title={notification.title}
                subtitle={notification.subtitle}
                lowContrast
                onCloseButtonClick={() => setNotification(null)}
              />
            </div>
          )}

          {hasPages && currentPage && currentPage.fields.length > 0 ? (
            <FormProvider store={formStore}>
              {pageInstances.length > 1 && (
                <p
                  style={{
                    color: 'var(--cds-text-secondary)',
                    fontSize: '0.75rem',
                    marginBottom: 12,
                  }}
                >
                  Страница {pageIndex + 1} из {pageInstances.length} — {currentPage.title}
                </p>
              )}

              {currentPage.fields.map((field) => (
                <PreviewField key={field.id} field={field} />
              ))}

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <Button kind="secondary" size="md" onClick={handlePrevPage}>
                  Назад
                </Button>
                {!isLast && (
                  <Button kind="primary" size="md" onClick={handleNextPage}>
                    Далее
                  </Button>
                )}
                {isLast && (
                  <Button
                    kind="primary"
                    size="md"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Отправка…' : 'Отправить заявку'}
                  </Button>
                )}
              </div>
            </FormProvider>
          ) : (
            <p style={{ color: 'var(--cds-text-secondary)' }}>
              У выбранной формы нет полей.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
