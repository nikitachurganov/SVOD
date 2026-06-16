import type { FormFieldInstance } from '../types/form-builder.types';
import {
  DEFAULT_ADDRESS_CONFIG,
  DEFAULT_COUNTRY_CITY_CONFIG,
  DEFAULT_LOCATION_CONFIG,
  DEFAULT_RATING_CONFIG,
  type AddressFieldConfig,
  type CountryCityFieldConfig,
  type LocationFieldConfig,
  type RatingFieldConfig,
} from '../types/field-config.types';

const mergeConfig = <T extends object>(defaults: T, raw: unknown): T => {
  if (!raw || typeof raw !== 'object') return defaults;
  return { ...defaults, ...(raw as Partial<T>) };
};

export const getCountryCityConfig = (field: FormFieldInstance): CountryCityFieldConfig =>
  mergeConfig(DEFAULT_COUNTRY_CITY_CONFIG, field.config);

export const getLocationConfig = (field: FormFieldInstance): LocationFieldConfig =>
  mergeConfig(DEFAULT_LOCATION_CONFIG, field.config);

export const getRatingConfig = (field: FormFieldInstance): RatingFieldConfig => {
  const merged = mergeConfig(DEFAULT_RATING_CONFIG, field.config);
  if (merged.ratingVariant === 'nps') {
    return { ...merged, min: 0, max: 10, step: 1 };
  }
  if (merged.ratingVariant === 'stars' && merged.max === 5 && merged.min === 1) {
    return merged;
  }
  return merged;
};

export const getAddressConfig = (field: FormFieldInstance): AddressFieldConfig =>
  mergeConfig(DEFAULT_ADDRESS_CONFIG, field.config);

/** Runtime fill always uses Yandex Maps suggestions */
export const getAddressFillConfig = (field: FormFieldInstance): AddressFieldConfig => ({
  ...getAddressConfig(field),
  provider: 'yandex',
});

export const getDefaultFieldConfig = (
  type: FormFieldInstance['type'],
): Record<string, unknown> | undefined => {
  switch (type) {
    case 'address_country_city':
      return { ...DEFAULT_COUNTRY_CITY_CONFIG };
    case 'location':
      return { ...DEFAULT_LOCATION_CONFIG };
    case 'rating':
      return { ...DEFAULT_RATING_CONFIG };
    case 'address':
      return { ...DEFAULT_ADDRESS_CONFIG };
    default:
      return undefined;
  }
};
