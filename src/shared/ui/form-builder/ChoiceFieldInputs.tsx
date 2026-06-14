import { Checkbox, Input, Radio } from 'antd';
import type { FieldOption } from '../../types/form-builder.types';
import {
  getOtherOption,
  hasOtherOption,
  parseCheckboxValue,
  parseRadioValue,
} from '../../utils/choiceField.utils';

interface RadioChoiceFieldProps {
  options: FieldOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

export const RadioChoiceField = ({ options, value, onChange }: RadioChoiceFieldProps) => {
  const parsed = parseRadioValue(value);
  const otherOption = getOtherOption(options);
  const showOtherInput = Boolean(otherOption && parsed.selected === otherOption.id);

  const select = (optionId: string) => {
    if (hasOtherOption(options)) {
      onChange({
        selected: optionId,
        otherText: optionId === otherOption?.id ? parsed.otherText : undefined,
      });
      return;
    }
    onChange(optionId);
  };

  const updateOtherText = (text: string) => {
    if (!otherOption) return;
    onChange({ selected: otherOption.id, otherText: text });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const checked = parsed.selected === opt.id;
        return (
          <div
            key={opt.id}
            onClick={() => select(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: `1px solid ${checked ? 'var(--app-primary)' : 'var(--app-border)'}`,
              borderRadius: 4,
              background: checked ? 'var(--app-highlight)' : 'var(--app-surface)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Radio checked={checked} value={opt.id} />
            </span>
            <span>{opt.label}</span>
          </div>
        );
      })}

      {showOtherInput && (
        <Input
          placeholder="Укажите свой вариант"
          value={parsed.otherText}
          onChange={(e) => updateOtherText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};

interface CheckboxChoiceFieldProps {
  options: FieldOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

export const CheckboxChoiceField = ({ options, value, onChange }: CheckboxChoiceFieldProps) => {
  const parsed = parseCheckboxValue(value);
  const otherOption = getOtherOption(options);
  const showOtherInput = Boolean(otherOption && parsed.selected.includes(otherOption.id));

  const toggle = (optionId: string) => {
    const nextSelected = parsed.selected.includes(optionId)
      ? parsed.selected.filter((item) => item !== optionId)
      : [...parsed.selected, optionId];

    if (hasOtherOption(options)) {
      onChange({
        selected: nextSelected,
        otherText: otherOption && nextSelected.includes(otherOption.id) ? parsed.otherText : undefined,
      });
      return;
    }
    onChange(nextSelected);
  };

  const updateOtherText = (text: string) => {
    if (!otherOption) return;
    onChange({ selected: parsed.selected, otherText: text });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const checked = parsed.selected.includes(opt.id);
        return (
          <div
            key={opt.id}
            onClick={() => toggle(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: `1px solid ${checked ? 'var(--app-primary)' : 'var(--app-border)'}`,
              borderRadius: 4,
              background: checked ? 'var(--app-highlight)' : 'var(--app-surface)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Checkbox checked={checked} />
            </span>
            <span>{opt.label}</span>
          </div>
        );
      })}

      {showOtherInput && (
        <Input
          placeholder="Укажите свой вариант"
          value={parsed.otherText}
          onChange={(e) => updateOtherText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
