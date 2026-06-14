import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  Alert,
  Button,
  Input,
  Space,
  Spin,
  Tabs,
  Typography,
  message,
} from 'antd';
import { createForm, type Form as FormilyFormType } from '@formily/core';

import {
  createForm as createFormApi,
  getFormById,
  mapPagesToPayload,
  pagesPayloadToInstances,
} from '../../shared/api/forms.api';
import { createRequest } from '../../shared/api/requests.api';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import type { FormPageInstance } from '../../shared/types/form-builder.types';
import { mapDataToSnapshot } from '../../shared/utils/mapDataToSnapshot';
import { LazyFormilyFormRenderer } from '../../shared/formily/lazyFormilyFormRenderer';
import {
  buildFormSnapshot,
  serializeFormValues,
} from '../../shared/formily/formSubmit.utils';
import {
  formilySchemaToPages,
  pagesToFormilySchema,
} from '../../shared/formily/schemaMapper';

import { FormilyDesigner } from './FormilyDesigner';

const { Title, Paragraph, Text } = Typography;

const createDefaultPages = (): FormPageInstance[] => [
  {
    id: crypto.randomUUID(),
    title: 'Страница 1',
    fields: [],
  },
];

export const FormilyBuilderPage = () => {
  const { activeOrganization } = useOrganization();
  const previewFormRef = useRef<FormilyFormType | null>(null);

  const [formTitle, setFormTitle] = useState('Formily POC');
  const [pages, setPages] = useState<FormPageInstance[]>(createDefaultPages);
  const [savedFormId, setSavedFormId] = useState<string | null>(null);
  const [loadFormId, setLoadFormId] = useState('');
  const [requestTitle, setRequestTitle] = useState('Тестовая заявка Formily POC');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formilySchema = useMemo(() => pagesToFormilySchema(pages), [pages]);

  const roundTripPages = useMemo(
    () => formilySchemaToPages(formilySchema, pages[0]?.id),
    [formilySchema, pages],
  );

  const handlePreviewFormReady = useCallback((form: FormilyFormType) => {
    previewFormRef.current = form;
  }, []);

  const handleSave = async () => {
    if (!formTitle.trim()) {
      message.error('Введите название формы');
      return;
    }
    if (pages[0]?.fields.length === 0) {
      message.error('Добавьте хотя бы одно поле');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const saved = await createFormApi({
        name: formTitle.trim(),
        pages: mapPagesToPayload(pages),
        organization_id: activeOrganization?.id ?? null,
      });
      setSavedFormId(saved.id);
      setStatusMessage(`Форма сохранена (id: ${saved.id})`);
      message.success('Форма сохранена через существующий API');
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Не удалось сохранить форму';
      setErrorMessage(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async () => {
    if (!loadFormId.trim()) {
      message.error('Введите ID формы');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const loaded = await getFormById(loadFormId.trim());
      setFormTitle(loaded.name);
      setPages(pagesPayloadToInstances(loaded.pages));
      setSavedFormId(loaded.id);
      setStatusMessage(`Форма загружена: ${loaded.name}`);
      message.success('Форма загружена из API');
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Не удалось загрузить форму';
      setErrorMessage(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!savedFormId) {
      message.error('Сначала сохраните форму');
      return;
    }
    if (!requestTitle.trim()) {
      message.error('Введите название заявки');
      return;
    }

    const formInstance = previewFormRef.current;
    if (!formInstance) {
      message.error('Форма предпросмотра не инициализирована');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await formInstance.validate();
      const serialized = serializeFormValues(
        formInstance.values as Record<string, unknown>,
      );

      const formRow = await getFormById(savedFormId);
      const loadedPages = pagesPayloadToInstances(formRow.pages);
      const snapshot = buildFormSnapshot(formRow, loadedPages);
      const data = mapDataToSnapshot(serialized, snapshot);

      const created = await createRequest({
        title: requestTitle.trim(),
        form_id: savedFormId,
        organization_id: activeOrganization?.id ?? null,
        data,
        form_snapshot: snapshot,
      });

      setStatusMessage(`Заявка создана (id: ${created.id})`);
      message.success('Заявка создана через createRequest');
    } catch (err: unknown) {
      let text = 'Не удалось создать заявку';
      if (err instanceof Error) {
        text = err.message;
      }
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ERR_NETWORK'
      ) {
        text =
          'Сеть недоступна. Проверьте, что backend запущен на ' +
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'} и CORS разрешает ${window.location.origin}`;
      }
      setErrorMessage(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  const formKey = useMemo(
    () => pages.map((page) => page.fields.map((field) => field.id).join(',')).join('|'),
    [pages],
  );

  const [previewForm, setPreviewForm] = useState(() => createForm());

  useEffect(() => {
    setPreviewForm(createForm());
  }, [formKey]);

  return (
    <div className="app-page-canvas" style={{ padding: 24 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        Formily POC — /dev/formily-builder
      </Title>
      <Paragraph type="secondary">
        QA-route для проверки Formily runtime. Production fill использует{' '}
        <Text code>FormFillRenderer</Text> с feature flag{' '}
        <Text code>VITE_FORMILY_RUNTIME</Text>.
      </Paragraph>

      {statusMessage ? (
        <Alert type="success" title={statusMessage} showIcon style={{ marginBottom: 16 }} />
      ) : null}
      {errorMessage ? (
        <Alert type="error" title={errorMessage} showIcon style={{ marginBottom: 16 }} />
      ) : null}

      <Spin spinning={loading}>
        <Tabs
          items={[
            {
              key: 'builder',
              label: 'Конструктор',
              children: (
                <FormilyDesigner
                  formTitle={formTitle}
                  pages={pages}
                  onTitleChange={setFormTitle}
                  onPagesChange={setPages}
                />
              ),
            },
            {
              key: 'preview',
              label: 'Предпросмотр (Formily)',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Suspense fallback={<Spin />}>
                    <LazyFormilyFormRenderer
                      schema={formilySchema}
                      form={previewForm}
                      onFormReady={handlePreviewFormReady}
                    />
                  </Suspense>
                  <Space>
                    <Input
                      placeholder="Название заявки"
                      value={requestTitle}
                      onChange={(event) => setRequestTitle(event.target.value)}
                      style={{ width: 320 }}
                    />
                    <Button type="primary" onClick={handleCreateRequest}>
                      Создать заявку
                    </Button>
                  </Space>
                </div>
              ),
            },
            {
              key: 'schema',
              label: 'Schema / Round-trip',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <Text strong>Formily ISchema</Text>
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: 'var(--app-surface)',
                        border: '1px solid var(--app-border)',
                        borderRadius: 8,
                        overflow: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(formilySchema, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <Text strong>Round-trip pages (из schema)</Text>
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: 'var(--app-surface)',
                        border: '1px solid var(--app-border)',
                        borderRadius: 8,
                        overflow: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(roundTripPages, null, 2)}
                    </pre>
                  </div>
                </div>
              ),
            },
          ]}
        />

        <Space style={{ marginTop: 24 }} wrap>
          <Button type="primary" onClick={handleSave}>
            Сохранить форму (API)
          </Button>
          <Input
            placeholder="ID формы для загрузки"
            value={loadFormId}
            onChange={(event) => setLoadFormId(event.target.value)}
            style={{ width: 280 }}
          />
          <Button onClick={handleLoad}>Загрузить форму</Button>
          {savedFormId ? (
            <Text type="secondary">Текущая форма: {savedFormId}</Text>
          ) : null}
        </Space>
      </Spin>
    </div>
  );
};
