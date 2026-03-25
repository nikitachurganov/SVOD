import { useState } from 'react';
import { Button, Tag, Modal } from '@carbon/react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DragHandle } from './DragHandle';
import { DroppedFieldCard } from './DroppedFieldCard';
import {
  GROUP_CANVAS_PREFIX,
  type FormFieldInstance,
} from '../../types/form-builder.types';

interface GroupBlockProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  onChildChange: (childId: string, changes: Partial<FormFieldInstance>) => void;
  onChildDelete: (childId: string) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}

export const GroupBlock = ({
  field,
  onChange,
  onDelete,
  onChildChange,
  onChildDelete,
  dragHandleProps,
}: GroupBlockProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const children = field.children ?? [];

  const { setNodeRef, isOver } = useDroppable({
    id: `${GROUP_CANVAS_PREFIX}${field.id}`,
  });

  return (
    <div
      style={{
        background: 'var(--cds-layer-01)',
        border: '1px solid var(--cds-border-subtle)',
        borderRadius: 4,
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <DragHandle dragProps={dragHandleProps} />

      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ marginBottom: 8 }}>
          <Tag type="blue" size="sm" style={{ userSelect: 'none' }}>
            Группа полей
          </Tag>
        </div>

        <input
          placeholder="Название группы"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          style={{
            padding: '0 4px',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)',
            width: '100%',
            marginBottom: 2,
            border: 'none',
            outline: 'none',
            background: 'transparent',
          }}
        />

        <input
          placeholder="Напишите описание"
          value={field.description}
          onChange={(e) => onChange({ description: e.target.value })}
          style={{
            padding: '0 4px',
            fontSize: '0.75rem',
            color: 'var(--cds-text-secondary)',
            width: '100%',
            marginBottom: 12,
            border: 'none',
            outline: 'none',
            background: 'transparent',
          }}
        />

        <div
          ref={setNodeRef}
          style={{
            minHeight: 80,
            borderRadius: 4,
            border: `2px dashed ${isOver ? 'var(--cds-interactive)' : 'var(--cds-border-subtle)'}`,
            background: isOver ? 'var(--cds-highlight)' : 'var(--cds-background)',
            transition: 'border-color 250ms, background 250ms',
          }}
        >
          {children.length === 0 ? (
            <div
              style={{
                padding: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: 'var(--cds-text-secondary)', fontSize: 12 }}>
                Перетащите поле в группу
              </span>
            </div>
          ) : (
            <div
              style={{
                padding: '8px 8px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <SortableContext
                items={children.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {children.map((child) => (
                  <DroppedFieldCard
                    key={child.id}
                    field={child}
                    onChange={(changes) => onChildChange(child.id, changes)}
                    onDelete={() => onChildDelete(child.id)}
                  />
                ))}
              </SortableContext>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <Button
            kind="danger--ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            style={{ paddingInline: 0 }}
          >
            Удалить группу
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onRequestClose={() => setConfirmDelete(false)}
        onRequestSubmit={() => {
          onDelete();
          setConfirmDelete(false);
        }}
        modalHeading="Удалить группу?"
        primaryButtonText="Удалить"
        secondaryButtonText="Отмена"
        danger
        size="xs"
      />
    </div>
  );
};
