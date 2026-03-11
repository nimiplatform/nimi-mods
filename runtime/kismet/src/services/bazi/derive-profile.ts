import type { ElementKey, FiveElementDistribution, Gender, KismetBirthInputV2, KismetCanonicalProfile } from '../../types.js';
import {
  BRANCH_TO_ELEMENT,
  BRANCH_TO_ZODIAC,
  CONTROLLED_BY,
  CONTROLS,
  EARTHLY_BRANCHES,
  ELEMENT_ARCHETYPES,
  ELEMENT_LABELS,
  GENERATED_BY,
  GENERATES,
  HEAVENLY_STEMS,
  STEM_TO_ELEMENT,
  STEM_TO_YIN_YANG,
} from './constants.js';
import { addCivilDays, parseCivilDateParts, parseCivilTimeParts, zonedCivilStringToUtc } from './datetime.js';
import { resolveDaysToAdjacentSolarTerm, resolveSolarMonthIndex, resolveStartOfSpring } from './solar-terms.js';

type Ganzhi = {
  stem: (typeof HEAVENLY_STEMS)[number];
  branch: (typeof EARTHLY_BRANCHES)[number];
  label: string;
};

const HOUR_BRANCHES: Array<(typeof EARTHLY_BRANCHES)[number]> = [
  '子', '丑', '丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午',
  '午', '未', '未', '申', '申', '酉', '酉', '戌', '戌', '亥', '亥', '子',
];

const DAY_MASTER_WEAK_THRESHOLD = 42;

function positiveMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function parseCivilDate(date: string): Date {
  const [year = 2000, month = 1, day = 1] = date.split('-').map((item) => Number(item));
  return new Date(year, month - 1, day);
}

function dayDiff(left: Date, right: Date): number {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / 86_400_000);
}

function buildGanzhi(stemIndex: number, branchIndex: number): Ganzhi {
  const stem = HEAVENLY_STEMS[positiveMod(stemIndex, 10)]!;
  const branch = EARTHLY_BRANCHES[positiveMod(branchIndex, 12)]!;
  return {
    stem,
    branch,
    label: `${stem}${branch}`,
  };
}

function deriveYearGanzhi(birthInstant: Date, birthLocalYear: number): Ganzhi {
  const startOfSpring = resolveStartOfSpring(birthLocalYear);
  const effectiveYear = birthInstant < startOfSpring ? birthLocalYear - 1 : birthLocalYear;
  return buildGanzhi(effectiveYear - 4, effectiveYear - 4);
}

function deriveMonthGanzhi(birthInstant: Date, birthLocalYear: number, yearStemIndex: number): Ganzhi {
  const solarMonthIndex = resolveSolarMonthIndex(birthInstant, birthLocalYear);
  const branchIndex = solarMonthIndex + 2;
  const startStemIndex = positiveMod((positiveMod(yearStemIndex, 5) * 2) + 2, 10);
  return buildGanzhi(startStemIndex + solarMonthIndex, branchIndex);
}

function deriveDayGanzhi(date: Date): Ganzhi {
  const reference = new Date(1984, 1, 2);
  const offset = dayDiff(date, reference);
  return buildGanzhi(offset + 2, offset + 2);
}

function deriveHourGanzhi(dayStemIndex: number, birthHour: number): Ganzhi {
  const hour = positiveMod(birthHour, 24);
  const branch = HOUR_BRANCHES[hour] || '子';
  const branchIndex = EARTHLY_BRANCHES.indexOf(branch);
  const stemIndex = positiveMod((dayStemIndex % 5) * 2 + branchIndex, 10);
  return buildGanzhi(stemIndex, branchIndex);
}

function normalizeToHundred(raw: FiveElementDistribution): FiveElementDistribution {
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  const normalizedEntries = Object.entries(raw).map(([key, value]) => [key, Math.max(0, Math.round((value / total) * 100))] as const);
  let result = Object.fromEntries(normalizedEntries) as FiveElementDistribution;
  const diff = 100 - Object.values(result).reduce((sum, value) => sum + value, 0);
  if (diff !== 0) {
    const sortedKeys = (Object.keys(result) as ElementKey[]).sort((left, right) => result[right] - result[left]);
    result = {
      ...result,
      [sortedKeys[0]!]: result[sortedKeys[0]!] + diff,
    };
  }
  return result;
}

function deriveFiveElementRatio(pillars: Ganzhi[]): FiveElementDistribution {
  const raw: FiveElementDistribution = {
    metal: 0,
    wood: 0,
    water: 0,
    fire: 0,
    earth: 0,
  };

  for (const pillar of pillars) {
    raw[STEM_TO_ELEMENT[pillar.stem]] += 12;
    raw[BRANCH_TO_ELEMENT[pillar.branch]] += 8;
  }

  raw[BRANCH_TO_ELEMENT[pillars[1]!.branch]] += 20;
  return normalizeToHundred(raw);
}

