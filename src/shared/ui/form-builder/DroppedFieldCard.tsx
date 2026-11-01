import { useContext, useLayoutEffect, useRef } from 'react';
import {
  DROP_SLOT_STYLE,
  PANEL_DROP_PLACEHOLDER_HEIGHT,
  PanelDropTargetContext,
} from './panelDropTarget';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FieldBlock } from './FieldBlock';
import { FieldRenderer } from './FieldRenderer';
import { GroupBlock } from './GroupBlock';
import {
  FIELD_TYPE_LABELS,
  type CanvasDragData,
  type FormFieldInstance,
} from '../../types/form-builder.types';
import { findFieldPlacement, getSiblingList } from '../../utils/fieldMove.utils';

interface DroppedFieldCardProps {
  field: FormFieldInstance;
  allFields: FormFieldInstance[];
  parentGroupId?: string | null;
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  onChildChange?: (childId: string, changes: Partial<FormFieldInstance>) => void;
  onChildDelete?: (childId: string) => void;
  onMoveUp?: (fieldId: string) => void;
  onMoveDown?: (fieldId: string) => void;
  /** Groups only, touch layout: open the toolbox to add a child to this group */
  onAddChild?: () => void;
}

// Arrow moves reorder the list instantly; cards slide to their new place only for a moment after
// an arrow press, so drag-and-drop (which has its own animation) and ordinary edits are untouched.
const MOVE_ANIMATION_MS = 250;
let moveAnimationArmed = false;
let moveAnimationTimer: ReturnType<typeof setTimeout> | undefined;

const armMoveAnimation = () => {
  moveAnimationArmed = true;
  clearTimeout(moveAnimationTimer);
  moveAnimationTimer = setTimeout(() => {
    moveAnimationArmed = false;
  }, 100);
};

export const DroppedFieldCard = ({
  field,
  allFields,
  parentGroupId = null,
  onChange,
  onDelete,
  onChildChange,
  onChildDelete,
  onMoveUp,
  onMoveDown,
  onAddChild,
}: DroppedFieldCardProps) => {
  const dragData: CanvasDragData = { source: 'canvas' };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: dragData,
  });

  const panelDropTargetId = useContext(PanelDropTargetContext);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastOffsetRef = useRef<number | null>(null);

  // Offset inside the parent list: unaffected by scrolling or by the parent group itself moving
  useLayoutEffect(() => {
    const el = cardRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const offset = el.getBoundingClientRect().top - parent.getBoundingClientRect().top;
    const previous = lastOffsetRef.current;
    lastOffsetRef.current = offset;
    if (!moveAnimationArmed || previous === null || Math.abs(previous - offset) < 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: `translateY(${previous - offset}px)` }, { transform: 'translateY(0)' }],
      { duration: MOVE_ANIMATION_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  });

  const moveUp = onMoveUp
    ? (id: string) => {
        armMoveAnimation();
        onMoveUp(id);
      }
    : undefined;
  const moveDown = onMoveDown
    ? (id: string) => {
        armMoveAnimation();
        onMoveDown(id);
      }
    : undefined;

  const dragHandleProps = {
    ...attributes,
    ...listeners,
  } as React.HTMLAttributes<HTMLDivElement>;

  const placement = findFieldPlacement(allFields, field.id);
  const siblings = getSiblingList(allFields, parentGroupId);
  const canMoveUp = Boolean(placement && placement.index > 0);
  const canMoveDown = Boolean(placement && placement.index < siblings.length - 1);

  return (
    <>
      <div
        ref={(node) => {
          cardRef.current = node;
          setNodeRef(node);
        }}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          // The card being moved leaves an empty slot, the same one a field from the panel gets
          ...(isDragging ? DROP_SLOT_STYLE : null),
          // Only the drag handle blocks touch scrolling (it sets touch-action itself)
        }}
      >
        <div style={{ visibility: isDragging ? 'hidden' : undefined }}>
          {field.type === 'group' ? (
            <GroupBlock
              field={field}
              allFields={allFields}
              onChange={onChange}
              onDelete={onDelete}
              onChildChange={onChildChange ?? (() => {})}
              onChildDelete={onChildDelete ?? (() => {})}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              dragHandleProps={dragHandleProps}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onAddChild={onAddChild}
            />
          ) : (
            <FieldBlock
              field={field}
              onChange={onChange}
              onDelete={onDelete}
              dragHandleProps={dragHandleProps}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={moveUp ? () => moveUp(field.id) : undefined}
              onMoveDown={moveDown ? () => moveDown(field.id) : undefined}
            />
          )}
        </div>
      </div>
      {panelDropTargetId === field.id && (
        <div
          aria-hidden
          style={{ ...DROP_SLOT_STYLE, height: PANEL_DROP_PLACEHOLDER_HEIGHT, flexShrink: 0 }}
        />
      )}
    </>
  );
};

interface CanvasFieldOverlayProps {
  field: FormFieldInstance;
}

export const CanvasFieldOverlay = ({ field }: CanvasFieldOverlayProps) => {
  return (
    <div
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-primary)',
        borderRadius: 4,
        // The overlay is rendered outside the app container, so it must set its own text colour
        color: 'var(--app-text)',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: 0.92,
      }}
    >
      <div>
        <span style={{ fontWeight: 600, fontSize: '1rem', display: 'block' }}>
          {field.label || 'Поле'}
        </span>
        <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.75rem' }}>
          {FIELD_TYPE_LABELS[field.type]}
        </span>
      </div>
      <FieldRenderer field={field} />
    </div>
  );
};
