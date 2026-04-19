import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  ComboBox,
  InlineNotification,
  Loading,
  TextInput,
} from '@carbon/react';
import { ArrowLeft } from '@carbon/react/icons';
import { useNavigate } from 'react-router-dom';
import {
  getForms,
  pagesPayloadToInstances,
  type FormResponse,
} from '../shared/api/forms.api';
import { createRequest } from '../shared/api/requests.api';
import { useOrganization } from '../shared/context/organization.context';
import { uploadFieldFiles, type FileMetadata } from '../shared/api/files.api';
import type { Field, FieldOption, FormEntity } from '../types/form';
import { mapDataToSnapshot } from '../shared/utils/mapDataToSnapshot';
import type { FormFieldInstance, FormPageInstance } from '../shared/types/form-builder.types';
import { PreviewField } from '../shared/ui/form-builder/FormPreviewModal';
import { useFormStore, FormProvider } from '../shared/hooks/useFormStore';

const FILE_FIELD_TYPES = new Set(['file_image', 'file_vector', 'file_document']);

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

interface MetaErrors {
  title?: string;
  formId?: string;
}

export const CreateRequestPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formStore = useFormStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [requestTitle, setRequestTitle] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [metaErrors, setMetaErrors] = useState<MetaErrors>({});
  const [inlineNotification, setInlineNotification] = useState<{
    kind: 'success' | 'error';
    title: string;
    subtitle?: string;
  } | null>(null);

  useEffect(() => {
    setLoadingForms(true);
    getForms(activeOrganization?.id)
      .then((data) => {
        setForms(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить формы');
      })
      .finally(() => setLoadingForms(false));
  }, [activeOrganization?.id]);

  const selectedForm = useMemo(
    () => forms.find((f) => f.id === selectedFormId),
    [forms, selectedFormId],
  );

  const pageInstances: FormPageInstance[] = useMemo(
    () => (selectedForm ? pagesPayloadToInstances(selectedForm.pages) : []),
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
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await formStore.validateFields(ids);
      setPageIndex((idx) => Math.min(idx + 1, pageInstances.length - 1));
      scrollToTop();
    } catch {
      // Validation errors are shown inline
    }
  };

  const handlePrevPage = () => {
    setPageIndex((idx) => Math.max(0, idx - 1));
    scrollToTop();
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

  const buildSnapshot = (formRow: FormResponse, pages: FormPageInstance[]): FormEntity => {
    const allLeafFields: FormFieldInstance[] = [];
    for (const page of pages) {
      allLeafFields.push(...collectLeafFields(page.fields));
    }

    const fields: Field[] = allLeafFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options?.map<FieldOption>((opt) => ({ id: opt.id, label: opt.label })),
    }));

    return {
      id: formRow.id,
      title: formRow.name,
      fields,
    };
  };

  const serializeOne = (val: unknown): unknown => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;

    if (typeof val === 'object' && val !== null) {
      if ('toISOString' in val && typeof (val as Record<string, unknown>).toISOString === 'function') {
        return (val as { toISOString: () => string }).toISOString();
      }
      if (Array.isArray(val)) {
        return val.map(serializeOne);
      }
    }
    return val;
  };

  const processValues = async (
    raw: Record<string, unknown>,
    allFields: FormFieldInstance[],
    requestId: string,
  ): Promise<Record<string, unknown>> => {
    const fieldTypeMap = new Map<string, string>();
    const walk = (fields: FormFieldInstance[]) => {
      for (const f of fields) {
        fieldTypeMap.set(f.id, f.type);
        if (f.type === 'group' && f.children) walk(f.children);
      }
    };
    walk(allFields);

    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(raw)) {
      const fieldType = fieldTypeMap.get(key);

      if (fieldType && FILE_FIELD_TYPES.has(fieldType) && Array.isArray(val) && val.length > 0) {
        const hasFiles = val.some(
          (item: Record<string, unknown>) => item?.originFileObj instanceof File,
        );
        if (hasFiles) {
          const uploaded: FileMetadata[] = await uploadFieldFiles(
            val as Array<{ originFileObj?: File; name?: string }>,
            fieldType,
            requestId,
            key,
          );
          out[key] = uploaded;
          continue;
        }
      }

      out[key] = serializeOne(val);
    }

    return out;
  };

  const validateMeta = (): { title: string; formId: string } | null => {
    const newErrors: MetaErrors = {};
    if (!requestTitle.trim()) newErrors.title = 'Введите название заявки';
    if (!selectedFormId) newErrors.formId = 'Выберите форму';
    setMetaErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return null;
    return { title: requestTitle.trim(), formId: selectedFormId! };
  };

  const handleSubmit = async () => {
    try {
      const meta = validateMeta();
      if (!meta) return;
      await formStore.validateFields();
      setIsSubmitting(true);

      const rawValues = formStore.getFieldsValue();

      const snapshot = selectedForm
        ? buildSnapshot(selectedForm, pageInstances)
        : undefined;

      const pendingRequestId = crypto.randomUUID();

      const allLeafFields: FormFieldInstance[] = [];
      for (const page of pageInstances) {
        allLeafFields.push(...collectLeafFields(page.fields));
      }

      const processed = await processValues(rawValues, allLeafFields, pendingRequestId);
      const alignedData =
        snapshot != null ? mapDataToSnapshot(processed, snapshot) : processed;

      if (Object.keys(alignedData).length === 0 && snapshot && snapshot.fields.length > 0) {
        setInlineNotification({
          kind: 'error',
          title: 'Ошибка отправки',
          subtitle: 'Не удалось собрать данные формы. Попробуйте ещё раз.',
        });
        return;
      }

      await createRequest({
        title: meta.title,
        form_id: meta.formId,
        organization_id: activeOrganization?.id ?? null,
        data: alignedData,
        form_snapshot: snapshot,
      });

      setInlineNotification({
        kind: 'success',
        title: 'Заявка создана',
        subtitle: 'Новая заявка успешно добавлена в реестр.',
      });

      navigate('/requests');
    } catch (err) {
      if (err instanceof Error && !('errorFields' in err)) {
        setInlineNotification({
          kind: 'error',
          title: 'Ошибка загрузки файлов',
          subtitle: err.message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageTitle = 'Создание заявки';

  const comboBoxItems = forms.map((f) => ({ id: f.id, text: f.name }));

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: 'var(--cds-layer-01)',
          borderBottom: '1px solid var(--cds-border-subtle)',
          padding: '12px 24px 16px',
          flexShrink: 0,
        }}
      >
        <Breadcrumb noTrailingSlash style={{ marginBottom: 8 }}>
          <BreadcrumbItem>
            <a onClick={() => navigate('/requests')} style={{ cursor: 'pointer' }}>
              Заявки
            </a>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>Создание заявки</BreadcrumbItem>
        </Breadcrumb>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ArrowLeft}
              iconDescription="Вернуться к реестру заявок"
              onClick={() => navigate('/requests')}
            />
            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              {pageTitle}
            </h4>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'var(--cds-background)',
        }}
      >
        {loadingForms ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '60vh',
            }}
          >
            <Loading withOverlay={false} />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <InlineNotification
              kind="error"
              title="Ошибка загрузки"
              subtitle={error}
              lowContrast
              hideCloseButton
            />
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
            {inlineNotification && (
              <div style={{ marginBottom: 16 }}>
                <InlineNotification
                  kind={inlineNotification.kind}
                  title={inlineNotification.title}
                  subtitle={inlineNotification.subtitle}
                  lowContrast
                  onCloseButtonClick={() => setInlineNotification(null)}
                />
              </div>
            )}

            {/* Step 1 + 2 — meta info */}
            <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TextInput
                id="meta-title"
                labelText="Название заявки"
                placeholder="Например: Заявка на доступ"
                value={requestTitle}
                invalid={!!metaErrors.title}
                invalidText={metaErrors.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setRequestTitle(value);
                  setMetaErrors((prev) => ({ ...prev, title: undefined }));
                  if (step === 1 && selectedFormId) {
                    setStep(2);
                  }
                }}
              />

              <ComboBox
                id="meta-formId"
                titleText="Форма"
                placeholder="Выберите форму"
                items={comboBoxItems}
                itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
                selectedItem={comboBoxItems.find((item) => item.id === selectedFormId) ?? null}
                invalid={!!metaErrors.formId}
                invalidText={metaErrors.formId}
                onChange={(data) => {
                  const selectedItem = data.selectedItem ?? null;
                  const value = selectedItem?.id;
                  setSelectedFormId(value);
                  setMetaErrors((prev) => ({ ...prev, formId: undefined }));
                  if (value) setStep(2);
                }}
              />
            </div>

            {step === 2 && (
              <Button
                kind="primary"
                size="md"
                disabled={!selectedFormId || !requestTitle.trim()}
                onClick={() => {
                  const meta = validateMeta();
                  if (meta) setStep(3);
                }}
              >
                Далее
              </Button>
            )}

            {/* Step 3 + 4 — fill form */}
            {step === 3 && selectedForm ? (
              hasPages && currentPage && currentPage.fields.length > 0 ? (
                <FormProvider store={formStore}>
                  {currentPage.fields.map((field) => (
                    <PreviewField key={field.id} field={field} />
                  ))}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: 10,
                      marginTop: 16,
                    }}
                  >
                    {!isFirst && (
                      <Button kind="secondary" size="md" onClick={handlePrevPage}>
                        Назад
                      </Button>
                    )}
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
                        {isSubmitting ? 'Сохранение…' : 'Сохранить заявку'}
                      </Button>
                    )}
                  </div>
                </FormProvider>
              ) : (
                <span style={{ color: 'var(--cds-text-secondary)' }}>
                  У выбранной формы нет полей.
                </span>
              )
            ) : (
              <span style={{ color: 'var(--cds-text-secondary)' }}>
                Укажите название заявки и выберите форму, чтобы продолжить заполнение.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
