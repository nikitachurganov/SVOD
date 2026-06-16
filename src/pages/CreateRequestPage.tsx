import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, Select, Spin } from 'antd';
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
import { FormFillWizardLayout } from '../shared/ui/form-fill/FormFillWizardLayout';
import { useFormStore } from '../shared/hooks/useFormStore';
import { requiredRule } from '../shared/utils/formRules';

interface MetaFormValues {
  title: string;
  formId: string;
}

export const CreateRequestPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const [metaForm] = Form.useForm<MetaFormValues>();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formStore = useFormStore();
  const fillRef = useRef<FormFillRendererHandle>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [metaCollapsed, setMetaCollapsed] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const selectedFormId = Form.useWatch('formId', metaForm);
  const requestTitle = Form.useWatch('title', metaForm) ?? '';

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

  useEffect(() => {
    if (step === 3) {
      setMetaCollapsed(true);
    }
  }, [step]);

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

  const validateMeta = async (): Promise<MetaFormValues | null> => {
    try {
      return await metaForm.validateFields();
    } catch {
      return null;
    }
  };

  const handleProceedToFill = async () => {
    const meta = await validateMeta();
    if (meta) setStep(3);
  };

  const handleSubmit = async () => {
    try {
      const meta = await validateMeta();
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
        title: meta.title.trim(),
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

  const fillActions =
    step === 3 && selectedForm && hasPages && currentPage && currentPage.fields.length > 0 ? (
      <>
        <Button
          onClick={() => {
            setStep(2);
            setMetaCollapsed(false);
            scrollToTop();
          }}
        >
          Назад к параметрам
        </Button>
        {!isFirst && <Button onClick={handlePrevPage}>Назад</Button>}
        {!isLast && (
          <Button type="primary" onClick={handleNextPage}>
            Далее
          </Button>
        )}
        {isLast && (
          <Button type="primary" onClick={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? 'Сохранение…' : 'Сохранить заявку'}
          </Button>
        )}
      </>
    ) : null;

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
      <div
        style={{
          background: 'var(--app-surface)',
          borderBottom: '1px solid var(--app-border)',
          padding: '12px 24px 16px',
          flexShrink: 0,
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
          <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{pageTitle}</h4>
        </div>
      </div>

      {loadingForms ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            minHeight: '60vh',
          }}
        >
          <Spin size="large" tip="Загрузка формы…" />
        </div>
      ) : error ? (
        <div style={{ padding: 24 }}>
          <Alert type="error" title="Ошибка загрузки" description={error} showIcon closable={false} />
        </div>
      ) : (
        <FormFillWizardLayout
          contentRef={contentRef}
          pageIndex={step === 3 ? pageIndex : undefined}
          pageCount={step === 3 ? pageInstances.length : undefined}
          pageTitle={step === 3 ? currentPage?.title : undefined}
          notification={
            inlineNotification ? (
              <Alert
                type={inlineNotification.kind}
                title={inlineNotification.title}
                description={inlineNotification.subtitle}
                showIcon
                closable
                onClose={() => setInlineNotification(null)}
                style={{ marginBottom: 16 }}
              />
            ) : null
          }
          actions={fillActions}
        >
          {step < 3 || !metaCollapsed ? (
            <Form
              form={metaForm}
              layout="vertical"
              style={{ marginBottom: 24 }}
              onValuesChange={(changed) => {
                if ('title' in changed && step === 1 && selectedFormId) {
                  setStep(2);
                }
                if ('formId' in changed && changed.formId) {
                  setStep(2);
                }
              }}
            >
              <Form.Item
                name="title"
                label="Название заявки"
                rules={[requiredRule('Введите название заявки')]}
              >
                <Input placeholder="Например: Заявка на доступ" />
              </Form.Item>
              <Form.Item
                name="formId"
                label="Форма"
                rules={[requiredRule('Выберите форму')]}
              >
                <Select
                  showSearch
                  placeholder="Выберите форму"
                  optionFilterProp="label"
                  options={formOptions}
                />
              </Form.Item>
              {step === 2 && (
                <Button
                  type="primary"
                  disabled={!selectedFormId || !requestTitle.trim()}
                  onClick={() => void handleProceedToFill()}
                >
                  Далее
                </Button>
              )}
            </Form>
          ) : (
            <Card
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Button type="link" onClick={() => setMetaCollapsed(false)}>
                  Изменить параметры
                </Button>
              }
            >
              <p style={{ margin: '0 0 4px' }}>
                <strong>Название:</strong> {requestTitle}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Форма:</strong> {selectedForm?.name}
              </p>
            </Card>
          )}

          {step === 3 && selectedForm ? (
            hasPages && currentPage && currentPage.fields.length > 0 ? (
              <FormFillRenderer
                ref={fillRef}
                pages={pageInstances}
                pageIndex={pageIndex}
                legacyStore={formStore}
              />
            ) : (
              <span style={{ color: 'var(--app-text-secondary)' }}>
                У выбранной формы нет полей.
              </span>
            )
          ) : step < 3 ? (
            <span style={{ color: 'var(--app-text-secondary)' }}>
              Укажите название заявки и выберите форму, чтобы продолжить заполнение.
            </span>
          ) : null}
        </FormFillWizardLayout>
      )}
    </div>
  );
};
