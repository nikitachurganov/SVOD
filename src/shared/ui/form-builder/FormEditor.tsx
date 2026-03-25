import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Breadcrumb,
  BreadcrumbItem,
  Modal,
} from '@carbon/react';
import { ArrowLeft, View } from '@carbon/react/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import { ToolPanel } from '../ToolPanel';
import { FormCanvas } from './FormCanvas';
import { CanvasFieldOverlay } from './DroppedFieldCard';
import { PreviewField } from './FormPreviewModal';
import {
  useFormStore,
  FormProvider,
} from '../../hooks/useFormStore';
import {
  FIELD_TYPES_WITH_OPTIONS,
  PANEL_KEY_TO_FIELD_TYPE,
  isGroupCanvas,
  groupIdFromCanvas,
  type DragData,
  type FieldOption,
  type FormFieldInstance,
  type FormFieldType,
  type FormPageInstance,
} from '../../types/form-builder.types';

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FormEditorProps {
  breadcrumbLabel: string;
  pageTitle: string;
  saveButtonLabel?: string;
  initialTitle?: string;
  initialPages?: FormPageInstance[];
  initialFields?: FormFieldInstance[];
  onSave: (title: string, pages: FormPageInstance[]) => Promise<void>;
  onBack: () => void;
}

// ─── FormTitleInput ───────────────────────────────────────────────────────────

interface FormTitleInputProps {
  value: string;
  onChange: (value: string) => void;
}

const FormTitleInput = ({ value, onChange }: FormTitleInputProps) => {
  return (
    <input
      placeholder="Название формы"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: 0,
        fontSize: '1.25rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: 'var(--cds-text-primary)',
        background: 'transparent',
        width: '100%',
        border: 'none',
        outline: 'none',
      }}
    />
  );
};

// ─── Panel drag overlay chip ──────────────────────────────────────────────────

const PanelDragChip = ({ label }: { label: string }) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 14px',
        background: 'var(--cds-layer-01)',
        border: '1px solid var(--cds-interactive)',
        borderRadius: 8,
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        color: 'var(--cds-interactive)',
        fontSize: 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        cursor: 'grabbing',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
};

// ─── Active drag state ────────────────────────────────────────────────────────

type ActiveDragInfo =
  | { source: 'panel'; label: string }
  | { source: 'canvas'; fieldId: string }
  | null;

// ─── Tool-panel drop zone ─────────────────────────────────────────────────────

export const TOOL_PANEL_DROP_ID = 'tool-panel';

interface ToolPanelDropZoneProps {
  isCanvasDragging: boolean;
  width: number;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

const ToolPanelDropZone = ({
  isCanvasDragging,
  width,
  onResizeStart,
  children,
}: ToolPanelDropZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: TOOL_PANEL_DROP_ID });

  const deleteMode = isCanvasDragging && isOver;

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        width,
        minWidth: width,
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid var(--cds-border-subtle)',
          background: deleteMode
            ? 'color-mix(in srgb, var(--cds-support-error) 10%, var(--cds-layer-01))'
            : 'var(--cds-layer-01)',
          transition: 'background 150ms ease, border-color 150ms ease',
          overflow: deleteMode ? 'hidden' : 'auto',
        }}
      >
        {deleteMode ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '24px 32px',
              textAlign: 'center',
            }}
          >
            <span style={{ color: 'var(--cds-text-error)' }}>
              Перенесите в область, чтобы удалить поле
            </span>
          </div>
        ) : (
          children
        )}
      </div>
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 3,
          cursor: 'col-resize',
          background: 'transparent',
        }}
      />
    </div>
  );
};

// ─── Field helpers ────────────────────────────────────────────────────────────

const needsOptions = (type: FormFieldType): boolean =>
  FIELD_TYPES_WITH_OPTIONS.has(type);

const createDefaultOptions = (): FieldOption[] => [
  { id: crypto.randomUUID(), label: 'Вариант 1' },
  { id: crypto.randomUUID(), label: 'Вариант 2' },
];

const createField = (type: FormFieldType): FormFieldInstance => ({
  id: crypto.randomUUID(),
  type,
  label: '',
  description: '',
  required: false,
  options: needsOptions(type) ? createDefaultOptions() : undefined,
  children: type === 'group' ? [] : undefined,
});

// ─── Inline preview panel (multi-page) ───────────────────────────────────────

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

interface InlinePreviewProps {
  formTitle: string;
  pages: FormPageInstance[];
}

