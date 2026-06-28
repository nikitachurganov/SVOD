import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import ruLocale from 'i18n-iso-countries/langs/ru.json';
import { getCitySortLocale } from './countryLocales';
import {
  getLocalizedCityNameFromMap,
  loadLocalizedCityMapForCountry,
  preloadCityLocaleForCountry,
} from './cityNameLocalization';

countries.registerLocale(ruLocale);
countries.registerLocale(enLocale);

export const PRIORITY_COUNTRY_CODES = ['RU', 'BY', 'KZ', 'TR', 'DE'] as const;

export interface WorldCountry {
  iso2: string;
  nameRu: string;
  nameEn: string;
}

export interface WorldCity {
  name: string;
  nameEn: string;
  country: string;
}

type CitiesJsonEntry = {
  name: string;
  country: string;
};

let countriesCache: WorldCountry[] | null = null;
let citiesIndexPromise: Promise<Map<string, WorldCity[]>> | null = null;
const citiesCache = new Map<string, WorldCity[]>();

const getRussianCountryName = (iso2: string, fallback: string): string =>
  countries.getName(iso2, 'ru') ?? fallback;

const sortCountries = (list: WorldCountry[]): WorldCountry[] =>
  [...list].sort((a, b) => {
    const aPri = PRIORITY_COUNTRY_CODES.indexOf(
      a.iso2 as (typeof PRIORITY_COUNTRY_CODES)[number],
    );
    const bPri = PRIORITY_COUNTRY_CODES.indexOf(
      b.iso2 as (typeof PRIORITY_COUNTRY_CODES)[number],
    );
    const aRank = aPri >= 0 ? aPri : 999;
    const bRank = bPri >= 0 ? bPri : 999;
    if (aRank !== bRank) return aRank - bRank;
    return a.nameRu.localeCompare(b.nameRu, 'ru');
  });

const buildCountries = (): WorldCountry[] => {
  const englishNames = countries.getNames('en', { select: 'official' });
  return sortCountries(
    Object.keys(englishNames).map((iso2) => ({
      iso2,
      nameRu: getRussianCountryName(iso2, englishNames[iso2] ?? iso2),
      nameEn: englishNames[iso2] ?? iso2,
    })),
  );
};

const buildCitiesIndex = async (): Promise<Map<string, WorldCity[]>> => {
  const module = await import('cities.json');
  const raw = module.default as CitiesJsonEntry[];
  const grouped = new Map<string, Map<string, WorldCity>>();

  for (const city of raw) {
    const iso2 = city.country;
    if (!iso2 || !city.name) continue;
    const byCountry = grouped.get(iso2) ?? new Map<string, WorldCity>();
    if (!byCountry.has(city.name)) {
      byCountry.set(city.name, {
        name: city.name,
        nameEn: city.name,
        country: iso2,
      });
    }
    grouped.set(iso2, byCountry);
  }

  const index = new Map<string, WorldCity[]>();
  for (const [iso2, cityMap] of grouped.entries()) {
    const list = [...cityMap.values()].sort((a, b) =>
      a.nameEn.localeCompare(b.nameEn, 'en'),
    );
    index.set(iso2, list);
  }
  return index;
};

const loadCitiesIndex = async (): Promise<Map<string, WorldCity[]>> => {
  if (!citiesIndexPromise) {
    citiesIndexPromise = buildCitiesIndex();
  }
  return citiesIndexPromise;
};

export const loadWorldCountries = async (): Promise<WorldCountry[]> => {
  if (countriesCache) return countriesCache;
  countriesCache = buildCountries();
  return countriesCache;
};

export const getCountryNameRu = (iso2: string): string =>
  getRussianCountryName(iso2, iso2);

export const getWorldCountryByIso2 = async (
  iso2: string,
): Promise<WorldCountry | undefined> => {
  const list = await loadWorldCountries();
  return list.find((country) => country.iso2 === iso2);
};

export const loadCitiesForCountry = async (iso2: string): Promise<WorldCity[]> => {
  const cached = citiesCache.get(iso2);
  if (cached) return cached;

  preloadCityLocaleForCountry(iso2);

  const index = await loadCitiesIndex();
  const rawCities = index.get(iso2) ?? [];
  const sortLocale = getCitySortLocale(iso2);
  const localeMap = await loadLocalizedCityMapForCountry(iso2);

  const cities = rawCities.map((city) => ({
    ...city,
    name: getLocalizedCityNameFromMap(localeMap, iso2, city.nameEn),
  }));

  cities.sort((a, b) => a.name.localeCompare(b.name, sortLocale));

  citiesCache.set(iso2, cities);
  return cities;
};

export const filterCountryOptions = (
  list: WorldCountry[],
  query: string,
): WorldCountry[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return list;
  return list.filter(
    (country) =>
      country.nameRu.toLowerCase().includes(normalized) ||
      country.nameEn.toLowerCase().includes(normalized) ||
      country.iso2.toLowerCase().includes(normalized),
  );
};

export const filterCityOptions = (list: WorldCity[], query: string): WorldCity[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return list;
  return list.filter(
    (city) =>
      city.name.toLowerCase().includes(normalized) ||
      city.nameEn.toLowerCase().includes(normalized),
  );
};

export const clearCitiesCacheForCountry = (iso2: string): void => {
  citiesCache.delete(iso2);
};
