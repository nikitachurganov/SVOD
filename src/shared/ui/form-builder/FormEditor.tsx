import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Drawer, Modal, notification } from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
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
import { IconDefaultButton } from '../IconDefaultButton';
import { FormCanvas } from './FormCanvas';
import { AutoGrowInput } from './AutoGrowInput';
import { AiFormBuilderPanel, type ChatEntry, type MethodologyState } from './AiFormBuilderPanel';
import { CanvasFieldOverlay } from './DroppedFieldCard';
import { useFormStore } from '../../hooks/useFormStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { collectFieldIds } from '../../formily/collectFieldIds';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../form-fill/FormFillRenderer';
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
import { getDefaultFieldConfig } from '../../utils/fieldConfig';
import { moveFieldBeforeTarget, moveFieldByOffset } from '../../utils/fieldMove.utils';

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FormEditorProps {
  pageTitle: string;
  saveButtonLabel?: string;
  initialTitle?: string;
  initialPages?: FormPageInstance[];
  initialFields?: FormFieldInstance[];
  onSave: (
    title: string,
    pages: FormPageInstance[],
    methodology?: MethodologyState,
  ) => Promise<void>;
  onBack: () => void;
  /** 'survey' switches the AI builder to methodology-aware survey generation */
  mode?: 'form' | 'survey';
  initialMethodology?: MethodologyState;
}

// ─── FormTitleInput ───────────────────────────────────────────────────────────

interface FormTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  placeholder?: string;
}