function deriveElementPreferences(dayMasterElement: ElementKey, distribution: FiveElementDistribution) {
  const supportScore = distribution[dayMasterElement] + distribution[GENERATED_BY[dayMasterElement]];
  const dayMasterWeak = supportScore <= DAY_MASTER_WEAK_THRESHOLD;
  const favorableElements = dayMasterWeak
    ? [dayMasterElement, GENERATED_BY[dayMasterElement]]
    : [CONTROLLED_BY[dayMasterElement], GENERATES[dayMasterElement]];
  const unfavorableElements = dayMasterWeak
    ? [CONTROLLED_BY[dayMasterElement], GENERATES[dayMasterElement]]
    : [dayMasterElement, GENERATED_BY[dayMasterElement]];
  return {
    favorableElements,
    unfavorableElements,
    compatibleArchetypes: favorableElements.map((item) => `${ELEMENT_LABELS[item]}旺之人（${ELEMENT_ARCHETYPES[item]}）`),
    conflictArchetypes: unfavorableElements.map((item) => `${ELEMENT_LABELS[item]}强势之人（${ELEMENT_ARCHETYPES[item]}）`),
  };
}

function deriveLuckDirection(yearStem: Ganzhi, monthPillar: Ganzhi, gender: Gender) {
  const isYearStemYang = STEM_TO_YIN_YANG[yearStem.stem] === 'yang';
  return (gender === 'male' && isYearStemYang) || (gender === 'female' && !isYearStemYang)
    ? 1
    : -1;
}

function shiftGanzhi(input: Ganzhi, steps: number): Ganzhi {
  const stemIndex = HEAVENLY_STEMS.indexOf(input.stem);
  const branchIndex = EARTHLY_BRANCHES.indexOf(input.branch);
  return buildGanzhi(stemIndex + steps, branchIndex + steps);
}

export function deriveCanonicalProfile(input: KismetBirthInputV2): KismetCanonicalProfile {
  const birthDateParts = parseCivilDateParts(input.birthDate);
  const birthTimeParts = parseCivilTimeParts(input.birthTime);
  const birthInstant = zonedCivilStringToUtc(input.birthDate, input.birthTime, input.timezone);
  const dayBoundaryDate = birthTimeParts.hour >= 23 ? addCivilDays(input.birthDate, 1) : input.birthDate;
  const birthDate = parseCivilDate(dayBoundaryDate);

  const yearPillar = deriveYearGanzhi(birthInstant, birthDateParts.year);
  const yearStemIndex = HEAVENLY_STEMS.indexOf(yearPillar.stem);
  const monthPillar = deriveMonthGanzhi(birthInstant, birthDateParts.year, yearStemIndex);
  const dayPillar = deriveDayGanzhi(birthDate);
  const dayStemIndex = HEAVENLY_STEMS.indexOf(dayPillar.stem);
  const hourPillar = deriveHourGanzhi(dayStemIndex, birthTimeParts.hour);
  const fiveElementRatio = deriveFiveElementRatio([yearPillar, monthPillar, dayPillar, hourPillar]);
  const dayMasterElement = STEM_TO_ELEMENT[dayPillar.stem];
  const preferences = deriveElementPreferences(dayMasterElement, fiveElementRatio);
  const direction = deriveLuckDirection(yearPillar, monthPillar, input.gender);
  const adjacentSolarTermDays = resolveDaysToAdjacentSolarTerm(
    birthInstant,
    birthDateParts.year,
    direction === 1 ? 1 : -1,
  );
  const startAge = Math.max(1, Math.min(12, Math.round(adjacentSolarTermDays / 3)));
  const firstDaYun = shiftGanzhi(monthPillar, direction).label;
  const bigLuckCycles = Array.from({ length: 8 }, (_, index) => shiftGanzhi(monthPillar, direction * (index + 1)).label);

  return {
    pillars: {
      year: yearPillar.label,
      month: monthPillar.label,
      day: dayPillar.label,
      hour: hourPillar.label,
    },
    zodiac: BRANCH_TO_ZODIAC[yearPillar.branch],
    dayMaster: {
      label: `${dayPillar.stem}${ELEMENT_LABELS[dayMasterElement]}`,
      stem: dayPillar.stem,
      element: dayMasterElement,
      yinYang: STEM_TO_YIN_YANG[dayPillar.stem],
    },
    fiveElementRatio,
    favorableElements: preferences.favorableElements,
    unfavorableElements: preferences.unfavorableElements,
    compatibleArchetypes: preferences.compatibleArchetypes,
    conflictArchetypes: preferences.conflictArchetypes,
    startAge,
    firstDaYun,
    bigLuckCycles,
  };
}

export function describeElementSupport(self: ElementKey, target: ElementKey): 'supports' | 'balances' | 'drains' | 'conflicts' {
  if (self === target || GENERATED_BY[self] === target || GENERATED_BY[target] === self) {
    return self === target ? 'balances' : 'supports';
  }
  if (CONTROLS[target] === self || CONTROLLED_BY[target] === self) {
    return 'conflicts';
  }
  return 'drains';
}
