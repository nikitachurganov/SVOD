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
}

export const FormCanvas = ({
  fields,
  onFieldChange,
  onFieldDelete,
  onGroupChildChange,
  onGroupChildDelete,
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
        border: `2px dashed ${isOver ? 'var(--cds-interactive)' : isEmpty ? 'var(--cds-border-subtle)' : 'transparent'}`,
        background: isOver ? 'var(--cds-highlight)' : 'transparent',
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
          <span style={{ color: 'var(--cds-text-secondary)', fontSize: 13 }}>
            Перетащите поле из панели инструментов
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
                onChange={(changes) => onFieldChange(field.id, changes)}
                onDelete={() => onFieldDelete(field.id)}
                onChildChange={(childId, changes) =>
                  onGroupChildChange(field.id, childId, changes)
                }
                onChildDelete={(childId) => onGroupChildDelete(field.id, childId)}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
};
