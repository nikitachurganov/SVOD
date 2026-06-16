import { Checkbox, Input, Radio, type InputRef } from 'antd';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FieldOption } from '../../types/form-builder.types';
import {
  getOtherOption,
  hasOtherOption,
  parseCheckboxValue,
  parseRadioValue,
} from '../../utils/choiceField.utils';

interface ChoiceFieldErrorProps {
  error?: string;
  otherError?: string;
}

interface RadioChoiceFieldProps extends ChoiceFieldErrorProps {
  options: FieldOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

interface CheckboxChoiceFieldProps extends ChoiceFieldErrorProps {
  options: FieldOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

interface ChoiceOptionCardProps {
  control: ReactNode;
  label: string;
  isSelected?: boolean;
  isOther?: boolean;
  isOtherActive?: boolean;
  otherText?: string;
  otherError?: string;
  otherInputRef?: React.RefObject<InputRef | null>;
  onActivate: () => void;
  onOtherTextChange?: (text: string) => void;
}

const sortOptionsWithOtherLast = (options: FieldOption[]): FieldOption[] => {
  const copy = [...options];
  copy.sort((a, b) => {
    if (a.isOther && !b.isOther) return 1;
    if (!a.isOther && b.isOther) return -1;
    return 0;
  });
  return copy;
};

const ChoiceOptionCard = ({
  control,
  label,
  isSelected = false,
  isOther = false,
  isOtherActive = false,
  otherText = '',
  otherError,
  otherInputRef,
  onActivate,
  onOtherTextChange,
}: ChoiceOptionCardProps) => {
  const showInlineOtherInput = isOther && isOtherActive;

  return (
    <div
      className={[
        'app-choice-field__card',
        isSelected ? 'app-choice-field__card--selected' : '',
        isOther ? 'app-choice-field__card--other' : '',
        isOtherActive ? 'app-choice-field__card--other-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="app-choice-field__row"
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className="app-choice-field__control" aria-hidden>
          {control}
        </span>

        {showInlineOtherInput ? (
          <Input
            ref={otherInputRef}
            variant="borderless"
            className={[
              'app-choice-field__other-input',
              otherText ? '' : 'app-choice-field__other-input--empty',
            ]
              .filter(Boolean)
              .join(' ')}
            placeholder="Укажите свой вариант"
            value={otherText}
            onChange={(event) => {
              event.stopPropagation();
              onOtherTextChange?.(event.target.value);
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="app-choice-field__label">{label}</span>
        )}
      </div>

      {showInlineOtherInput && otherError ? (
        <div className="app-choice-field__other-error">{otherError}</div>
      ) : null}
    </div>
  );
};

export const RadioChoiceField = ({
  options,
  value,
  onChange,
  error,
  otherError,
}: RadioChoiceFieldProps) => {
  const sortedOptions = useMemo(() => sortOptionsWithOtherLast(options), [options]);
  const parsed = parseRadioValue(value);
  const otherOption = getOtherOption(sortedOptions);
  const isOtherSelected = Boolean(otherOption && parsed.selected === otherOption.id);

  const [otherText, setOtherText] = useState(parsed.otherText);
  const otherInputRef = useRef<InputRef | null>(null);
  const renderedOtherText = isOtherSelected ? parsed.otherText : otherText;

  useEffect(() => {
    if (!isOtherSelected) return;
    const id = requestAnimationFrame(() => otherInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOtherSelected]);

  const select = (optionId: string) => {
    if (!hasOtherOption(sortedOptions)) {
      onChange(optionId);
      return;
    }

    if (optionId === otherOption?.id) {
      onChange({ selected: optionId, otherText });
      return;
    }

    onChange({ selected: optionId, otherText: undefined });
  };

  const updateOtherText = (text: string) => {
    if (!otherOption) return;
    setOtherText(text);
    onChange({ selected: otherOption.id, otherText: text });
  };

  return (
    <div className="app-choice-field">
      <div className="app-choice-field__list" role="radiogroup">
        {sortedOptions.map((opt) => {
          const checked = parsed.selected === opt.id;
          const isOther = Boolean(opt.isOther);

          return (
            <ChoiceOptionCard
              key={opt.id}
              control={<Radio checked={checked} value={opt.id} />}
              label={opt.label}
              isSelected={checked}
              isOther={isOther}
              isOtherActive={isOther && isOtherSelected}
              otherText={renderedOtherText}
              otherError={otherError}
              otherInputRef={otherInputRef}
              onActivate={() => select(opt.id)}
              onOtherTextChange={isOther ? updateOtherText : undefined}
            />
          );
        })}
      </div>

      {error ? <div className="app-choice-field__error">{error}</div> : null}
    </div>
  );
};

export const CheckboxChoiceField = ({
  options,
  value,
  onChange,
  error,
  otherError,
}: CheckboxChoiceFieldProps) => {
  const sortedOptions = useMemo(() => sortOptionsWithOtherLast(options), [options]);
  const parsed = parseCheckboxValue(value);
  const otherOption = getOtherOption(sortedOptions);
  const isOtherSelected = Boolean(otherOption && parsed.selected.includes(otherOption.id));

  const [otherText, setOtherText] = useState(parsed.otherText);
  const otherInputRef = useRef<InputRef | null>(null);
  const renderedOtherText = isOtherSelected ? parsed.otherText : otherText;

  useEffect(() => {
    if (!isOtherSelected) return;
    const id = requestAnimationFrame(() => otherInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOtherSelected]);

  const toggle = (optionId: string) => {
    const nextSelected = parsed.selected.includes(optionId)
      ? parsed.selected.filter((item) => item !== optionId)
      : [...parsed.selected, optionId];

    if (hasOtherOption(sortedOptions)) {
      onChange({
        selected: nextSelected,
        otherText: otherOption && nextSelected.includes(otherOption.id) ? otherText : undefined,
      });
      return;
    }
    onChange(nextSelected);
  };

  const updateOtherText = (text: string) => {
    if (!otherOption) return;
    setOtherText(text);
    onChange({ selected: parsed.selected, otherText: text });
  };

  return (
    <div className="app-choice-field">
      <div className="app-choice-field__list" role="group">
        {sortedOptions.map((opt) => {
          const checked = parsed.selected.includes(opt.id);
          const isOther = Boolean(opt.isOther);

          return (
            <ChoiceOptionCard
              key={opt.id}
              control={<Checkbox checked={checked} />}
              label={opt.label}
              isSelected={checked}
              isOther={isOther}
              isOtherActive={isOther && isOtherSelected}
              otherText={renderedOtherText}
              otherError={otherError}
              otherInputRef={otherInputRef}
              onActivate={() => toggle(opt.id)}
              onOtherTextChange={isOther ? updateOtherText : undefined}
            />
          );
        })}
      </div>

      {error ? <div className="app-choice-field__error">{error}</div> : null}
    </div>
  );
};
