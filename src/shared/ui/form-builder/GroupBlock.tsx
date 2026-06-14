import { useState } from 'react';
import { Button, Tag, Modal } from 'antd';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DragHandle } from './DragHandle';
import { DroppedFieldCard } from './DroppedFieldCard';
import {
  GROUP_CANVAS_PREFIX,
  type FormFieldInstance,
} from '../../types/form-builder.types';
import { FieldMoveControls } from './FieldMoveControls';
import type { FieldSiblingPosition } from '../../utils/fieldMove.utils';

interface GroupBlockProps {
  field: FormFieldInstance;
  allFields: FormFieldInstance[];
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  onChildChange: (childId: string, changes: Partial<FormFieldInstance>) => void;
  onChildDelete: (childId: string) => void;
  onMoveUp?: (fieldId: string) => void;
  onMoveDown?: (fieldId: string) => void;
  onMoveBefore?: (fieldId: string, beforeFieldId: string | null) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  siblingPositions?: FieldSiblingPosition[];
}

export const GroupBlock = ({
  field,
  allFields,
  onChange,
  onDelete,
  onChildChange,
  onChildDelete,
  onMoveUp,
  onMoveDown,
  onMoveBefore,
  dragHandleProps,
  canMoveUp = false,
  canMoveDown = false,
  siblingPositions = [],
}: GroupBlockProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const children = field.children ?? [];

  const { setNodeRef, isOver } = useDroppable({
    id: `${GROUP_CANVAS_PREFIX}${field.id}`,
  });

  return (
    <div
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 4,
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <DragHandle dragProps={dragHandleProps} />

      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ marginBottom: 8 }}>
          <Tag color="blue" style={{ userSelect: 'none' }}>
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
            color: 'var(--app-text)',
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
            color: 'var(--app-text-secondary)',
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
            border: `2px dashed ${isOver ? 'var(--app-primary)' : 'var(--app-border)'}`,
            background: isOver ? 'var(--app-highlight)' : 'var(--app-bg)',
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
              <span style={{ color: 'var(--app-text-secondary)', fontSize: 12 }}>
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
                    allFields={allFields}
                    parentGroupId={field.id}
                    onChange={(changes) => onChildChange(child.id, changes)}
                    onDelete={() => onChildDelete(child.id)}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                    onMoveBefore={onMoveBefore}
                  />
                ))}
              </SortableContext>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
          }}
        >
          {onMoveUp && onMoveDown && onMoveBefore ? (
            <FieldMoveControls
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              siblingPositions={siblingPositions}
              onMoveUp={() => onMoveUp(field.id)}
              onMoveDown={() => onMoveDown(field.id)}
              onMoveBefore={(beforeFieldId) => onMoveBefore(field.id, beforeFieldId)}
            />
          ) : (
            <span />
          )}
          <Button
            type="text"
            danger
            size="small"
            onClick={() => setConfirmDelete(true)}
          >
            Удалить группу
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        title="Удалить группу?"
        okText="Удалить"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        onCancel={() => setConfirmDelete(false)}
        onOk={() => {
          onDelete();
          setConfirmDelete(false);
        }}
      />
    </div>
  );
};
