import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, Modal, Spin, Tag } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteForm,
  getFormById,
  pagesPayloadToInstances,
  type FormResponse,
} from '../shared/api/forms.api';
import { buildDisplayName } from '../shared/utils/userName';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { useFormStore } from '../shared/hooks/useFormStore';
import { collectFieldIds } from '../shared/formily/collectFieldIds';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../shared/ui/form-fill/FormFillRenderer';

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
  const fillRef = useRef<FormFillRendererHandle>(null);
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
    fillRef.current?.resetFields();
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

  const handleSubmitForm = async () => {
    try {
      await fillRef.current?.validateFields();
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
                <a onClick={() => navigate('/forms')} style={{ cursor: 'pointer' }}>
                  Формы
                </a>
              ),
            },
            { title: breadcrumbCurrent },
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
              aria-label="Вернуться к реестру форм"
              onClick={() => navigate('/forms')}
            />
            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
              {pageTitle}
            </h4>
            {!loading && formData && (
              <Tag color="blue">Просмотр</Tag>
            )}
          </div>

          {formData && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                icon={<EditOutlined />}
                onClick={() => navigate(`/forms/${id}/edit`)}
              >
                Изменить
              </Button>

              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={isDeleting}
                loading={isDeleting}
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
        title="Удалить форму?"
        okText="Удалить"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        onOk={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        width={400}
      >
        <p>Это действие нельзя отменить.</p>
      </Modal>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'var(--app-bg)',
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
            <Spin size="large" />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <Alert
              type="error"
              message="Ошибка загрузки"
              description={error}
              showIcon
              closable={false}
            />
          </div>
        ) : (
          <div style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
            {submitSuccess && (
              <div style={{ marginBottom: 16 }}>
                <Alert
                  type="success"
                  message="Форма заполнена"
                  description="Это публичный просмотр — данные не отправляются."
                  showIcon
                  closable
                  onClose={() => setSubmitSuccess(false)}
                />
              </div>
            )}
            {formData?.description && (
              <span
                style={{
                  display: 'block',
                  marginBottom: 24,
                  fontSize: '1rem',
                  color: 'var(--app-text-secondary)',
                }}
              >
                {formData.description}
              </span>
            )}
            <span
              style={{
                display: 'block',
                marginBottom: 16,
                color: 'var(--app-text-secondary)',
              }}
            >
              Автор: {formData?.author ? buildDisplayName(formData.author) : 'Неизвестный автор'}
            </span>

            {hasPages && currentPage && currentPage.fields.length > 0 ? (
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
                      onClick={handleSubmitForm}
                      disabled={isSubmitting}
                      loading={isSubmitting}
                    >
                      {isSubmitting ? 'Отправка…' : 'Отправить'}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <span style={{ color: 'var(--app-text-secondary)' }}>В форме нет полей.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
