import { useMemo, useState } from 'react';
import { AutoComplete, Select } from 'antd';
import type { FormFieldInstance } from '../../types/form-builder.types';
import {
  buildLocationDisplayValue,
  CITIES,
  filterCities,
  filterCountries,
  getCountryByCode,
} from '../../data/locations';
import { getLocationConfig } from '../../utils/fieldConfig';
import {
  isLocationFieldValue,
  type LocationFieldValue,
} from '../../types/field-values.types';
import { FieldLabel } from './FieldLabel';

interface LocationInputProps {
  field: FormFieldInstance;
  value: LocationFieldValue | string | undefined;
  onChange: (value: LocationFieldValue) => void;
  error?: string;
}

const toLocationValue = (value: LocationFieldValue | string | undefined): LocationFieldValue => {
  if (isLocationFieldValue(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return { displayValue: value };
  }
  return { displayValue: '' };
};

export const LocationInput = ({ field, value, onChange, error }: LocationInputProps) => {
  const config = getLocationConfig(field);
  const current = toLocationValue(value);
  const [countryQuery, setCountryQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');

  const countryOptions = useMemo(
    () =>
      filterCountries(countryQuery, config.allowedCountries).map((country) => ({
        value: country.code,
        label: country.name,
      })),
    [countryQuery, config.allowedCountries],
  );

  const cityOptions = useMemo(() => {
    const countryCode = current.countryCode ?? config.defaultCountry ?? '';
    if (!countryCode) return [];
    return filterCities(countryCode, cityQuery, config.allowedCountries).map((city) => ({
      value: city.id,
      label: city.name,
    }));
  }, [cityQuery, current.countryCode, config.defaultCountry, config.allowedCountries]);

  const updateCountry = (countryCode: string) => {
    const country = getCountryByCode(countryCode);
    const next: LocationFieldValue = {
      countryCode,
      countryName: country?.name,
      cityName: undefined,
      cityId: undefined,
      displayValue: country?.name ?? '',
    };
    onChange(next);
  };

  const updateCity = (cityId: string) => {
    const countryCode = current.countryCode ?? config.defaultCountry ?? '';
    const city = filterCities(countryCode, '', config.allowedCountries).find((c) => c.id === cityId);
    const next: LocationFieldValue = {
      countryCode: current.countryCode,
      countryName: current.countryName,
      cityId,
      cityName: city?.name,
      displayValue: buildLocationDisplayValue({
        countryName: current.countryName,
        cityName: city?.name,
      }),
    };
    onChange(next);
  };

  const updateCityOnly = (cityName: string, cityId?: string) => {
    onChange({
      cityName,
      cityId,
      displayValue: cityName,
    });
  };

  const renderCountryControl = () => {
    if (config.searchable) {
      return (
        <AutoComplete
          value={current.countryName ?? ''}
          options={countryOptions}
          disabled={config.disabled}
          placeholder={config.placeholder ?? 'Выберите страну'}
          onSearch={setCountryQuery}
          onSelect={(code) => updateCountry(String(code))}
          onChange={(text) => {
            if (config.allowCustomValue) {
              onChange({ countryName: text, displayValue: text });
            }
          }}
          style={{ width: '100%' }}
          status={error ? 'error' : undefined}
        />
      );
    }
    return (
      <Select
        value={current.countryCode}
        options={countryOptions}
        disabled={config.disabled}
        placeholder={config.placeholder ?? 'Выберите страну'}
        onChange={updateCountry}
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        status={error ? 'error' : undefined}
      />
    );
  };

  const renderCityControl = (countryCode?: string) => {
    const effectiveCountry = countryCode ?? config.defaultCountry ?? '';
    if (config.searchable) {
      const options =
        effectiveCountry
          ? cityOptions
          : filterCities('RU', cityQuery, config.allowedCountries).map((city) => ({
              value: city.id,
              label: city.name,
            }));

      return (
        <AutoComplete
          value={current.cityName ?? ''}
          options={options}
          disabled={config.disabled || (config.mode === 'country_and_city' && !effectiveCountry)}
          placeholder={config.placeholder ?? 'Выберите город'}
          onSearch={setCityQuery}
          onSelect={(cityId) => {
            if (effectiveCountry) {
              updateCity(String(cityId));
              return;
            }
            const city = CITIES.find((c) => c.id === cityId);
            updateCityOnly(city?.name ?? String(cityId), String(cityId));
          }}
          onChange={(text) => {
            if (config.allowCustomValue) {
              if (config.mode === 'city_only') {
                updateCityOnly(text);
              } else {
                onChange({
                  ...current,
                  cityName: text,
                  displayValue: buildLocationDisplayValue({
                    countryName: current.countryName,
                    cityName: text,
                  }),
                });
              }
            }
          }}
          style={{ width: '100%' }}
          status={error ? 'error' : undefined}
        />
      );
    }

    return (
      <Select
        value={current.cityId}
        options={cityOptions}
        disabled={config.disabled || !effectiveCountry}
        placeholder={config.placeholder ?? 'Выберите город'}
        onChange={updateCity}
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        status={error ? 'error' : undefined}
      />
    );
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel
        label={field.label || 'Города и страны'}
        required={field.required}
        htmlFor={`field-${field.id}`}
      />

      {config.mode === 'country_only' ? renderCountryControl() : null}

      {config.mode === 'city_only' ? (
        <div>{renderCityControl()}</div>
      ) : null}

      {config.mode === 'country_and_city' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 4 }}>
              Страна
            </div>
            {renderCountryControl()}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 4 }}>
              Город
            </div>
            {renderCityControl(current.countryCode)}
          </div>
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
    </div>
  );
};
