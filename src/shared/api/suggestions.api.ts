import api from '../lib/api';
import type { AddressSuggestion, AddressProvider, SuggestAddressOptions } from './suggestions.types';

export type { AddressSuggestion, AddressProvider, SuggestAddressOptions };

export const suggestAddress = async (
  query: string,
  options: SuggestAddressOptions = {},
): Promise<AddressSuggestion[]> => {
  const { data } = await api.get<AddressSuggestion[]>('/suggest/address', {
    params: {
      query,
      provider: options.provider ?? 'dadata',
      limit: options.limit ?? 5,
      country: options.countryRestriction,
      city: options.cityRestriction,
    },
  });
  return data;
};