const FormTitleInput = ({
  value,
  onChange,
  error,
  placeholder = 'Название формы',
}: FormTitleInputProps) => {
  return (
    <div>
      <AutoGrowInput
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        style={{
          padding: 0,
          fontSize: '1.25rem',
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'var(--app-text)',
          background: 'transparent',
          width: '100%',
          border: 'none',
          outline: 'none',
        }}
      />
      {error ? (
        <div
          style={{
            color: 'var(--app-text-error)',
            fontSize: '0.75rem',
            marginTop: 4,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
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
        background: 'var(--app-surface)',
        border: '1px solid var(--app-primary)',
        borderRadius: 8,
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        color: 'var(--app-primary)',
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

interface PendingDeletion {
  field: FormFieldInstance;
  pageId: string;
  parentGroupId: string | null;
  index: number;
  expiresAt: number;
  timeoutId: number;
}

// ─── Tool-panel drop zone ─────────────────────────────────────────────────────

export const TOOL_PANEL_DROP_ID = 'tool-panel';

const DELETION_NOTIFICATION_KEY = 'form-editor-deletion-undo';

/** Where the app shell collapses its sidebar the builder also goes single-column (bottom sheet + drawer) */
const MOBILE_QUERY = '(max-width: 1055px)';

/** The AI chat opens by default only where there is room for it next to the toolbox and canvas */
const AI_PANEL_DEFAULT_QUERY = '(min-width: 1280px)';

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
          borderRight: deleteMode
            ? '2px dashed var(--app-error)'
            : '1px solid var(--app-border)',
          background: deleteMode
            ? 'color-mix(in srgb, var(--app-error) 10%, var(--app-surface))'
            : 'var(--app-surface)',
          transition: 'background 150ms ease, border-color 150ms ease, border-width 150ms ease',
          overflow: deleteMode ? 'hidden' : 'auto',
        }}
      >
        {deleteMode ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 32px',
            }}
          >
            <DeleteOutlined style={{ fontSize: 32, color: 'var(--app-error)' }} />
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
  config: getDefaultFieldConfig(type),
});

// ─── Inline preview panel (multi-page) ───────────────────────────────────────

const cloneField = (field: FormFieldInstance): FormFieldInstance => {
  if (typeof structuredClone === 'function') {
    return structuredClone(field);
  }
  return JSON.parse(JSON.stringify(field)) as FormFieldInstance;
};

type FieldLocation =
  | { parentGroupId: null; index: number; field: FormFieldInstance }
  | { parentGroupId: string; index: number; field: FormFieldInstance };

const findFieldLocation = (
  fields: FormFieldInstance[],
  fieldId: string,
): FieldLocation | null => {
  const topIndex = fields.findIndex((field) => field.id === fieldId);
  if (topIndex !== -1) {
    return { parentGroupId: null, index: topIndex, field: fields[topIndex] };
  }

  for (const field of fields) {
    if (field.type !== 'group' || !field.children) continue;
    const childIndex = field.children.findIndex((child) => child.id === fieldId);
    if (childIndex !== -1) {
      return {
        parentGroupId: field.id,
        index: childIndex,
        field: field.children[childIndex],
      };
    }
  }

  return null;
};

interface InlinePreviewProps {
  formTitle: string;
  pages: FormPageInstance[];
  compact?: boolean;
}

const InlinePreview = ({ formTitle, pages, compact = false }: InlinePreviewProps) => {
  const store = useFormStore();
  const fillRef = useRef<FormFillRendererHandle>(null);
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
      await fillRef.current?.validateFields(ids);
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
      await fillRef.current?.validateFields();
      setIsSubmitting(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      fillRef.current?.resetFields();
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
        background: 'var(--app-bg)',
        padding: compact ? 16 : 24,
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {formTitle && (
          <h4 style={{ marginBottom: 24 }}>{formTitle}</h4>
        )}

        {hasPages && currentPage && currentPage.fields.length > 0 ? (
          <>
            <FormFillRenderer
              ref={fillRef}
              pages={pages}
              pageIndex={pageIndex}
              legacyStore={store}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 24,
              }}
            >
              {!isFirst && (
                <Button size="large" onClick={handleBack}>
                  Назад
                </Button>
              )}
              {!isLast && (
                <Button
                  size="large"
                  type="primary"
                  onClick={handleNext}
                  style={{ marginLeft: 'auto', minWidth: 140 }}
                >
                  Далее
                </Button>
              )}
              {isLast && (
                <Button
                  size="large"
                  type="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  style={{ marginLeft: 'auto', minWidth: 140 }}
                >
                  {isSubmitting ? 'Отправка...' : 'Отправить'}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <span style={{ color: 'var(--app-text-secondary)' }}>
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
  pageTitle,
  saveButtonLabel = 'Сохранить',
  initialTitle = '',
  initialPages,
  initialFields = [],
  onSave,
  onBack,
  mode = 'form',
  initialMethodology,
}: FormEditorProps) => {
  const isSurvey = mode === 'survey';
  const entityName = isSurvey ? 'опроса' : 'формы';
  const [methodology, setMethodology] = useState<MethodologyState>(
    initialMethodology ?? { meta: null, summary: null },
  );
  // AI chat history is kept here: the panel unmounts in preview mode and when it is closed
  const [aiEntries, setAiEntries] = useState<ChatEntry[]>([]);
  const [aiDraft, setAiDraft] = useState('');
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [undoNow, setUndoNow] = useState(() => Date.now());
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // Narrow screens get the AI chat as a full-screen drawer that starts closed
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(() => window.matchMedia(AI_PANEL_DEFAULT_QUERY).matches);
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);
  // Set while the bottom sheet is adding a child into a group instead of a page-level field
  const [toolboxGroupId, setToolboxGroupId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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
  const activeFields = useMemo<FormFieldInstance[]>(
    () => activePage?.fields ?? [],
    [activePage],
  );

  useEffect(() => {
    if (!pendingDeletion) return;
    const intervalId = window.setInterval(() => {
      setUndoNow(Date.now());
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [pendingDeletion]);

  useEffect(() => {
    return () => {
      if (pendingDeletion) {
        window.clearTimeout(pendingDeletion.timeoutId);
      }
    };
  }, [pendingDeletion]);

  const clearPendingDeletion = useCallback(() => {
    setPendingDeletion((prev) => {
      if (prev) window.clearTimeout(prev.timeoutId);
      return null;
    });
  }, []);

  const queueDeletionUndo = useCallback(
    ({
      field,
      parentGroupId,
      index,
    }: {
      field: FormFieldInstance;
      parentGroupId: string | null;
      index: number;
    }) => {
      setPendingDeletion((prev) => {
        if (prev) {
          window.clearTimeout(prev.timeoutId);
        }

        const expiresAt = Date.now() + 5000;
        const timeoutId = window.setTimeout(() => {
          setPendingDeletion((current) =>
            current && current.expiresAt === expiresAt ? null : current,
          );
        }, 5000);

        return {
          field: cloneField(field),
          pageId: activePageId,
          parentGroupId,
          index,
          expiresAt,
          timeoutId,
        };
      });
    },
    [activePageId],
  );

  const handleUndoDelete = useCallback(() => {
    setPendingDeletion((prev) => {
      if (!prev) return null;
      window.clearTimeout(prev.timeoutId);

      setPages((pageList) =>
        pageList.map((page) => {
          if (page.id !== prev.pageId) return page;

          if (prev.parentGroupId === null) {
            const nextFields = [...page.fields];
            const targetIndex = Math.min(Math.max(prev.index, 0), nextFields.length);
            nextFields.splice(targetIndex, 0, cloneField(prev.field));
            return { ...page, fields: nextFields };
          }

          return {
            ...page,
            fields: page.fields.map((field) => {
              if (field.id !== prev.parentGroupId || !field.children) return field;
              const nextChildren = [...field.children];
              const targetIndex = Math.min(Math.max(prev.index, 0), nextChildren.length);
              nextChildren.splice(targetIndex, 0, cloneField(prev.field));
              return { ...field, children: nextChildren };
            }),
          };
        }),
      );

      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingDeletion) {
      notification.destroy(DELETION_NOTIFICATION_KEY);
      return;
    }

    const secondsLeft = Math.max(
      1,
      Math.ceil((pendingDeletion.expiresAt - undoNow) / 1000),
    );

    notification.warning({
      key: DELETION_NOTIFICATION_KEY,
      message: 'Элемент удален',
      description: `Можно вернуть в течение ${secondsLeft} сек.`,
      duration: 0,
      placement: 'bottomRight',
      onClose: clearPendingDeletion,
      btn: (
        <Button size="small" onClick={handleUndoDelete}>
          Вернуть
        </Button>
      ),
    });
  }, [pendingDeletion, undoNow, clearPendingDeletion, handleUndoDelete]);

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
    const location = findFieldLocation(activeFields, id);
    if (location) {
      queueDeletionUndo(location);
    }
    setActivePageFields((prev) => prev.filter((f) => f.id !== id));
  }, [activeFields, queueDeletionUndo, setActivePageFields]);

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
      const group = activeFields.find((field) => field.id === groupId);
      const index = group?.children?.findIndex((child) => child.id === childId) ?? -1;
      const field = index !== -1 && group?.children ? group.children[index] : null;
      if (field && index !== -1) {
        queueDeletionUndo({
          field,
          parentGroupId: groupId,
          index,
        });
      }

      setActivePageFields((prev) =>
        prev.map((f) =>
          f.id === groupId && f.children
            ? { ...f, children: f.children.filter((c) => c.id !== childId) }
            : f,
        ),
      );
    },
    [activeFields, queueDeletionUndo, setActivePageFields],
  );

  const addFieldFromPanel = useCallback(
    (fieldKey: string) => {
      const fieldType = PANEL_KEY_TO_FIELD_TYPE[fieldKey];
      if (!fieldType) return;
      const newField = createField(fieldType);
      if (isMobile && toolboxGroupId) {
        if (fieldType === 'group') return; // groups do not nest
        setActivePageFields((prev) =>
          prev.map((f) =>
            f.id === toolboxGroupId ? { ...f, children: [...(f.children ?? []), newField] } : f,
          ),
        );
      } else {
        setActivePageFields((prev) => [...prev, newField]);
      }
      if (isMobile) {
        // Close the sheet; a page-level field lands at the end, so scroll down to it
        const toGroup = Boolean(toolboxGroupId);
        setIsToolboxOpen(false);
        setToolboxGroupId(null);
        if (!toGroup) {
          window.setTimeout(() => {
            canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: 'smooth' });
          }, 150);
        }
      }
    },
    [setActivePageFields, isMobile, toolboxGroupId],
  );

  const handleFieldMoveUp = useCallback(
    (fieldId: string) => {
      setActivePageFields((prev) => moveFieldByOffset(prev, fieldId, -1));
    },
    [setActivePageFields],
  );

  const handleFieldMoveDown = useCallback(
    (fieldId: string) => {
      setActivePageFields((prev) => moveFieldByOffset(prev, fieldId, 1));
    },
    [setActivePageFields],
  );

  const handleFieldMoveBefore = useCallback(
    (fieldId: string, beforeFieldId: string | null) => {
      setActivePageFields((prev) => moveFieldBeforeTarget(prev, fieldId, beforeFieldId));
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
      const location = findFieldLocation(activeFields, activeId);
      if (location) {
        queueDeletionUndo(location);
      }
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
  }, [activeFields, queueDeletionUndo, setActivePageFields]);

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
      setTitleError(`Укажите название ${entityName}`);
      return;
    }

    setTitleError(null);

    const totalFields = pages.reduce((count, page) => {
      return count + page.fields.reduce((c, field) => {
        if (field.type === 'group') return c + (field.children?.length ?? 0);
        return c + 1;
      }, 0);
    }, 0);

    if (totalFields === 0) {
      setSaveError(isSurvey ? 'Добавьте хотя бы один вопрос.' : 'Добавьте хотя бы один элемент формы.');
      return;
    }

    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave(formTitle.trim(), pages, isSurvey ? methodology : undefined);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : `Не удалось сохранить ${isSurvey ? 'опрос' : 'форму'}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [formTitle, pages, onSave, isSurvey, methodology, entityName]);

  // ── AI builder ───────────────────────────────────────────────────────────────
  const replaceFormState = useCallback(
    (nextTitle: string | null, nextPages: FormPageInstance[]) => {
      clearPendingDeletion();
      if (nextTitle !== null) {
        setFormTitle(nextTitle);
        if (nextTitle.trim()) setTitleError(null);
      }
      const safePages: FormPageInstance[] = nextPages.length
        ? nextPages
        : [{ id: crypto.randomUUID(), title: 'Страница 1', fields: [] }];
      setPages(safePages);
      setActivePageId((prevId) =>
        safePages.some((p) => p.id === prevId) ? prevId : safePages[0].id,
      );
      setSaveError(null);
    },
    [clearPendingDeletion],
  );

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
        className="app-form-editor"
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          position: 'relative',
          background: 'var(--app-bg)',
          color: 'var(--app-text)',
        }}
      >
        {/* ── Page header ── */}
        <div
          style={{
            background: 'var(--app-surface)',
            borderBottom: '1px solid var(--app-border)',
            padding: isMobile ? '8px 12px' : '12px 24px 16px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 12, minWidth: 0 }}
            >
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                aria-label={isSurvey ? 'Вернуться к списку опросов' : 'Вернуться к списку форм'}
                onClick={onBack}
              />
              <h4
                style={{
                  margin: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pageTitle}
              </h4>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {!isPreviewMode && (
                <Button
                  icon={<RobotOutlined />}
                  data-tour="ai-builder"
                  aria-pressed={isAiPanelOpen}
                  aria-label="ИИ-конструктор"
                  type={isAiPanelOpen && !isMobile ? 'default' : 'text'}
                  onClick={() => setIsAiPanelOpen((prev) => !prev)}
                  disabled={isSaving}
                >
                  {isMobile ? null : 'ИИ-конструктор'}
                </Button>
              )}
              <IconDefaultButton
                size="middle"
                icon={<EyeOutlined />}
                aria-label={isPreviewMode ? 'К редактированию' : 'Предпросмотр'}
                aria-pressed={isPreviewMode}
                onClick={() => setIsPreviewMode((prev) => !prev)}
                disabled={isSaving}
              />
              {pendingDeletion && !isMobile && (
                <Button
                  type="text"
                  onClick={handleUndoDelete}
                  disabled={isSaving}
                >
                  Вернуть удаленный элемент
                </Button>
              )}
              <Button
                type="primary"
                data-tour="save-survey"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Сохранение...' : saveButtonLabel}
              </Button>
            </div>
          </div>
        </div>

        {saveError && (
          <Alert
            type="error"
            message={saveError}
            closable
            onClose={() => setSaveError(null)}
            style={{ marginBottom: 0 }}
          />
        )}

        {/* ── Content area: builder or inline preview ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {isPreviewMode ? (
            <InlinePreview formTitle={formTitle} pages={pages} compact={isMobile} />
          ) : (
            <>
              {/* Left — Tool Panel (also a drop zone); on a phone it is a bottom sheet instead */}
              {!isMobile && (
                <ToolPanelDropZone
                  isCanvasDragging={isCanvasDragging}
                  width={toolboxWidth}
                  onResizeStart={handleToolboxResizeStart}
                >
                  <ToolPanel
                    isCompact={toolboxWidth < 320}
                    onFieldAdd={addFieldFromPanel}
                    allowTextBlock={isSurvey}
                  />
                </ToolPanelDropZone>
              )}

              {/* Right — Form Builder canvas */}
              <div
                ref={canvasRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  height: '100%',
                  padding: isMobile ? 12 : 20,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--app-bg)',
                  color: 'var(--app-text)',
                }}
              >
                <FormTitleInput
                  placeholder={isSurvey ? 'Название опроса' : 'Название формы'}
                  value={formTitle}
                  onChange={(next) => {
                    setFormTitle(next);
                    if (titleError && next.trim()) {
                      setTitleError(null);
                    }
                  }}
                  error={titleError}
                />
                <div style={{ marginBottom: 16 }} />

                {/* ── Custom page tabs ── */}
                <div
                  className="form-editor__pages"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid var(--app-border)',
                    gap: 0,
                    flexWrap: isMobile ? 'nowrap' : 'wrap',
                    // Many pages scroll sideways on a phone instead of stacking in rows
                    overflowX: isMobile ? 'auto' : undefined,
                    overflowY: isMobile ? 'hidden' : undefined,
                    flexShrink: 0,
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
                          padding: isMobile ? '10px 12px' : '8px 16px',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          borderBottom: isActive
                            ? '2px solid var(--app-primary)'
                            : '2px solid transparent',
                          marginBottom: -2,
                          color: isActive
                            ? 'var(--app-text)'
                            : 'var(--app-text-secondary)',
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
                              width: isMobile ? 28 : 20,
                              height: isMobile ? 28 : 20,
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
                      color: 'var(--app-link)',
                      cursor: 'pointer',
                      marginLeft: 8,
                      userSelect: 'none',
                      fontSize: 12,
                      padding: isMobile ? '10px 8px' : '8px 4px',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
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
                  onFieldMoveUp={handleFieldMoveUp}
                  onFieldMoveDown={handleFieldMoveDown}
                  onFieldMoveBefore={handleFieldMoveBefore}
                  onAddToGroup={
                    isMobile
                      ? (groupId) => {
                          setToolboxGroupId(groupId);
                          setIsToolboxOpen(true);
                        }
                      : undefined
                  }
                />
              </div>

              {/* Phone: the toolbox lives in a bottom sheet opened from this bar */}
              {isMobile && (
                <div
                  style={{
                    flexShrink: 0,
                    padding: '8px 12px calc(8px + env(safe-area-inset-bottom))',
                    background: 'var(--app-surface)',
                    borderTop: '1px solid var(--app-border)',
                  }}
                >
                  <Button
                    block
                    size="large"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setToolboxGroupId(null);
                      setIsToolboxOpen(true);
                    }}
                  >
                    Добавить {isSurvey ? 'вопрос' : 'поле'}
                  </Button>
                </div>
              )}

              {/* Far right — AI builder chat */}
              {isAiPanelOpen && !isMobile && (
                <AiFormBuilderPanel
                  formTitle={formTitle}
                  pages={pages}
                  entries={aiEntries}
                  onEntriesChange={setAiEntries}
                  draft={aiDraft}
                  onDraftChange={setAiDraft}
                  onApply={replaceFormState}
                  onRestore={(title, restoredPages, restoredMethodology) => {
                    replaceFormState(title, restoredPages);
                    if (isSurvey && restoredMethodology) setMethodology(restoredMethodology);
                  }}
                  onClose={() => setIsAiPanelOpen(false)}
                  mode={mode}
                  methodology={methodology}
                  onMethodologyChange={setMethodology}
                />
              )}
            </>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{renderOverlay()}</DragOverlay>

      {isMobile && (
        <>
          <Drawer
            open={isToolboxOpen}
            placement="bottom"
            height="80%"
            title={
              toolboxGroupId
                ? 'Добавить в группу'
                : isSurvey
                  ? 'Добавить вопрос'
                  : 'Добавить поле'
            }
            onClose={() => {
              setIsToolboxOpen(false);
              setToolboxGroupId(null);
            }}
            styles={{ body: { padding: 0 } }}
          >
            <ToolPanel tapToAdd onFieldAdd={addFieldFromPanel} allowTextBlock={isSurvey} />
          </Drawer>

          <Drawer
            open={isAiPanelOpen && !isPreviewMode}
            placement="right"
            width="100%"
            closable={false}
            onClose={() => setIsAiPanelOpen(false)}
            styles={{ body: { padding: 0 } }}
          >
            <AiFormBuilderPanel
              width="100%"
              formTitle={formTitle}
              pages={pages}
              entries={aiEntries}
              onEntriesChange={setAiEntries}
              draft={aiDraft}
              onDraftChange={setAiDraft}
              onApply={replaceFormState}
              onRestore={(title, restoredPages, restoredMethodology) => {
                replaceFormState(title, restoredPages);
                if (isSurvey && restoredMethodology) setMethodology(restoredMethodology);
              }}
              onClose={() => setIsAiPanelOpen(false)}
              mode={mode}
              methodology={methodology}
              onMethodologyChange={setMethodology}
            />
          </Drawer>
        </>
      )}

      {/* ── Delete page confirmation modal ── */}
      <Modal
        open={!!deletePageId}
        title="Удалить страницу"
        okText="Удалить"
        cancelText="Отменить"
        okButtonProps={{ danger: true }}
        onCancel={() => setDeletePageId(null)}
        onOk={() => {
          if (deletePageId) handleTabEdit(deletePageId, 'remove');
          setDeletePageId(null);
        }}
      >
        <p style={{ marginBottom: 16 }}>
          Вы уверены, что хотите удалить страницу? Это действие нельзя отменить.
        </p>
      </Modal>
    </DndContext>
  );
};
