import { Button, Segmented } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import type { QuoteTerm } from '../../types/billing';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  max: number;
  /** The least number of seats; the team cannot be made smaller than it already is */
  min?: number;
  disabled?: boolean;
}

/** «− 3 +»: the number of seats */
export const SeatStepper = ({ value, onChange, max, min = 1, disabled = false }: StepperProps) => (
  <div className="seat-stepper" role="group" aria-label="Количество мест">
    <Button
      size="small"
      shape="circle"
      icon={<MinusOutlined />}
      aria-label="Меньше мест"
      disabled={disabled || value <= min}
      onClick={() => onChange(value - 1)}
    />
    <span className="seat-stepper__value" aria-live="polite">
      {value}
    </span>
    <Button
      size="small"
      shape="circle"
      icon={<PlusOutlined />}
      aria-label="Больше мест"
      disabled={disabled || value >= max}
      onClick={() => onChange(value + 1)}
    />
  </div>
);

interface TermSwitchProps {
  value: QuoteTerm;
  onChange: (next: QuoteTerm) => void;
  disabled?: boolean;
}

export const TermSwitch = ({ value, onChange, disabled = false }: TermSwitchProps) => (
  <Segmented<QuoteTerm>
    size="small"
    value={value}
    disabled={disabled}
    onChange={onChange}
    options={[
      { label: 'Месяц', value: 'month' },
      { label: 'Год', value: 'year' },
    ]}
  />
);
