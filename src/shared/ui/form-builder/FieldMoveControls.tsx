import { useState } from 'react';
import { Button, Modal, Select } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SwapOutlined } from '@ant-design/icons';
import type { FieldSiblingPosition } from '../../utils/fieldMove.utils';

interface FieldMoveControlsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  siblingPositions: FieldSiblingPosition[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveBefore: (beforeFieldId: string | null) => void;
}

export const FieldMoveControls = ({
  canMoveUp,
  canMoveDown,
  siblingPositions,
  onMoveUp,
  onMoveDown,
  onMoveBefore,
}: FieldMoveControlsProps) => {
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();

  const handleMoveConfirm = () => {
    if (selectedTargetId === '__end__') {
      onMoveBefore(null);
    } else {
      const target = siblingPositions.find((item) => item.id === selectedTargetId);
      if (!target) return;
      onMoveBefore(target.id);
    }
    setMoveModalOpen(false);
    setSelectedTargetId(undefined);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button
          type="text"
          size="small"
          icon={<ArrowUpOutlined />}
          aria-label="Переместить вверх"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        />
        <Button
          type="text"
          size="small"
          icon={<ArrowDownOutlined />}
          aria-label="Переместить вниз"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        />
        <Button
          type="text"
          size="small"
          icon={<SwapOutlined />}
          aria-label="Переместить в выбранное место"
          disabled={siblingPositions.length === 0}
          onClick={() => setMoveModalOpen(true)}
        >
          Переместить
        </Button>
      </div>

      <Modal
        open={moveModalOpen}
        title="Переместить поле"
        okText="Переместить"
        cancelText="Отмена"
        onCancel={() => {
          setMoveModalOpen(false);
          setSelectedTargetId(undefined);
        }}
        onOk={handleMoveConfirm}
        okButtonProps={{ disabled: !selectedTargetId }}
      >
        <p style={{ marginBottom: 12, color: 'var(--app-text-secondary)' }}>
          Выберите поле, перед которым нужно разместить текущий элемент.
        </p>
        <Select
          placeholder="Выберите позицию"
          style={{ width: '100%' }}
          value={selectedTargetId}
          onChange={setSelectedTargetId}
          options={[
            ...siblingPositions.map((item) => ({
              value: item.id,
              label: `Перед «${item.label}»`,
            })),
            {
              value: '__end__',
              label: 'В конец списка',
            },
          ]}
        />
      </Modal>
    </>
  );
};
