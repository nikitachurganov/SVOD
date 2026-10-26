import { useState } from 'react';
import { Button, Modal, Switch } from 'antd';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DragHandle } from './DragHandle';
import { AutoGrowInput } from './AutoGrowInput';
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
  const isMobile = useMediaQuery('(max-width: 1055px)');

  const handleOptionsChange = (options: FieldOption[]) => {
    onChange({ options });
  };

  // «Текст без вопроса»: a heading and free text, nothing to answer
  const isTextBlock = field.type === 'textBlock';

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
        <AutoGrowInput
          placeholder={isTextBlock ? 'Заголовок (необязательно)' : 'Напишите название'}
          value={field.label}
          onChange={(next) => onChange({ label: next })}
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

        <AutoGrowInput
          placeholder={isTextBlock ? 'Текст, который увидит респондент' : 'Напишите описание'}
          value={field.description}
          multiline={isTextBlock}
          onChange={(next) => onChange({ description: next })}
          style={{
            padding: '0 4px',
            fontSize: isTextBlock ? '0.875rem' : '0.75rem',
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
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {isTextBlock ? (
            <span />
          ) : (
            <label
              htmlFor={`required-${field.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
            >
              <Switch
                id={`required-${field.id}`}
                size="small"
                checked={field.required}
                onChange={(checked) => onChange({ required: checked })}
              />
              {isMobile && 'Обязательный'}
            </label>
          )}

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
            size={isMobile ? 'middle' : 'small'}
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
