import { CITY_CATALOG } from '../data/city-catalog.js';
import { ELEMENT_LABELS, GENERATES, GENERATED_BY } from './bazi/constants.js';
import { describeElementSupport } from './bazi/derive-profile.js';
import type {
  CityCatalogEntry,
  ElementKey,
  KismetCanonicalProfile,
  KismetCityAffinityItem,
  KismetLocationContext,
} from '../types.js';
import { KISMET_REASON } from '../contracts.js';

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function buildReason(profile: KismetCanonicalProfile, city: CityCatalogEntry, relation: string): string {
  const favorite = profile.favorableElements.map((item) => ELEMENT_LABELS[item]).join('、');
  const cityLead = ELEMENT_LABELS[city.baseElement];
  return `${city.cityZh}以${cityLead}为主，与你的${profile.dayMaster.label}呈${relation}关系，偏向补益${favorite}。`;
}

function scoreCity(profile: KismetCanonicalProfile, city: CityCatalogEntry): number {
  let score = 50;
  for (const element of profile.favorableElements) {
    score += city.elementWeights[element] * 0.5;
  }
  for (const element of profile.unfavorableElements) {
    score -= city.elementWeights[element] * 0.35;
  }

  const relation = describeElementSupport(profile.dayMaster.element, city.baseElement);
  if (relation === 'supports') score += 12;
  if (relation === 'balances') score += 8;
  if (relation === 'drains') score -= 4;
  if (relation === 'conflicts') score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function toAffinityItem(profile: KismetCanonicalProfile, city: CityCatalogEntry): KismetCityAffinityItem {
  const relation = describeElementSupport(profile.dayMaster.element, city.baseElement);
  return {
    cityId: city.cityId,
    city: city.city,
    cityZh: city.cityZh,
    country: city.country,
    countryZh: city.countryZh,
    lat: city.lat,
    lng: city.lng,
    baseElement: city.baseElement,
    elementWeights: city.elementWeights,
    themeColor: city.themeColor,
    score: scoreCity(profile, city),
    reason: buildReason(profile, city, relation),
  };
}

export function resolveBirthCity(input: { birthPlaceId?: string; birthPlaceLabel: string }): CityCatalogEntry | null {
  const byId = input.birthPlaceId
    ? CITY_CATALOG.find((city) => city.cityId === input.birthPlaceId)
    : null;
  if (byId) {
    return byId;
  }

  const normalized = normalizeLabel(input.birthPlaceLabel);
  return CITY_CATALOG.find((city) => (
    normalizeLabel(city.city) === normalized
    || normalizeLabel(city.cityZh) === normalized
  )) || null;
}

export function buildLocationContext(input: {
  profile: KismetCanonicalProfile;
  birthPlaceId?: string;
  birthPlaceLabel: string;
}): { ok: true; data: KismetLocationContext } | { ok: false; error: { reasonCode: string; message: string; actionHint: string } } {
  const birthCity = resolveBirthCity(input);
  if (!birthCity) {
    return {
      ok: true,
      data: buildStubLocationContext(input.birthPlaceLabel),
    };
  }

  const birthRelation = describeElementSupport(input.profile.dayMaster.element, birthCity.baseElement);
  const rankedCities = CITY_CATALOG
    .map((city) => toAffinityItem(input.profile, city))
    .sort((left, right) => right.score - left.score || left.cityZh.localeCompare(right.cityZh))
    .slice(0, 5);

  const birthCityItem = toAffinityItem(input.profile, birthCity);
  return {
    ok: true,
    data: {
      birthCity: {
        ...birthCityItem,
        relationToDayMaster: birthRelation,
        summary: `${birthCity.cityZh}偏${ELEMENT_LABELS[birthCity.baseElement]}，对${input.profile.dayMaster.label}属于${birthRelation}环境。`,
      },
      topCityId: rankedCities[0]!.cityId,
      topCities: rankedCities,
    },
  };
}

function buildStubLocationContext(label: string): KismetLocationContext {
  const stub: KismetCityAffinityItem = {
    cityId: '',
    city: label,
    cityZh: label,
    country: '',
    countryZh: '',
    lat: 0,
    lng: 0,
    baseElement: 'earth',
    elementWeights: { metal: 20, wood: 20, water: 20, fire: 20, earth: 20 },
    themeColor: '#6366f1',
    score: 50,
    reason: '',
  };
  return {
    birthCity: { ...stub, relationToDayMaster: 'balances', summary: label },
    topCityId: '',
    topCities: [],
  };
}

export function describeCompatibilityRelation(self: ElementKey, target: ElementKey): string {
  if (self === target) {
    return `${ELEMENT_LABELS[self]}同频`;
  }
  if (GENERATES[self] === target) {
    return `${ELEMENT_LABELS[self]}生${ELEMENT_LABELS[target]}`;
  }
  if (GENERATED_BY[self] === target) {
    return `${ELEMENT_LABELS[target]}生${ELEMENT_LABELS[self]}`;
  }
  return `${ELEMENT_LABELS[self]}与${ELEMENT_LABELS[target]}相制`;
}
