import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Typography,
  theme,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
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

const FILE_FIELD_TYPES = new Set(['file_image', 'file_vector', 'file_document']);

const { Title, Text } = Typography;

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

interface MetaFormValues {
  title: string;
  formId: string;
}

export const CreateRequestPage = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const { activeOrganization } = useOrganization();

  const [forms, setForms] = useState<FormResponse[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metaForm] = Form.useForm<MetaFormValues>();
  const [form] = Form.useForm();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [requestTitle, setRequestTitle] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
    // reset page index and field values when form changes
    setPageIndex(0);
    form.resetFields();
  }, [selectedForm, form]);

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await form.validateFields(ids);
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

  /** Build snapshot from the SAME instances used for rendering to guarantee ID match */
  const buildSnapshot = (formRow: FormResponse, pages: FormPageInstance[]): FormEntity => {
    const allLeafFields: FormFieldInstance[] = [];
    for (const page of pages) {
      allLeafFields.push(...collectLeafFields(page.fields));
    }

    const fields: Field[] = allLeafFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      options: f.options?.map<FieldOption>((opt) => ({ id: opt.id, label: opt.label })),
    }));

    return {
      id: formRow.id,
      title: formRow.name,
      fields,
    };
  };

  /**
   * Serializes a single value to a JSON-safe primitive.
   * File lists are NOT handled here — they go through uploadFieldFiles.
   */
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

  /**
   * Walks every field value:
   * - file fields → upload to storage, store metadata array
   * - other fields → serialize to JSON-safe primitives
   */
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

  const handleSubmit = async () => {
    try {
      const meta = await metaForm.validateFields();
      await form.validateFields();
      setIsSubmitting(true);

      const rawValues = form.getFieldsValue(true);

      const snapshot = selectedForm
        ? buildSnapshot(selectedForm, pageInstances)
        : undefined;

      // Generate a stable ID for file storage paths before the DB row exists
      const pendingRequestId = crypto.randomUUID();

      const allLeafFields: FormFieldInstance[] = [];
      for (const page of pageInstances) {
        allLeafFields.push(...collectLeafFields(page.fields));
      }

      const processed = await processValues(rawValues, allLeafFields, pendingRequestId);
      const alignedData =
        snapshot != null ? mapDataToSnapshot(processed, snapshot) : processed;

      if (Object.keys(alignedData).length === 0 && snapshot && snapshot.fields.length > 0) {
        notification.error({
          title: 'Ошибка отправки',
          description: 'Не удалось собрать данные формы. Попробуйте ещё раз.',
          placement: 'topRight',
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

      notification.success({
        title: 'Заявка создана',
        description: 'Новая заявка успешно добавлена в реестр.',
        placement: 'topRight',
      });

      navigate('/requests');
    } catch (err) {
      if (err instanceof Error && !('errorFields' in err)) {
        notification.error({
          title: 'Ошибка загрузки файлов',
          description: err.message,
          placement: 'topRight',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageTitle = 'Создание заявки';

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
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: '12px 24px 16px',
          flexShrink: 0,
        }}
      >
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={[
            { title: <a onClick={() => navigate('/requests')}>Заявки</a> },
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
          <Space align="center" size={12}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/requests')}
              style={{ padding: '0 4px' }}
              aria-label="Вернуться к реестру заявок"
            />
            <Title level={4} style={{ margin: 0 }}>
              {pageTitle}
            </Title>
          </Space>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: token.colorBgLayout,
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
            <Alert type="error" showIcon message="Ошибка загрузки" description={error} />
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
            {/* Step 1 + 2 — meta info */}
            <Form
              form={metaForm}
              layout="vertical"
              style={{ marginBottom: 24 }}
              initialValues={{ title: '', formId: undefined }}
            >
              <Form.Item<MetaFormValues>
                label="Название заявки"
                name="title"
                rules={[{ required: true, message: 'Введите название заявки' }]}
              >
                <Input
                  placeholder="Например: Заявка на доступ"
                  value={requestTitle}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRequestTitle(value);
                    metaForm.setFieldsValue({ ...metaForm.getFieldsValue(), title: value });
                    if (step === 1 && selectedFormId) {
                      setStep(2);
                    }
                  }}
                />
              </Form.Item>

              <Form.Item<MetaFormValues>
                label="Форма"
                name="formId"
                rules={[{ required: true, message: 'Выберите форму' }]}
              >
                <Select
                  placeholder="Выберите форму"
                  options={forms.map((f) => ({ value: f.id, label: f.name }))}
                  showSearch
                  optionFilterProp="label"
                  value={selectedFormId}
                  onChange={(value: string) => {
                    setSelectedFormId(value);
                    metaForm.setFieldsValue({ ...metaForm.getFieldsValue(), formId: value });
                    setStep(2);
                  }}
                />
              </Form.Item>
            </Form>

            {step === 2 && (
              <Button
                type="primary"
                disabled={!selectedFormId || !requestTitle.trim()}
                onClick={async () => {
                  try {
                    await metaForm.validateFields(['title', 'formId']);
                    setStep(3);
                  } catch {
                    // errors shown inline
                  }
                }}
              >
                Далее
              </Button>
            )}

            {/* Step 3 + 4 — fill form */}
            {step === 3 && selectedForm ? (
              hasPages && currentPage && currentPage.fields.length > 0 ? (
                <Form form={form} layout="vertical" requiredMark={false} preserve>
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
                      <Button onClick={handlePrevPage}>Назад</Button>
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
                        loading={isSubmitting}
                      >
                        Сохранить заявку
                      </Button>
                    )}
                  </div>
                </Form>
              ) : (
                <Text type="secondary">У выбранной формы нет полей.</Text>
              )
            ) : (
              <Text type="secondary">
                Укажите название заявки и выберите форму, чтобы продолжить заполнение.
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

