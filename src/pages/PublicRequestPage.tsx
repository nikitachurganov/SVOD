import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ComboBox,
  InlineNotification,
  Loading,
  TextInput,
} from '@carbon/react';
import { useParams } from 'react-router-dom';
import {
  getPublicPageData,
  submitPublicRequest,
  type PublicFormSummary,
  type PublicPageData,
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

interface MetaErrors {
  fullName?: string;
  email?: string;
  title?: string;
  formId?: string;
}

export const PublicRequestPage = () => {
  const { token } = useParams<{ token: string }>();

  const [pageData, setPageData] = useState<PublicPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formStore = useFormStore();
  const [step, setStep] = useState<'meta' | 'fill' | 'done'>('meta');
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [requestTitle, setRequestTitle] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metaErrors, setMetaErrors] = useState<MetaErrors>({});
  const [notification, setNotification] = useState<{
    kind: 'success' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicPageData(token)
      .then((data) => {
        setPageData(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить данные',
        );
      })
      .finally(() => setLoading(false));
  }, [token]);

  const selectedForm: PublicFormSummary | undefined = useMemo(
    () => pageData?.forms.find((f) => f.id === selectedFormId),
    [pageData, selectedFormId],
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
  }, [selectedForm]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateMeta = (): boolean => {
    const newErrors: MetaErrors = {};
    if (!fullName.trim()) newErrors.fullName = 'Укажите ФИО';
    if (!email.trim()) newErrors.email = 'Укажите email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Некорректный email';
    if (!requestTitle.trim()) newErrors.title = 'Введите название заявки';
    if (!selectedFormId) newErrors.formId = 'Выберите форму';
    setMetaErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
    if (!token || !selectedForm) return;
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

      await submitPublicRequest(token, {
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        form_id: selectedForm.id,
        title: requestTitle.trim(),
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

  const comboItems = (pageData?.forms ?? []).map((f) => ({
    id: f.id,
    text: f.name,
  }));

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--cds-background, #f4f4f4)',
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
          background: 'var(--cds-background, #f4f4f4)',
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
        background: 'var(--cds-background, #f4f4f4)',
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
          background: 'var(--cds-layer-01, #fff)',
          borderBottom: '1px solid var(--cds-border-subtle)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
          {pageData.organization_name} — Подать заявку
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

          {step === 'meta' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
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
                id="pub-email"
                labelText="Email"
                placeholder="example@mail.com"
                value={email}
                invalid={!!metaErrors.email}
                invalidText={metaErrors.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEmail(e.target.value);
                  setMetaErrors((p) => ({ ...p, email: undefined }));
                }}
              />
              <TextInput
                id="pub-phone"
                labelText="Телефон (необязательно)"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPhone(e.target.value)
                }
              />
              <TextInput
                id="pub-title"
                labelText="Название заявки"
                placeholder="Например: Заявка на доступ"
                value={requestTitle}
                invalid={!!metaErrors.title}
                invalidText={metaErrors.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setRequestTitle(e.target.value);
                  setMetaErrors((p) => ({ ...p, title: undefined }));
                }}
              />
              <ComboBox
                id="pub-formId"
                titleText="Форма"
                placeholder="Выберите форму"
                items={comboItems}
                itemToString={(
                  item: { id: string; text: string } | null,
                ) => item?.text ?? ''}
                selectedItem={
                  comboItems.find((i) => i.id === selectedFormId) ?? null
                }
                invalid={!!metaErrors.formId}
                invalidText={metaErrors.formId}
                onChange={(data) => {
                  setSelectedFormId(data.selectedItem?.id);
                  setMetaErrors((p) => ({ ...p, formId: undefined }));
                }}
              />

              <Button
                kind="primary"
                size="md"
                onClick={() => {
                  if (validateMeta()) setStep('fill');
                }}
                style={{ marginTop: 8 }}
              >
                Далее
              </Button>
            </div>
          )}

          {step === 'fill' && selectedForm && (
            <>
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
                      Страница {pageIndex + 1} из {pageInstances.length} —{' '}
                      {currentPage.title}
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
                    <Button
                      kind="secondary"
                      size="md"
                      onClick={() => {
                        if (isFirst) {
                          setStep('meta');
                        } else {
                          handlePrevPage();
                        }
                      }}
                    >
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
