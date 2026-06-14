import { HolderOutlined } from '@ant-design/icons';

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
        color: 'var(--app-text-placeholder)',
        transition: 'color 150ms',
        touchAction: 'none',
        userSelect: 'none',
      }}
      aria-label="Перетащите для перемещения поля"
      title="Перетащите для перемещения"
    >
      <HolderOutlined style={{ fontSize: 20, transform: 'rotate(90deg)' }} />
    </div>
  );
};
