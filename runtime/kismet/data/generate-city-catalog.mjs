import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.join(root, 'data', 'cities-wuxing.yaml');
const outputPath = path.join(root, 'src', 'data', 'city-catalog.ts');

const source = fs.readFileSync(inputPath, 'utf8');
const parsed = YAML.parse(source);

const themeColor = {
  metal: '#B0BEC5',
  wood: '#4CAF50',
  water: '#2F6BFF',
  fire: '#FF7043',
  earth: '#C9A227',
};

const entries = parsed.cities.map((city) => {
  const isChina = city.country === 'China' || city.country === 'Taiwan';
  const weights = {
    metal: 10,
    wood: 10,
    water: 10,
    fire: 10,
    earth: 10,
  };

  weights[city.primary_element] = 40;
  weights[city.secondary_element] += 20;

  const remaining = 100 - Object.values(weights).reduce((sum, value) => sum + value, 0);
  const fillers = Object.keys(weights).filter((key) => key !== city.primary_element && key !== city.secondary_element);
  fillers.forEach((key, index) => {
    weights[key] += Math.floor(remaining / fillers.length) + (index < (remaining % fillers.length) ? 1 : 0);
  });

  return {
    cityId: `${isChina ? 'cn' : 'gl'}-${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    city: city.city,
    cityZh: city.city_zh,
    country: city.country,
    countryZh: city.country_zh,
    province: isChina ? city.city_zh : city.country,
    provinceZh: city.country_zh,
    lat: city.lat,
    lng: city.lng,
    timezone: city.timezone,
    tier: isChina ? 'cn-major' : 'global-major',
    baseElement: city.primary_element,
    elementWeights: weights,
    themeColor: themeColor[city.primary_element],
    rationaleTags: [city.primary_element, city.secondary_element],
    rationaleSummary: city.element_rationale,
  };
});

const output = [
  "import type { CityCatalogEntry } from '../types.js';",
  '',
  `export const CITY_CATALOG: CityCatalogEntry[] = ${JSON.stringify(entries, null, 2)} as CityCatalogEntry[];`,
  '',
].join('\n');

fs.writeFileSync(outputPath, output);
console.log(`generated ${entries.length} city catalog rows`);
