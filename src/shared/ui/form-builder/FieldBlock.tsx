import { useState } from 'react';
import { Button, Modal, Switch } from 'antd';
import { DragHandle } from './DragHandle';
import { FieldPreview } from './FieldPreview';
import { FieldTypeSettings } from './FieldTypeSettings';
import { FieldMoveControls } from './FieldMoveControls';
import type { FieldOption, FormFieldInstance } from '../../types/form-builder.types';
import type { FieldSiblingPosition } from '../../utils/fieldMove.utils';

interface FieldBlockProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  isDraggingOverlay?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  siblingPositions?: FieldSiblingPosition[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveBefore?: (beforeFieldId: string | null) => void;
}

export const FieldBlock = ({
  field,
  onChange,
  onDelete,
  dragHandleProps,
  isDraggingOverlay = false,
  canMoveUp = false,
  canMoveDown = false,
  siblingPositions = [],
  onMoveUp,
  onMoveDown,
  onMoveBefore,
}: FieldBlockProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleOptionsChange = (options: FieldOption[]) => {
    onChange({ options });
  };

  return (
    <div
      style={{
        background: 'var(--app-surface)',
        border: `1px solid ${isDraggingOverlay ? 'var(--app-primary)' : 'var(--app-border)'}`,
        borderRadius: 4,
        boxShadow: isDraggingOverlay ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
        overflow: 'hidden',
      }}
    >
      <DragHandle dragProps={dragHandleProps} />

      <div style={{ padding: '0px 16px 12px' }}>
        <input
          placeholder="Напишите название"
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

        <FieldPreview field={field} onOptionsChange={handleOptionsChange} />
        <FieldTypeSettings field={field} onChange={onChange} />

        <hr
          style={{
            border: 'none',
            borderTop: '1px solid var(--app-border)',
            margin: '14px 0 10px',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Switch
              id={`required-${field.id}`}
              size="small"
              checked={field.required}
              onChange={(checked) => onChange({ required: checked })}
            />
          </div>

          {onMoveUp && onMoveDown && onMoveBefore && (
            <FieldMoveControls
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              siblingPositions={siblingPositions}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onMoveBefore={onMoveBefore}
            />
          )}

          <Button
            type="text"
            danger
            size="small"
            onClick={() => setConfirmDelete(true)}
          >
            Удалить поле
          </Button>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        title="Удалить поле?"
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