const InlinePreview = ({ formTitle, pages }: InlinePreviewProps) => {
  const store = useFormStore();
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hasPages = pages.length > 0;
  const currentPage = hasPages ? pages[Math.min(pageIndex, pages.length - 1)] : null;
  const isFirst = pageIndex === 0;
  const isLast = hasPages && pageIndex === pages.length - 1;

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await store.validateFields(ids);
      setPageIndex((idx) => Math.min(idx + 1, pages.length - 1));
      scrollToTop();
    } catch {
      // Validation errors are shown inline
    }
  };

  const handleBack = () => {
    setPageIndex((idx) => Math.max(0, idx - 1));
    scrollToTop();
  };

  const handleSubmit = async () => {
    try {
      await store.validateFields();
      setIsSubmitting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      store.resetFields();
      setPageIndex(0);
      scrollToTop();
    } catch {
      // Validation errors are shown inline
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--cds-background)',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {formTitle && (
          <h4 style={{ marginBottom: 24 }}>{formTitle}</h4>
        )}

        {hasPages && currentPage && currentPage.fields.length > 0 ? (
          <FormProvider store={store}>
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
                <Button kind="secondary" onClick={handleBack}>
                  Назад
                </Button>
              )}
              {!isLast && (
                <Button kind="primary" onClick={handleNext}>
                  Далее
                </Button>
              )}
              {isLast && (
                <Button
                  kind="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Отправка...' : 'Отправить'}
                </Button>
              )}
            </div>
          </FormProvider>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <span style={{ color: 'var(--cds-text-secondary)' }}>
              В форму не добавлено ни одного поля.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── FormEditor ───────────────────────────────────────────────────────────────

