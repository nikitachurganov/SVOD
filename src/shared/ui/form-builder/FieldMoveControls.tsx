import { Button } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface FieldMoveControlsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const FieldMoveControls = ({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: FieldMoveControlsProps) => {
  // Bigger tap targets on a phone
  const buttonSize = useMediaQuery('(max-width: 1055px)') ? 'middle' : 'small';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Button
        type="text"
        size={buttonSize}
        icon={<ArrowUpOutlined />}
        aria-label="Переместить вверх"
        disabled={!canMoveUp}
        onClick={onMoveUp}
      />
      <Button
        type="text"
        size={buttonSize}
        icon={<ArrowDownOutlined />}
        aria-label="Переместить вниз"
        disabled={!canMoveDown}
        onClick={onMoveDown}
      />
    </div>
  );
};
