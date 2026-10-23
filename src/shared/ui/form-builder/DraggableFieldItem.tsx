import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Icon } from '@iconify/react';
import type { PanelDragData } from '../../types/form-builder.types';

export interface DraggableFieldItemProps {
  fieldKey: string;
  label: string;
  iconName: string;
  iconColor?: string;
  iconBackground?: string;
  onDoubleClickAdd?: (fieldKey: string) => void;
  /** Touch screens: a tap adds the field, there is no dragging out of the panel */
  tapToAdd?: boolean;
}

export const DraggableFieldItem = ({
  fieldKey,
  label,
  iconName,
  iconColor,
  iconBackground,
  onDoubleClickAdd,
  tapToAdd = false,
}: DraggableFieldItemProps) => {
  const [hovered, setHovered] = useState(false);

  const dragData: PanelDragData = { source: 'panel', fieldKey, label };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `panel-${fieldKey}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...(tapToAdd ? { role: 'button', tabIndex: 0 } : { ...listeners, ...attributes })}
      onClick={tapToAdd ? () => onDoubleClickAdd?.(fieldKey) : undefined}
      onKeyDown={
        tapToAdd
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDoubleClickAdd?.(fieldKey);
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: tapToAdd ? '10px 8px' : '6px 4px',
        minHeight: tapToAdd ? 44 : undefined,
        cursor: tapToAdd ? 'pointer' : isDragging ? 'grabbing' : 'grab',
        borderRadius: 4,
        background: isDragging
          ? 'var(--app-highlight)'
          : hovered
            ? 'var(--app-surface-hover)'
            : 'transparent',
        transition: 'background 150ms',
        userSelect: 'none',
        opacity: isDragging ? 0.35 : 1,
        touchAction: tapToAdd ? 'manipulation' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={tapToAdd ? undefined : () => onDoubleClickAdd?.(fieldKey)}
      title={tapToAdd ? 'Нажмите, чтобы добавить' : 'Перетащите или дважды кликните, чтобы добавить'}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          background: iconBackground ?? 'var(--app-highlight)',
          borderRadius: 4,
          color: iconColor ?? 'var(--app-link)',
          flexShrink: 0,
        }}
      >
        <Icon icon={iconName} width={16} height={16} />
      </span>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
    </div>
  );
};
