import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'city-locales');

const LOCALES = [
  'ru',
  'uk',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'pl',
  'tr',
  'jp',
  'zh-CN',
  'ar',
  'ko',
  'nl',
  'cs',
  'sv',
  'el',
  'he',
  'th',
  'vi',
  'hi',
  'fa',
  'hy',
  'ka',
  'az',
  'ro',
  'hu',
  'da',
  'fi',
  'no',
  'id',
  'ms',
  'en',
];

const normalizeKey = (countryCode, englishName) =>
  `${countryCode.toUpperCase()}:${englishName.trim()}`;

const buildMap = (entries) => {
  const map = {};
  for (const entry of entries) {
    const country = entry.country_code?.toUpperCase();
    const english = entry.name_translations?.en?.trim() || entry.name?.trim();
    const localized =
      entry.name?.trim() ||
      entry.cases?.su?.trim() ||
      entry.cases?.vi?.replace(/^в\s+/iu, '')?.trim();
    if (!country || !english || !localized) continue;
    if (english.toLowerCase() === localized.toLowerCase()) continue;
    map[normalizeKey(country, english)] = localized;
  }
  return map;
};

await mkdir(OUT_DIR, { recursive: true });

for (const locale of LOCALES) {
  const url = `https://api.travelpayouts.com/data/${locale}/cities.json`;
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`Skip ${locale}: HTTP ${response.status}`);
    continue;
  }
  const entries = await response.json();
  const map = buildMap(entries);
  const outPath = path.join(OUT_DIR, `${locale}.json`);
  await writeFile(outPath, JSON.stringify(map));
  console.log(`${locale}: ${Object.keys(map).length} entries -> ${outPath}`);
}
