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

// ─── Sortable field card ─────────────────────────────────────────────────────

interface DroppedFieldCardProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  onChildChange?: (childId: string, changes: Partial<FormFieldInstance>) => void;
  onChildDelete?: (childId: string) => void;
}

export const DroppedFieldCard = ({
  field,
  onChange,
  onDelete,
  onChildChange,
  onChildDelete,
}: DroppedFieldCardProps) => {
  const dragData: CanvasDragData = { source: 'canvas' };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: dragData,
  });

  const dragHandleProps = {
    ...attributes,
    ...listeners,
  } as React.HTMLAttributes<HTMLDivElement>;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        touchAction: 'none',
      }}
    >
      {field.type === 'group' ? (
        <GroupBlock
          field={field}
          onChange={onChange}
          onDelete={onDelete}
          onChildChange={onChildChange ?? (() => {})}
          onChildDelete={onChildDelete ?? (() => {})}
          dragHandleProps={dragHandleProps}
        />
      ) : (
        <FieldBlock
          field={field}
          onChange={onChange}
          onDelete={onDelete}
          dragHandleProps={dragHandleProps}
        />
      )}
    </div>
  );
};

// ─── Drag overlay — shown while a canvas field is being reordered ────────────

interface CanvasFieldOverlayProps {
  field: FormFieldInstance;
}

export const CanvasFieldOverlay = ({ field }: CanvasFieldOverlayProps) => {
  return (
    <div
      style={{
        background: 'var(--cds-layer)',
        border: '1px solid var(--cds-interactive)',
        borderRadius: 4,
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
        <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem' }}>
          {FIELD_TYPE_LABELS[field.type]}
        </span>
      </div>
      <FieldRenderer field={field} />
    </div>
  );
};
