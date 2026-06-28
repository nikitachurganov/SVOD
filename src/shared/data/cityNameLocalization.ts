import { getCountryCityLocale } from './countryLocales';

type LocaleMap = Record<string, string>;

const localeCache = new Map<string, LocaleMap>();
const localePromises = new Map<string, Promise<LocaleMap>>();

const loadLocaleMap = async (locale: string): Promise<LocaleMap> => {
  const cached = localeCache.get(locale);
  if (cached) return cached;

  const pending = localePromises.get(locale);
  if (pending) return pending;

  const promise = fetch(`/city-locales/${locale}.json`)
    .then(async (response) => {
      if (!response.ok) {
        return {};
      }
      const map = (await response.json()) as LocaleMap;
      localeCache.set(locale, map);
      return map;
    })
    .catch(() => ({}));

  localePromises.set(locale, promise);
  return promise;
};

export const localizeCityName = async (
  countryIso2: string,
  englishName: string,
): Promise<string> => {
  const locale = getCountryCityLocale(countryIso2);
  const map = await loadLocaleMap(locale);
  return map[`${countryIso2.toUpperCase()}:${englishName.trim()}`] ?? englishName;
};

export const loadLocalizedCityMapForCountry = async (
  countryIso2: string,
): Promise<LocaleMap> => loadLocaleMap(getCountryCityLocale(countryIso2));

export const getLocalizedCityNameFromMap = (
  map: LocaleMap,
  countryIso2: string,
  englishName: string,
): string => map[`${countryIso2.toUpperCase()}:${englishName.trim()}`] ?? englishName;

export const preloadCityLocaleForCountry = (countryIso2: string): void => {
  const locale = getCountryCityLocale(countryIso2);
  void loadLocaleMap(locale);
};
