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
}

export const DraggableFieldItem = ({
  fieldKey,
  label,
  iconName,
  iconColor,
  iconBackground,
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
      {...listeners}
      {...attributes}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 4px',
        cursor: isDragging ? 'grabbing' : 'grab',
        borderRadius: 4,
        background: isDragging
          ? 'var(--cds-highlight)'
          : hovered
            ? 'var(--cds-layer-hover)'
            : 'transparent',
        transition: 'background 150ms',
        userSelect: 'none',
        opacity: isDragging ? 0.35 : 1,
        touchAction: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          background: iconBackground ?? 'var(--cds-highlight)',
          borderRadius: 4,
          color: iconColor ?? 'var(--cds-link-primary)',
          flexShrink: 0,
        }}
      >
        <Icon icon={iconName} width={16} height={16} />
      </span>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
    </div>
  );
};
