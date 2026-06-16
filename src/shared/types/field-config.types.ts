export interface CountryCityFieldConfig {
  placeholderCountry?: string;
  placeholderCity?: string;
  disabled?: boolean;
}

export type LocationMode = 'country_only' | 'city_only' | 'country_and_city';

export interface LocationFieldConfig {
  mode: LocationMode;
  placeholder?: string;
  defaultCountry?: string;
  allowedCountries?: string[];
  allowCustomValue?: boolean;
  searchable?: boolean;
  disabled?: boolean;
}

export type RatingVariant = 'stars' | 'numeric_scale' | 'slider' | 'nps';

export interface RatingFieldConfig {
  ratingVariant: RatingVariant;
  min: number;
  max: number;
  step: number;
  leftLabel?: string;
  rightLabel?: string;
  showValue?: boolean;
  allowClear?: boolean;
  defaultValue?: number;
  disabled?: boolean;
}

export type AddressProvider = 'none' | 'dadata' | 'yandex' | 'custom';

export interface AddressFieldConfig {
  placeholder?: string;
  provider: AddressProvider;
  countryRestriction?: string;
  cityRestriction?: string;
  suggestionLimit?: number;
  minSearchLength?: number;
  showMap?: boolean;
  allowManualInput?: boolean;
  disabled?: boolean;
}

export const DEFAULT_COUNTRY_CITY_CONFIG: CountryCityFieldConfig = {
  placeholderCountry: 'Выберите страну',
  placeholderCity: 'Выберите город',
  disabled: false,
};

export const DEFAULT_LOCATION_CONFIG: LocationFieldConfig = {
  mode: 'country_and_city',
  searchable: true,
  allowCustomValue: false,
  disabled: false,
};

export const DEFAULT_RATING_CONFIG: RatingFieldConfig = {
  ratingVariant: 'stars',
  min: 1,
  max: 5,
  step: 1,
  showValue: true,
  allowClear: true,
  disabled: false,
};

export const DEFAULT_ADDRESS_CONFIG: AddressFieldConfig = {
  provider: 'yandex',
  suggestionLimit: 5,
  minSearchLength: 2,
  allowManualInput: true,
  showMap: false,
  disabled: false,
};
