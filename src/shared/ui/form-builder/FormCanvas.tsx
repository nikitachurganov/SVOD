import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DroppedFieldCard } from './DroppedFieldCard';
import type { FormFieldInstance } from '../../types/form-builder.types';

export const CANVAS_DROPPABLE_ID = 'form-canvas' as const;

interface FormCanvasProps {
  fields: FormFieldInstance[];
  onFieldChange: (id: string, changes: Partial<FormFieldInstance>) => void;
  onFieldDelete: (id: string) => void;
  onGroupChildChange: (groupId: string, childId: string, changes: Partial<FormFieldInstance>) => void;
  onGroupChildDelete: (groupId: string, childId: string) => void;
  onFieldMoveUp: (fieldId: string) => void;
  onFieldMoveDown: (fieldId: string) => void;
  onFieldMoveBefore: (fieldId: string, beforeFieldId: string | null) => void;
}

export const FormCanvas = ({
  fields,
  onFieldChange,
  onFieldDelete,
  onGroupChildChange,
  onGroupChildDelete,
  onFieldMoveUp,
  onFieldMoveDown,
  onFieldMoveBefore,
}: FormCanvasProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROPPABLE_ID });

  const isEmpty = fields.length === 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minHeight: 240,
        borderRadius: 4,
        border: `2px dashed ${isOver ? 'var(--app-primary)' : isEmpty ? 'var(--app-border)' : 'transparent'}`,
        background: isOver ? 'var(--app-highlight)' : 'transparent',
        transition: 'border-color 250ms, background 250ms',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isEmpty ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'var(--app-text-secondary)', fontSize: 13 }}>
            Перетащите поле из панели или дважды кликните по элементу
          </span>
        </div>
      ) : (
        <div style={{ padding: '12px 12px 32px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {fields.map((field) => (
              <DroppedFieldCard
                key={field.id}
                field={field}
                allFields={fields}
                onChange={(changes) => onFieldChange(field.id, changes)}
                onDelete={() => onFieldDelete(field.id)}
                onChildChange={(childId, changes) =>
                  onGroupChildChange(field.id, childId, changes)
                }
                onChildDelete={(childId) => onGroupChildDelete(field.id, childId)}
                onMoveUp={onFieldMoveUp}
                onMoveDown={onFieldMoveDown}
                onMoveBefore={onFieldMoveBefore}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
};
