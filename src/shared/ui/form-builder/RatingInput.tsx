import { useEffect } from 'react';
import { Button, Radio, Rate, Slider } from 'antd';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { getRatingConfig } from '../../utils/fieldConfig';
import {
  getNpsCategory,
  isRatingFieldValue,
  type RatingFieldValue,
} from '../../types/field-values.types';
import { FieldLabel } from './FieldLabel';

interface RatingInputProps {
  field: FormFieldInstance;
  value: RatingFieldValue | number | undefined;
  onChange: (value: RatingFieldValue | undefined) => void;
  error?: string;
}

const toRatingValue = (
  value: RatingFieldValue | number | undefined,
  config: ReturnType<typeof getRatingConfig>,
): RatingFieldValue | undefined => {
  if (isRatingFieldValue(value)) return value;
  if (typeof value === 'number') {
    return {
      value,
      min: config.min,
      max: config.max,
    };
  }
  return undefined;
};

const buildRatingPayload = (
  raw: number,
  config: ReturnType<typeof getRatingConfig>,
): RatingFieldValue => {
  const payload: RatingFieldValue = {
    value: raw,
    min: config.min,
    max: config.max,
  };
  if (config.ratingVariant === 'nps') {
    payload.npsCategory = getNpsCategory(raw);
  }
  return payload;
};

export const RatingInput = ({ field, value, onChange, error }: RatingInputProps) => {
  const config = getRatingConfig(field);
  const current = toRatingValue(value, config);

  useEffect(() => {
    if (config.defaultValue !== undefined && current === undefined) {
      onChange(buildRatingPayload(config.defaultValue, config));
    }
    // defaultValue is applied once on mount when value is empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericOptions = Array.from(
    { length: Math.floor((config.max - config.min) / config.step) + 1 },
    (_, index) => config.min + index * config.step,
  );

  const handleChange = (next: number | null) => {
    if (next === null || Number.isNaN(next)) {
      if (config.allowClear) onChange(undefined);
      return;
    }
    onChange(buildRatingPayload(next, config));
  };

  const renderControl = () => {
    switch (config.ratingVariant) {
      case 'stars':
        return (
          <Rate
            value={current?.value}
            count={config.max}
            allowClear={config.allowClear}
            disabled={config.disabled}
            onChange={(next) => handleChange(next)}
          />
        );
      case 'slider':
        return (
          <div>
            <Slider
              min={config.min}
              max={config.max}
              step={config.step}
              value={current?.value}
              disabled={config.disabled}
              onChange={(next) => handleChange(next)}
            />
            {config.showValue ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                Значение: {current?.value ?? '—'}
              </div>
            ) : null}
          </div>
        );
      case 'nps':
      case 'numeric_scale':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {config.leftLabel ?? String(config.min)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {config.rightLabel ?? String(config.max)}
              </span>
            </div>
            <Radio.Group
              value={current?.value}
              disabled={config.disabled}
              onChange={(event) => handleChange(Number(event.target.value))}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {numericOptions.map((option) => (
                  <Radio.Button key={option} value={option}>
                    {option}
                  </Radio.Button>
                ))}
              </div>
            </Radio.Group>
            {config.showValue && current ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 8 }}>
                Выбрано: {current.value}
                {current.npsCategory ? ` (${current.npsCategory})` : ''}
              </div>
            ) : null}
            {config.allowClear && current ? (
              <Button
                type="link"
                size="small"
                style={{ paddingLeft: 0, marginTop: 4 }}
                onClick={() => handleChange(null)}
              >
                Сбросить
              </Button>
            ) : null}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel
        label={field.label || 'Оценка по шкале'}
        required={field.required}
        htmlFor={`field-${field.id}`}
      />
      {renderControl()}
      {field.description ? (
        <div style={{ color: 'var(--app-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      ) : null}
      {error ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