export const FormEditor = ({
  breadcrumbLabel,
  pageTitle,
  saveButtonLabel = 'Сохранить',
  initialTitle = '',
  initialPages,
  initialFields = [],
  onSave,
  onBack,
}: FormEditorProps) => {
  const [formTitle, setFormTitle] = useState<string>(initialTitle);
  const resolvedInitialPages: FormPageInstance[] =
    initialPages && initialPages.length
      ? initialPages
      : [
          {
            id: crypto.randomUUID(),
            title: 'Страница 1',
            fields: initialFields,
          },
        ];

  const [pages, setPages] = useState<FormPageInstance[]>(resolvedInitialPages);
  const [activePageId, setActivePageId] = useState<string>(
    resolvedInitialPages[0]?.id ?? crypto.randomUUID(),
  );
  const [toolboxWidth, setToolboxWidth] = useState<number>(360);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragInfo>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const isCanvasDragging = activeDrag?.source === 'canvas';

  const handleToolboxResizeMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!resizeStateRef.current) return;
      const { startX, startWidth } = resizeStateRef.current;
      const delta = event.clientX - startX;
      const nextWidth = Math.min(Math.max(startWidth + delta, 240), 600);
      setToolboxWidth(nextWidth);
    },
    [],
  );

  const handleToolboxResizeMouseUp = useCallback(() => {
    resizeStateRef.current = null;
    window.removeEventListener('mousemove', handleToolboxResizeMouseMove);
    window.removeEventListener('mouseup', handleToolboxResizeMouseUp);
  }, [handleToolboxResizeMouseMove]);

  const handleToolboxResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizeStateRef.current = { startX: event.clientX, startWidth: toolboxWidth };
      window.addEventListener('mousemove', handleToolboxResizeMouseMove);
      window.addEventListener('mouseup', handleToolboxResizeMouseUp);
    },
    [toolboxWidth, handleToolboxResizeMouseMove, handleToolboxResizeMouseUp],
  );

  const activePage: FormPageInstance | undefined =
    pages.find((p) => p.id === activePageId) ?? pages[0];
  const activeFields: FormFieldInstance[] = activePage?.fields ?? [];

  const setActivePageFields = useCallback(
    (updater: (fields: FormFieldInstance[]) => FormFieldInstance[]) => {
      setPages((prevPages) =>
        prevPages.map((page) =>
          page.id === activePageId ? { ...page, fields: updater(page.fields) } : page,
        ),
      );
    },
    [activePageId],
  );

  // ── Top-level field mutation ──────────────────────────────────────────────────
  const handleFieldChange = useCallback(
    (id: string, changes: Partial<FormFieldInstance>) => {
      setActivePageFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...changes } : f)),
      );
    },
    [setActivePageFields],
  );

  const handleFieldDelete = useCallback((id: string) => {
    setActivePageFields((prev) => prev.filter((f) => f.id !== id));
  }, [setActivePageFields]);

  // ── Group child mutation ──────────────────────────────────────────────────────
  const handleGroupChildChange = useCallback(
    (groupId: string, childId: string, changes: Partial<FormFieldInstance>) => {
      setActivePageFields((prev) =>
        prev.map((f) =>
          f.id === groupId && f.children
            ? {
                ...f,
                children: f.children.map((c) =>
                  c.id === childId ? { ...c, ...changes } : c,
                ),
              }
            : f,
        ),
      );
    },
    [setActivePageFields],
  );

  const handleGroupChildDelete = useCallback(
    (groupId: string, childId: string) => {
      setActivePageFields((prev) =>
        prev.map((f) =>
          f.id === groupId && f.children
            ? { ...f, children: f.children.filter((c) => c.id !== childId) }
            : f,
        ),
      );
    },
    [setActivePageFields],
  );

  // ── Drag start ───────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;

    setActiveDrag(
      data.source === 'panel'
        ? { source: 'panel', label: data.label }
        : { source: 'canvas', fieldId: String(event.active.id) },
    );
  }, []);

  // ── Drag end ─────────────────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);

    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as DragData | undefined;
    if (!data) return;

    const overId = String(over.id);
    const activeId = String(active.id);

    // Panel → canvas drop
    if (data.source === 'panel') {
      const fieldType = PANEL_KEY_TO_FIELD_TYPE[data.fieldKey];
      if (!fieldType) return;

      const newField = createField(fieldType);

      if (isGroupCanvas(overId)) {
        if (fieldType === 'group') return;
        const groupId = groupIdFromCanvas(overId);
        setActivePageFields((prev) =>
          prev.map((f) =>
            f.id === groupId
              ? { ...f, children: [...(f.children ?? []), newField] }
              : f,
          ),
        );
        return;
      }

      setActivePageFields((prev) => {
        const parentGroup = prev.find(
          (f) => f.type === 'group' && f.children?.some((c) => c.id === overId),
        );

        if (parentGroup) {
          if (fieldType === 'group') return prev;
          return prev.map((f) => {
            if (f.id !== parentGroup.id || !f.children) return f;
            const idx = f.children.findIndex((c) => c.id === overId);
            const next = [...f.children];
            next.splice(idx + 1, 0, newField);
            return { ...f, children: next };
          });
        }

        const overIndex = prev.findIndex((f) => f.id === overId);
        if (overIndex !== -1) {
          const next = [...prev];
          next.splice(overIndex + 1, 0, newField);
          return next;
        }

        return [...prev, newField];
      });
      return;
    }

    // Canvas → tool panel (delete)
    if (data.source === 'canvas' && overId === TOOL_PANEL_DROP_ID) {
      setActivePageFields((prev) => {
        if (prev.some((f) => f.id === activeId)) {
          return prev.filter((f) => f.id !== activeId);
        }
        return prev.map((f) => {
          if (f.type === 'group' && f.children?.some((c) => c.id === activeId)) {
            return { ...f, children: f.children.filter((c) => c.id !== activeId) };
          }
          return f;
        });
      });
      return;
    }

    // Canvas → canvas reorder
    if (data.source === 'canvas') {
      setActivePageFields((prev) => {
        const activeParent = prev.find(
          (f) => f.type === 'group' && f.children?.some((c) => c.id === activeId),
        );
        const overParent = prev.find(
          (f) => f.type === 'group' && f.children?.some((c) => c.id === overId),
        );

        if (activeParent && activeParent.id === overParent?.id) {
          return prev.map((f) => {
            if (f.id !== activeParent.id || !f.children) return f;
            const oldIdx = f.children.findIndex((c) => c.id === activeId);
            const newIdx = f.children.findIndex((c) => c.id === overId);
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return f;
            return { ...f, children: arrayMove(f.children, oldIdx, newIdx) };
          });
        }

        if (!activeParent && !overParent) {
          const oldIndex = prev.findIndex((f) => f.id === activeId);
          const newIndex = prev.findIndex((f) => f.id === overId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
          return arrayMove(prev, oldIndex, newIndex);
        }

        return prev;
      });
    }
  }, [setActivePageFields]);

  // ── DragOverlay renderer ──────────────────────────────────────────────────────
  const renderOverlay = () => {
    if (!activeDrag) return null;

    if (activeDrag.source === 'panel') {
      return <PanelDragChip label={activeDrag.label} />;
    }

    const topLevel = activeFields.find((f) => f.id === activeDrag.fieldId);
    if (topLevel) return <CanvasFieldOverlay field={topLevel} />;

    for (const f of activeFields) {
      if (f.type === 'group' && f.children) {
        const child = f.children.find((c) => c.id === activeDrag.fieldId);
        if (child) return <CanvasFieldOverlay field={child} />;
      }
    }

    return null;
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) {
      alert('Необходимо указать название формы перед сохранением.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formTitle.trim(), pages);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось сохранить форму.');
    } finally {
      setIsSaving(false);
    }
  }, [formTitle, pages, onSave]);

  const handleAddPage = () => {
    const newPage: FormPageInstance = {
      id: crypto.randomUUID(),
      title: `Страница ${pages.length + 1}`,
      fields: [],
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageId(newPage.id);
  };

  const handleDeletePage = (pageId: string) => {
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const index = prev.findIndex((p) => p.id === pageId);
      if (index === -1) return prev;
      const next = prev.filter((p) => p.id !== pageId);
      if (pageId === activePageId && next.length > 0) {
        const newIndex = index > 0 ? index - 1 : 0;
        setActivePageId(next[newIndex].id);
      }
      return next;
    });
  };

  const handleTabEdit = (targetKey: string, action: 'add' | 'remove') => {
    if (action === 'add') {
      handleAddPage();
      return;
    }
    if (action === 'remove') {
      if (pages.length <= 1) return;
      handleDeletePage(targetKey);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          position: 'relative',
        }}
      >
        {/* ── Page header ── */}
        <div
          style={{
            background: 'var(--cds-layer-01)',
            borderBottom: '1px solid var(--cds-border-subtle)',
            padding: '12px 24px 16px',
            flexShrink: 0,
          }}
        >
          <Breadcrumb style={{ marginBottom: 8 }}>
            <BreadcrumbItem>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onBack();
                }}
              >
                Формы
              </a>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>{breadcrumbLabel}</BreadcrumbItem>
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
                hasIconOnly
                renderIcon={ArrowLeft}
                iconDescription="Вернуться к списку форм"
                onClick={onBack}
                size="md"
              />
              <h4 style={{ margin: 0 }}>{pageTitle}</h4>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                kind={isPreviewMode ? 'primary' : 'ghost'}
                hasIconOnly
                renderIcon={View}
                iconDescription={isPreviewMode ? 'К редактированию' : 'Предпросмотр'}
                onClick={() => setIsPreviewMode((prev) => !prev)}
                disabled={isSaving}
                size="md"
              />
              <Button
                kind="primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Сохранение...' : saveButtonLabel}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Content area: builder or inline preview ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {isPreviewMode ? (
            <InlinePreview formTitle={formTitle} pages={pages} />
          ) : (
            <>
              {/* Left — Tool Panel (also a drop zone) */}
              <ToolPanelDropZone
                isCanvasDragging={isCanvasDragging}
                width={toolboxWidth}
                onResizeStart={handleToolboxResizeStart}
              >
                <ToolPanel isCompact={toolboxWidth < 320} />
              </ToolPanelDropZone>

              {/* Right — Form Builder canvas */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  height: '100%',
                  padding: 20,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <FormTitleInput value={formTitle} onChange={setFormTitle} />
                <div style={{ marginBottom: 16 }} />

                {/* ── Custom page tabs ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid var(--cds-border-subtle)',
                    gap: 0,
                    flexWrap: 'wrap',
                  }}
                >
                  {pages.map((page, index) => {
                    const isActive = activePageId === page.id;
                    return (
                      <div
                        key={page.id}
                        onClick={() => setActivePageId(page.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 16px',
                          cursor: 'pointer',
                          borderBottom: isActive
                            ? '2px solid var(--cds-interactive)'
                            : '2px solid transparent',
                          marginBottom: -2,
                          color: isActive
                            ? 'var(--cds-text-primary)'
                            : 'var(--cds-text-secondary)',
                          fontWeight: isActive ? 600 : 400,
                          fontSize: '0.875rem',
                          userSelect: 'none',
                          transition: 'border-color 150ms, color 150ms',
                        }}
                      >
                        <span>Страница {index + 1}</span>
                        {pages.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePageId(page.id);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 20,
                              height: 20,
                              padding: 0,
                              border: 'none',
                              borderRadius: '50%',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: 'inherit',
                              fontSize: 14,
                              lineHeight: 1,
                            }}
                            aria-label={`Удалить страницу ${index + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <span
                    onClick={handleAddPage}
                    style={{
                      color: 'var(--cds-link-primary)',
                      cursor: 'pointer',
                      marginLeft: 8,
                      userSelect: 'none',
                      fontSize: 12,
                      padding: '8px 4px',
                    }}
                  >
                    Добавить страницу
                  </span>
                </div>

                <div style={{ marginBottom: 16 }} />
                <FormCanvas
                  fields={activeFields}
                  onFieldChange={handleFieldChange}
                  onFieldDelete={handleFieldDelete}
                  onGroupChildChange={handleGroupChildChange}
                  onGroupChildDelete={handleGroupChildDelete}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{renderOverlay()}</DragOverlay>

      {/* ── Delete page confirmation modal ── */}
      <Modal
        open={!!deletePageId}
        onRequestClose={() => setDeletePageId(null)}
        onRequestSubmit={() => {
          if (deletePageId) handleTabEdit(deletePageId, 'remove');
          setDeletePageId(null);
        }}
        modalHeading="Удалить страницу"
        primaryButtonText="Удалить"
        secondaryButtonText="Отменить"
        danger
        size="xs"
      >
        <p style={{ marginBottom: 16 }}>
          Вы уверены, что хотите удалить страницу? Это действие нельзя отменить.
        </p>
      </Modal>
    </DndContext>
  );
};
