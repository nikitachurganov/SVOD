export type NpsCategory = 'detractor' | 'passive' | 'promoter';

export interface LocationFieldValue {
  countryCode?: string;
  countryName?: string;
  cityName?: string;
  cityId?: string;
  displayValue: string;
}

export interface RatingFieldValue {
  value: number;
  min: number;
  max: number;
  label?: string;
  npsCategory?: NpsCategory;
}

export type AddressProvider = 'none' | 'dadata' | 'yandex' | 'custom';

export interface AddressFieldValue {
  displayValue: string;
  provider?: AddressProvider;
  country?: string;
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  flat?: string;
  postalCode?: string;
  geoLat?: string;
  geoLon?: string;
  providerPayload?: unknown;
}

export const getNpsCategory = (value: number): NpsCategory => {
  if (value <= 6) return 'detractor';
  if (value <= 8) return 'passive';
  return 'promoter';
};

export const isLocationFieldValue = (value: unknown): value is LocationFieldValue =>
  typeof value === 'object' &&
  value !== null &&
  'displayValue' in value &&
  typeof (value as LocationFieldValue).displayValue === 'string';

export const isRatingFieldValue = (value: unknown): value is RatingFieldValue =>
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  typeof (value as RatingFieldValue).value === 'number';

export const isAddressFieldValue = (value: unknown): value is AddressFieldValue =>
  typeof value === 'object' &&
  value !== null &&
  'displayValue' in value &&
  typeof (value as AddressFieldValue).displayValue === 'string';
