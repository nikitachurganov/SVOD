import { Icon } from '@iconify/react';

interface DragHandleProps {
  dragProps: React.HTMLAttributes<HTMLDivElement>;
}

export const DragHandle = ({ dragProps }: DragHandleProps) => {
  return (
    <div
      {...dragProps}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 24,
        cursor: 'grab',
        color: 'var(--cds-text-placeholder)',
        transition: 'color 150ms',
        touchAction: 'none',
        userSelect: 'none',
      }}
      aria-label="Переместить поле"
    >
      <div style={{ transform: 'rotate(90deg)' }}>
        <Icon icon="material-symbols:drag-indicator" width={20} height={20} />
      </div>
    </div>
  );
};
