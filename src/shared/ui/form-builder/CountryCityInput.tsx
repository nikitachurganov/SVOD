import { useEffect, useMemo, useState } from 'react';
import { Select, Spin } from 'antd';
import type { FormFieldInstance } from '../../types/form-builder.types';
import type { CountryCityFieldConfig } from '../../types/field-config.types';
import {
  isCountryCityFieldValue,
  type CountryCityFieldValue,
} from '../../types/field-values.types';
import {
  filterCityOptions,
  filterCountryOptions,
  getCountryNameRu,
  loadCitiesForCountry,
  loadWorldCountries,
  type WorldCity,
  type WorldCountry,
} from '../../data/worldLocations';
import { FieldLabel } from './FieldLabel';

interface CountryCityInputProps {
  field: FormFieldInstance;
  config: CountryCityFieldConfig;
  value: CountryCityFieldValue | undefined;
  onChange: (value: CountryCityFieldValue | '') => void;
  error?: string;
}

const toCountryCityValue = (value: unknown): CountryCityFieldValue | undefined => {
  if (isCountryCityFieldValue(value) && value.country) {
    return {
      country: value.country,
      countryName: value.countryName || getCountryNameRu(value.country),
      city: value.city ?? '',
    };
  }
  return undefined;
};

export const CountryCityInput = ({
  field,
  config,
  value,
  onChange,
  error,
}: CountryCityInputProps) => {
  const current = toCountryCityValue(value);
  const [countries, setCountries] = useState<WorldCountry[] | null>(null);
  const [cityState, setCityState] = useState<{ iso2: string; items: WorldCity[] } | null>(null);
  const [countryQuery, setCountryQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadWorldCountries().then((list) => {
      if (!cancelled) setCountries(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const iso2 = current?.country;
    if (!iso2) return undefined;

    let cancelled = false;
    void loadCitiesForCountry(iso2).then((items) => {
      if (!cancelled) setCityState({ iso2, items });
    });
    return () => {
      cancelled = true;
    };
  }, [current?.country]);

  const countriesLoading = countries === null;
  const citiesLoading = Boolean(current?.country) && cityState?.iso2 !== current?.country;

  const countryOptions = useMemo(
    () =>
      filterCountryOptions(countries ?? [], countryQuery).map((country) => ({
        value: country.iso2,
        label: `${country.nameRu} (${country.nameEn})`,
      })),
    [countries, countryQuery],
  );

  const cityList = useMemo(
    () =>
      current?.country && cityState?.iso2 === current.country ? cityState.items : [],
    [current, cityState],
  );

  const matchedCity = current?.city
    ? cityList.find((city) => city.name === current.city || city.nameEn === current.city)
    : undefined;
  const resolvedCityValue = matchedCity?.name ?? current?.city ?? undefined;

  useEffect(() => {
    if (!current?.country || !current.city || cityList.length === 0) return;
    if (matchedCity && matchedCity.name !== current.city) {
      onChange({
        country: current.country,
        countryName: current.countryName || getCountryNameRu(current.country),
        city: matchedCity.name,
      });
    }
  }, [cityList, current, matchedCity, onChange]);

  const cityOptions = filterCityOptions(cityList, cityQuery).map((city) => ({
    value: city.name,
    label: city.name,
  }));

  const handleCountryChange = (iso2: string) => {
    setCityQuery('');
    onChange({
      country: iso2,
      countryName: getCountryNameRu(iso2),
      city: '',
    });
  };

  const handleCityChange = (cityName: string) => {
    if (!current?.country) return;
    onChange({
      country: current.country,
      countryName: current.countryName || getCountryNameRu(current.country),
      city: cityName,
    });
  };

  const placeholderCountry =
    config.placeholderCountry ??
    (typeof field.config?.placeholderCountry === 'string'
      ? field.config.placeholderCountry
      : 'Выберите страну');
  const placeholderCity =
    config.placeholderCity ??
    (typeof field.config?.placeholderCity === 'string'
      ? field.config.placeholderCity
      : 'Выберите город');

  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel
        label={field.label || 'Страна и город'}
        required={field.required}
        htmlFor={`field-${field.id}-country`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 4 }}>
            Страна
          </div>
          <Select
            id={`field-${field.id}-country`}
            showSearch
            allowClear={!field.required}
            disabled={config.disabled}
            loading={countriesLoading}
            placeholder={placeholderCountry}
            value={current?.country || undefined}
            options={countryOptions}
            optionFilterProp="label"
            onSearch={setCountryQuery}
            onChange={(iso2) => {
              if (!iso2) {
                onChange('');
                return;
              }
              handleCountryChange(String(iso2));
            }}
            style={{ width: '100%' }}
            status={error ? 'error' : undefined}
            notFoundContent={countriesLoading ? <Spin size="small" /> : 'Ничего не найдено'}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 4 }}>
            Город
          </div>
          <Select
            id={`field-${field.id}-city`}
            showSearch
            allowClear={!field.required}
            disabled={config.disabled || !current?.country}
            loading={citiesLoading}
            placeholder={placeholderCity}
            value={resolvedCityValue}
            options={cityOptions}
            optionFilterProp="label"
            virtual={cityOptions.length > 100}
            onSearch={setCityQuery}
            onChange={(cityName) => {
              if (!cityName) {
                if (!current?.country) {
                  onChange('');
                  return;
                }
                onChange({
                  country: current.country,
                  countryName: current.countryName || getCountryNameRu(current.country),
                  city: '',
                });
                return;
              }
              handleCityChange(String(cityName));
            }}
            style={{ width: '100%' }}
            status={error ? 'error' : undefined}
            notFoundContent={
              !current?.country ? (
                'Сначала выберите страну'
              ) : citiesLoading ? (
                <Spin size="small" />
              ) : (
                'Ничего не найдено'
              )
            }
          />
        </div>
      </div>

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
