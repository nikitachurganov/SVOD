import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, Form, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  getForms,
  pagesPayloadToInstances,
  type FormResponse,
} from '../shared/api/forms.api';
import { createRequest } from '../shared/api/requests.api';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { mapDataToSnapshot } from '../shared/utils/mapDataToSnapshot';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { collectFieldIds, collectLeafFields } from '../shared/formily/collectFieldIds';
import {
  buildFormSnapshot,
  processRequestFormValues,
} from '../shared/formily/formSubmit.utils';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../shared/ui/form-fill/FormFillRenderer';
import { useFormStore } from '../shared/hooks/useFormStore';

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
  const fillRef = useRef<FormFillRendererHandle>(null);
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
    fillRef.current?.resetFields();
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
      await fillRef.current?.validateFields(ids);
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
      await fillRef.current?.validateFields();
      setIsSubmitting(true);

      const rawValues = fillRef.current?.getFieldsValue() ?? {};

      const snapshot = selectedForm
        ? buildFormSnapshot(selectedForm, pageInstances)
        : undefined;

      const pendingRequestId = crypto.randomUUID();

      const allLeafFields = pageInstances.flatMap((page) =>
        collectLeafFields(page.fields),
      );

      const processed = await processRequestFormValues(
        rawValues,
        allLeafFields,
        pendingRequestId,
      );
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
        let subtitle = err.message;
        if (axios.isAxiosError(err)) {
          if (err.code === 'ERR_NETWORK') {
            subtitle = 'Сервер недоступен. Проверьте, что backend запущен.';
          } else if (err.response?.status === 500) {
            subtitle = 'Внутренняя ошибка сервера. Попробуйте ещё раз.';
          } else if (
            err.response?.data &&
            typeof err.response.data === 'object' &&
            'detail' in err.response.data
          ) {
            const detail = (err.response.data as { detail?: unknown }).detail;
            subtitle = typeof detail === 'string' ? detail : subtitle;
          }
        }
        setInlineNotification({
          kind: 'error',
          title: 'Не удалось создать заявку',
          subtitle,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageTitle = 'Создание заявки';

  const formOptions = forms.map((f) => ({ value: f.id, label: f.name }));

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
          background: 'var(--app-surface)',
          borderBottom: '1px solid var(--app-border)',
          padding: '12px 24px 16px',
          flexShrink: 0,
        }}
      >
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={[
            {
              title: (
                <a onClick={() => navigate('/requests')} style={{ cursor: 'pointer' }}>
                  Заявки
                </a>
              ),
            },
            { title: 'Создание заявки' },
          ]}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              aria-label="Вернуться к реестру заявок"
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
          background: 'var(--app-bg)',
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
            <Spin size="large" />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <Alert
              type="error"
              title="Ошибка загрузки"
              description={error}
              showIcon
              closable={false}
            />
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
            {inlineNotification && (
              <div style={{ marginBottom: 16 }}>
                <Alert
                  type={inlineNotification.kind}
                  title={inlineNotification.title}
                  description={inlineNotification.subtitle}
                  showIcon
                  closable
                  onClose={() => setInlineNotification(null)}
                />
              </div>
            )}

            {/* Step 1 + 2 — meta info */}
            <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Form.Item
                label="Название заявки"
                validateStatus={metaErrors.title ? 'error' : undefined}
                help={metaErrors.title}
              >
                <Input
                  id="meta-title"
                  placeholder="Например: Заявка на доступ"
                  value={requestTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value;
                    setRequestTitle(value);
                    setMetaErrors((prev) => ({ ...prev, title: undefined }));
                    if (step === 1 && selectedFormId) {
                      setStep(2);
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                label="Форма"
                validateStatus={metaErrors.formId ? 'error' : undefined}
                help={metaErrors.formId}
              >
                <Select
                  id="meta-formId"
                  showSearch
                  placeholder="Выберите форму"
                  optionFilterProp="label"
                  options={formOptions}
                  value={selectedFormId}
                  onChange={(value) => {
                    setSelectedFormId(value);
                    setMetaErrors((prev) => ({ ...prev, formId: undefined }));
                    if (value) setStep(2);
                  }}
                />
              </Form.Item>
            </div>

            {step === 2 && (
              <Button
                type="primary"
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
                <>
                  <FormFillRenderer
                    ref={fillRef}
                    pages={pageInstances}
                    pageIndex={pageIndex}
                    legacyStore={formStore}
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: 10,
                      marginTop: 16,
                    }}
                  >
                    {!isFirst && (
                      <Button onClick={handlePrevPage}>
                        Назад
                      </Button>
                    )}
                    {!isLast && (
                      <Button type="primary" onClick={handleNextPage}>
                        Далее
                      </Button>
                    )}
                    {isLast && (
                      <Button
                        type="primary"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        loading={isSubmitting}
                      >
                        {isSubmitting ? 'Сохранение…' : 'Сохранить заявку'}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <span style={{ color: 'var(--app-text-secondary)' }}>
                  У выбранной формы нет полей.
                </span>
              )
            ) : (
              <span style={{ color: 'var(--app-text-secondary)' }}>
                Укажите название заявки и выберите форму, чтобы продолжить заполнение.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
