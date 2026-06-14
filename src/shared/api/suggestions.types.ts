export type AddressProvider = 'none' | 'dadata' | 'yandex' | 'custom';

export interface AddressSuggestion {
  value: string;
  unrestrictedValue?: string;
  country?: string;
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  flat?: string;
  postalCode?: string;
  geoLat?: string;
  geoLon?: string;
  provider: AddressProvider;
  providerPayload?: unknown;
}

export interface SuggestAddressOptions {
  provider?: AddressProvider;
  limit?: number;
  countryRestriction?: string;
  cityRestriction?: string;
}
