import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  InlineNotification,
  Loading,
  Modal,
  Tag,
} from '@carbon/react';
import { ArrowLeft, Edit, TrashCan } from '@carbon/react/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteForm,
  getFormById,
  pagesPayloadToInstances,
  type FormResponse,
} from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import { PreviewField } from '../shared/ui/form-builder/FormPreviewModal';
import type { FormFieldInstance, FormPageInstance } from '../shared/types/form-builder.types';
import { useFormStore, FormProvider } from '../shared/hooks/useFormStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export const FormViewPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [formData, setFormData] = useState<FormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formStore = useFormStore();
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getFormById(id)
      .then((data) => {
        setFormData(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить форму');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const pageInstances = useMemo<FormPageInstance[]>(
    () => (formData?.pages ? pagesPayloadToInstances(formData.pages) : []),
    [formData],
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
  }, [formData]);

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

  const handleSubmitForm = async () => {
    try {
      await formStore.validateFields();
      setIsSubmitting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setSubmitSuccess(true);
    } catch {
      // Validation errors are shown inline
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteForm(id);
      navigate('/forms');
    } catch {
      setIsDeleting(false);
    }
    setDeleteConfirmOpen(false);
  }, [id, navigate]);

  const pageTitle = loading ? 'Загрузка…' : (formData?.name ?? 'Форма');
  const breadcrumbCurrent = loading ? 'Загрузка…' : (error ? 'Не найдено' : (formData?.name ?? 'Форма'));

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
          background: 'var(--cds-layer)',
          borderBottom: '1px solid var(--cds-border-subtle)',
          padding: '12px 24px 16px',
          flexShrink: 0,
        }}
      >
        <Breadcrumb noTrailingSlash style={{ marginBottom: 8 }}>
          <BreadcrumbItem>
            <a onClick={() => navigate('/forms')} style={{ cursor: 'pointer' }}>
              Формы
            </a>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{breadcrumbCurrent}</BreadcrumbItem>
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
              iconDescription="Вернуться к реестру форм"
              onClick={() => navigate('/forms')}
            />
            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              {pageTitle}
            </h4>
            {!loading && formData && (
              <Tag type="blue" size="sm">
                Просмотр
              </Tag>
            )}
          </div>

          {formData && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Edit}
                onClick={() => navigate(`/forms/${id}/edit`)}
              >
                Изменить
              </Button>

              <Button
                kind="danger"
                size="sm"
                renderIcon={TrashCan}
                disabled={isDeleting}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {isDeleting ? 'Удаление…' : 'Удалить'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        open={deleteConfirmOpen}
        danger
        modalHeading="Удалить форму?"
        primaryButtonText="Удалить"
        secondaryButtonText="Отмена"
        onRequestSubmit={handleDelete}
        onRequestClose={() => setDeleteConfirmOpen(false)}
        size="xs"
      >
        <p>Это действие нельзя отменить.</p>
      </Modal>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'var(--cds-background)',
        }}
        ref={contentRef}
      >
        {loading ? (
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
          <div style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
            {submitSuccess && (
              <div style={{ marginBottom: 16 }}>
                <InlineNotification
                  kind="success"
                  title="Форма заполнена"
                  subtitle="Это публичный просмотр — данные не отправляются."
                  lowContrast
                  onCloseButtonClick={() => setSubmitSuccess(false)}
                />
              </div>
            )}
            {formData?.description && (
              <span
                style={{
                  display: 'block',
                  marginBottom: 24,
                  fontSize: '1rem',
                  color: 'var(--cds-text-secondary)',
                }}
              >
                {formData.description}
              </span>
            )}
            <span
              style={{
                display: 'block',
                marginBottom: 16,
                color: 'var(--cds-text-secondary)',
              }}
            >
              Автор: {formData?.author ? buildDisplayName(formData.author) : 'Неизвестный автор'}
            </span>

            {hasPages && currentPage && currentPage.fields.length > 0 ? (
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
                      onClick={handleSubmitForm}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Отправка…' : 'Отправить'}
                    </Button>
                  )}
                </div>
              </FormProvider>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <span style={{ color: 'var(--cds-text-secondary)' }}>В форме нет полей.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
