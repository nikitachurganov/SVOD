import { useState } from 'react';
import { Button, Toggle, Modal } from '@carbon/react';
import { DragHandle } from './DragHandle';
import { FieldPreview } from './FieldPreview';
import type { FieldOption, FormFieldInstance } from '../../types/form-builder.types';

interface FieldBlockProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  isDraggingOverlay?: boolean;
}

export const FieldBlock = ({
  field,
  onChange,
  onDelete,
  dragHandleProps,
  isDraggingOverlay = false,
}: FieldBlockProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleOptionsChange = (options: FieldOption[]) => {
    onChange({ options });
  };

  return (
    <div
      style={{
        background: 'var(--cds-layer-01)',
        border: `1px solid ${isDraggingOverlay ? 'var(--cds-interactive)' : 'var(--cds-border-subtle)'}`,
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

        <FieldPreview field={field} onOptionsChange={handleOptionsChange} />

        <hr
          style={{
            border: 'none',
            borderTop: '1px solid var(--cds-border-subtle)',
            margin: '14px 0 10px',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Toggle
              id={`required-${field.id}`}
              size="sm"
              labelText="Обязательно для заполнения"
              hideLabel
              toggled={field.required}
              onToggle={(checked: boolean) => onChange({ required: checked })}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              Обязательно для заполнения
            </span>
          </div>

          <Button
            kind="danger--ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            style={{ paddingInline: 0 }}
          >
            Удалить поле
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
        modalHeading="Удалить поле?"
        primaryButtonText="Удалить"
        secondaryButtonText="Отмена"
        danger
        size="xs"
      />
    </div>
  );
};
