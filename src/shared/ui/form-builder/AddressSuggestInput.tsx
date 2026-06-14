import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AutoComplete, Input, Spin } from 'antd';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { suggestYandexAddress } from '../../api/yandex-suggest.api';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { getAddressFillConfig } from '../../utils/fieldConfig';
import {
  isAddressFieldValue,
  type AddressFieldValue,
} from '../../types/field-values.types';
import { FieldLabel } from './FieldLabel';

interface AddressSuggestInputProps {
  field: FormFieldInstance;
  value: AddressFieldValue | string | undefined;
  onChange: (value: AddressFieldValue) => void;
  error?: string;
}

interface ParsedProviderPayload {
  parsed?: {
    country?: string;
    region?: string;
    city?: string;
    street?: string;
    house?: string;
  };
}

const toAddressValue = (value: AddressFieldValue | string | undefined): AddressFieldValue => {
  if (isAddressFieldValue(value)) return value;
  if (typeof value === 'string') return { displayValue: value, provider: 'yandex' };
  return { displayValue: '', provider: 'yandex' };
};

export const AddressSuggestInput = ({ field, value, onChange, error }: AddressSuggestInputProps) => {
  const config = getAddressFillConfig(field);
  const current = toAddressValue(value);

  const [query, setQuery] = useState(current.displayValue);
  const [options, setOptions] = useState<{ value: string; label: ReactNode }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedFromSuggestion, setSelectedFromSuggestion] = useState(
    Boolean(current.providerPayload) || current.provider === 'yandex',
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setQuery(current.displayValue);
  }, [current.displayValue]);

  const minLength = config.minSearchLength ?? 2;

  const fetchSuggestions = useDebouncedCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < minLength) {
      setOptions([]);
      setSearchError(null);
      setDropdownOpen(false);
      return;
    }

    setLoading(true);
    setSearchError(null);
    try {
      const suggestions = await suggestYandexAddress(trimmed, {
        limit: config.suggestionLimit ?? 5,
        countryRestriction: config.countryRestriction,
      });

      const mapped = suggestions.map((item) => ({
        value: item.value,
        label: (
          <div>
            <div>{item.value}</div>
            {item.subtitle ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{item.subtitle}</div>
            ) : null}
          </div>
        ),
      }));

      setOptions(mapped);
      setDropdownOpen(mapped.length > 0);
      if (mapped.length === 0) {
        setSearchError('Ничего не найдено');
      }
    } catch (err) {
      setOptions([]);
      setDropdownOpen(false);
      setSearchError(err instanceof Error ? err.message : 'Не удалось получить подсказки');
    } finally {
      setLoading(false);
    }
  }, 400);

  const notReadyHint = useMemo(() => {
    if (query.trim().length > 0 && query.trim().length < minLength) {
      return `Введите минимум ${minLength} символа`;
    }
    return null;
  }, [query, minLength]);

  const applySuggestion = (displayValue: string, providerPayload?: unknown) => {
    const parsed = (providerPayload as ParsedProviderPayload | undefined)?.parsed;
    setQuery(displayValue);
    setSelectedFromSuggestion(true);
    setDropdownOpen(false);
    onChangeRef.current({
      displayValue,
      provider: 'yandex',
      country: parsed?.country,
      region: parsed?.region,
      city: parsed?.city,
      street: parsed?.street,
      house: parsed?.house,
      providerPayload,
    });
  };

  const handleSelect = (selectedValue: string) => {
    const match = options.find((opt) => opt.value === selectedValue);
    if (!match) {
      applySuggestion(selectedValue);
      return;
    }
    void suggestYandexAddress(selectedValue, { limit: 1 }).then((items) => {
      const item = items[0];
      if (item) {
        applySuggestion(item.value, item.providerPayload);
        return;
      }
      applySuggestion(selectedValue);
    }).catch(() => {
      applySuggestion(selectedValue);
    });
  };

  const handleInputChange = (text: string) => {
    setQuery(text);
    setSelectedFromSuggestion(false);
    if (config.allowManualInput) {
      onChangeRef.current({ displayValue: text, provider: 'yandex' });
    }
    void fetchSuggestions(text);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel
        label={field.label || 'Адрес'}
        required={field.required}
        htmlFor={`field-${field.id}`}
      />
      <AutoComplete
        value={query}
        options={options}
        open={dropdownOpen && (loading || options.length > 0 || Boolean(searchError))}
        disabled={config.disabled}
        filterOption={false}
        onSearch={handleInputChange}
        onChange={handleInputChange}
        onSelect={handleSelect}
        onFocus={() => {
          if (options.length > 0) setDropdownOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setDropdownOpen(false), 150);
        }}
        style={{ width: '100%' }}
        notFoundContent={
          loading
            ? <Spin size="small" />
            : notReadyHint ?? searchError ?? 'Ничего не найдено'
        }
      >
        <Input
          id={`field-${field.id}`}
          placeholder={config.placeholder ?? 'Начните вводить адрес...'}
          status={error ? 'error' : undefined}
        />
      </AutoComplete>
      {notReadyHint ? (
        <div style={{ color: 'var(--app-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {notReadyHint}
        </div>
      ) : null}
      {searchError && !loading ? (
        <div style={{ color: 'var(--app-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {searchError}
        </div>
      ) : null}
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
      {!config.allowManualInput && !selectedFromSuggestion && query ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          Выберите адрес из списка подсказок
        </div>
      ) : null}
    </div>
  );
};
