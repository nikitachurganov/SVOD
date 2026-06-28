import { Input, InputNumber, Select, Switch } from 'antd';
import type { FormFieldInstance } from '../../types/form-builder.types';
import {
  DEFAULT_ADDRESS_CONFIG,
  DEFAULT_COUNTRY_CITY_CONFIG,
  DEFAULT_LOCATION_CONFIG,
  DEFAULT_RATING_CONFIG,
  type AddressFieldConfig,
  type CountryCityFieldConfig,
  type LocationFieldConfig,
  type RatingFieldConfig,
} from '../../types/field-config.types';
import { COUNTRIES } from '../../data/locations';

interface FieldTypeSettingsProps {
  field: FormFieldInstance;
  onChange: (changes: Partial<FormFieldInstance>) => void;
}

const mergeConfig = <T extends object>(defaults: T, raw: unknown): T => {
  if (!raw || typeof raw !== 'object') return defaults;
  return { ...defaults, ...(raw as Partial<T>) };
};

export const FieldTypeSettings = ({ field, onChange }: FieldTypeSettingsProps) => {
  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ config: { ...(field.config ?? {}), ...patch } });
  };

  if (field.type === 'address_country_city') {
    const config = mergeConfig<CountryCityFieldConfig>(
      DEFAULT_COUNTRY_CITY_CONFIG,
      field.config,
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Input
          size="small"
          placeholder="Плейсхолдер страны"
          value={config.placeholderCountry ?? ''}
          onChange={(e) => updateConfig({ placeholderCountry: e.target.value })}
        />
        <Input
          size="small"
          placeholder="Плейсхолдер города"
          value={config.placeholderCity ?? ''}
          onChange={(e) => updateConfig({ placeholderCity: e.target.value })}
        />
        <Switch
          size="small"
          checked={Boolean(config.disabled)}
          checkedChildren="Отключено"
          unCheckedChildren="Активно"
          onChange={(disabled) => updateConfig({ disabled })}
        />
      </div>
    );
  }

  if (field.type === 'location') {
    const config = mergeConfig<LocationFieldConfig>(DEFAULT_LOCATION_CONFIG, field.config);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Select
          size="small"
          value={config.mode}
          options={[
            { value: 'country_only', label: 'Только страна' },
            { value: 'city_only', label: 'Только город' },
            { value: 'country_and_city', label: 'Страна и город' },
          ]}
          onChange={(mode) => updateConfig({ mode })}
        />
        <Input
          size="small"
          placeholder="Placeholder"
          value={config.placeholder ?? ''}
          onChange={(e) => updateConfig({ placeholder: e.target.value })}
        />
        <Select
          size="small"
          allowClear
          placeholder="Страна по умолчанию"
          value={config.defaultCountry}
          options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
          onChange={(defaultCountry) => updateConfig({ defaultCountry })}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <Switch
            size="small"
            checked={config.searchable ?? true}
            onChange={(searchable) => updateConfig({ searchable })}
          />
          <span style={{ fontSize: 12 }}>Поиск</span>
          <Switch
            size="small"
            checked={config.allowCustomValue ?? false}
            onChange={(allowCustomValue) => updateConfig({ allowCustomValue })}
          />
          <span style={{ fontSize: 12 }}>Свой ввод</span>
        </div>
      </div>
    );
  }

  if (field.type === 'rating') {
    const config = mergeConfig<RatingFieldConfig>(DEFAULT_RATING_CONFIG, field.config);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Select
          size="small"
          value={config.ratingVariant}
          options={[
            { value: 'stars', label: 'Звёзды' },
            { value: 'numeric_scale', label: 'Числовая шкала' },
            { value: 'slider', label: 'Слайдер' },
            { value: 'nps', label: 'NPS (0–10)' },
          ]}
          onChange={(ratingVariant) => {
            if (ratingVariant === 'nps') {
              updateConfig({ ratingVariant, min: 0, max: 10, step: 1 });
              return;
            }
            updateConfig({ ratingVariant });
          }}
        />
        {config.ratingVariant !== 'nps' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <InputNumber
              size="small"
              min={0}
              value={config.min}
              onChange={(min) => updateConfig({ min: min ?? 1 })}
            />
            <InputNumber
              size="small"
              min={1}
              value={config.max}
              onChange={(max) => updateConfig({ max: max ?? 5 })}
            />
            <InputNumber
              size="small"
              min={1}
              value={config.step}
              onChange={(step) => updateConfig({ step: step ?? 1 })}
            />
          </div>
        ) : null}
        <Input
          size="small"
          placeholder="Подпись слева"
          value={config.leftLabel ?? ''}
          onChange={(e) => updateConfig({ leftLabel: e.target.value })}
        />
        <Input
          size="small"
          placeholder="Подпись справа"
          value={config.rightLabel ?? ''}
          onChange={(e) => updateConfig({ rightLabel: e.target.value })}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <Switch
            size="small"
            checked={config.showValue ?? true}
            onChange={(showValue) => updateConfig({ showValue })}
          />
          <span style={{ fontSize: 12 }}>Показывать значение</span>
          <Switch
            size="small"
            checked={config.allowClear ?? true}
            onChange={(allowClear) => updateConfig({ allowClear })}
          />
          <span style={{ fontSize: 12 }}>Сброс</span>
        </div>
      </div>
    );
  }

  if (field.type === 'address') {
    const config = mergeConfig<AddressFieldConfig>(DEFAULT_ADDRESS_CONFIG, field.config);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Input
          size="small"
          placeholder="Placeholder"
          value={config.placeholder ?? ''}
          onChange={(e) => updateConfig({ placeholder: e.target.value })}
        />
        <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Подсказки: Яндекс Карты
        </div>
        <InputNumber
          size="small"
          min={1}
          max={10}
          value={config.suggestionLimit ?? 5}
          onChange={(suggestionLimit) => updateConfig({ suggestionLimit: suggestionLimit ?? 5 })}
        />
        <InputNumber
          size="small"
          min={1}
          max={10}
          value={config.minSearchLength ?? 3}
          onChange={(minSearchLength) => updateConfig({ minSearchLength: minSearchLength ?? 3 })}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <Switch
            size="small"
            checked={config.allowManualInput ?? true}
            onChange={(allowManualInput) => updateConfig({ allowManualInput })}
          />
          <span style={{ fontSize: 12 }}>Ручной ввод</span>
        </div>
      </div>
    );
  }

  return null;
};
