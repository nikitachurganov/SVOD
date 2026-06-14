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
import {
  findFieldPlacement,
  getSiblingList,
  getSiblingPositions,
} from '../../utils/fieldMove.utils';

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
  onMoveBefore?: (fieldId: string, beforeFieldId: string | null) => void;
}

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
  onMoveBefore,
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

  const placement = findFieldPlacement(allFields, field.id);
  const siblings = getSiblingList(allFields, parentGroupId);
  const canMoveUp = Boolean(placement && placement.index > 0);
  const canMoveDown = Boolean(placement && placement.index < siblings.length - 1);
  const siblingPositions = getSiblingPositions(allFields, parentGroupId, field.id);

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
          allFields={allFields}
          onChange={onChange}
          onDelete={onDelete}
          onChildChange={onChildChange ?? (() => {})}
          onChildDelete={onChildDelete ?? (() => {})}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onMoveBefore={onMoveBefore}
          dragHandleProps={dragHandleProps}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          siblingPositions={siblingPositions}
        />
      ) : (
        <FieldBlock
          field={field}
          onChange={onChange}
          onDelete={onDelete}
          dragHandleProps={dragHandleProps}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          siblingPositions={siblingPositions}
          onMoveUp={onMoveUp ? () => onMoveUp(field.id) : undefined}
          onMoveDown={onMoveDown ? () => onMoveDown(field.id) : undefined}
          onMoveBefore={
            onMoveBefore ? (beforeFieldId) => onMoveBefore(field.id, beforeFieldId) : undefined
          }
        />
      )}
    </div>
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
