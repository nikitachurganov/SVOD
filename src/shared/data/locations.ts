export interface CountryOption {
  code: string;
  name: string;
}

export interface CityOption {
  id: string;
  name: string;
  countryCode: string;
}

/** MVP local dictionary — replaceable with backend API later */
export const COUNTRIES: CountryOption[] = [
  { code: 'RU', name: 'Россия' },
  { code: 'BY', name: 'Беларусь' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'UA', name: 'Украина' },
  { code: 'UZ', name: 'Узбекистан' },
  { code: 'AM', name: 'Армения' },
  { code: 'AZ', name: 'Азербайджан' },
  { code: 'GE', name: 'Грузия' },
  { code: 'KG', name: 'Кыргызстан' },
  { code: 'TJ', name: 'Таджикистан' },
];

export const CITIES: CityOption[] = [
  { id: 'ru-msk', name: 'Москва', countryCode: 'RU' },
  { id: 'ru-spb', name: 'Санкт-Петербург', countryCode: 'RU' },
  { id: 'ru-nsk', name: 'Новосибирск', countryCode: 'RU' },
  { id: 'ru-ekb', name: 'Екатеринбург', countryCode: 'RU' },
  { id: 'ru-kzn', name: 'Казань', countryCode: 'RU' },
  { id: 'ru-nn', name: 'Нижний Новгород', countryCode: 'RU' },
  { id: 'by-msk', name: 'Минск', countryCode: 'BY' },
  { id: 'by-brest', name: 'Брест', countryCode: 'BY' },
  { id: 'kz-ast', name: 'Астана', countryCode: 'KZ' },
  { id: 'kz-alm', name: 'Алматы', countryCode: 'KZ' },
  { id: 'ua-kiev', name: 'Киев', countryCode: 'UA' },
  { id: 'ua-od', name: 'Одесса', countryCode: 'UA' },
  { id: 'uz-tash', name: 'Ташкент', countryCode: 'UZ' },
  { id: 'am-ere', name: 'Ереван', countryCode: 'AM' },
  { id: 'az-bak', name: 'Баку', countryCode: 'AZ' },
  { id: 'ge-tbil', name: 'Тбилиси', countryCode: 'GE' },
];

export const getCountryByCode = (code: string): CountryOption | undefined =>
  COUNTRIES.find((c) => c.code === code);

export const getCitiesForCountry = (
  countryCode: string,
  allowedCountries?: string[],
): CityOption[] => {
  if (allowedCountries && allowedCountries.length > 0 && !allowedCountries.includes(countryCode)) {
    return [];
  }
  return CITIES.filter((city) => city.countryCode === countryCode);
};

export const filterCountries = (
  query: string,
  allowedCountries?: string[],
): CountryOption[] => {
  const normalized = query.trim().toLowerCase();
  let list = COUNTRIES;
  if (allowedCountries && allowedCountries.length > 0) {
    list = list.filter((c) => allowedCountries.includes(c.code));
  }
  if (!normalized) return list;
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(normalized) ||
      c.code.toLowerCase().includes(normalized),
  );
};

export const filterCities = (
  countryCode: string,
  query: string,
  allowedCountries?: string[],
): CityOption[] => {
  const normalized = query.trim().toLowerCase();
  const cities = getCitiesForCountry(countryCode, allowedCountries);
  if (!normalized) return cities;
  return cities.filter((c) => c.name.toLowerCase().includes(normalized));
};

export const buildLocationDisplayValue = (value: {
  countryName?: string;
  cityName?: string;
}): string => {
  const parts = [value.countryName, value.cityName].filter(Boolean);
  return parts.join(', ');
};
