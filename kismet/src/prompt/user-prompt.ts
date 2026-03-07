import type {
  KismetCanonicalProfile,
  KismetCompatibilityInput,
  KismetDailyFortuneResult,
  KismetLocationContext,
} from '../types.js';
import { HEAVENLY_STEMS, EARTHLY_BRANCHES, BRANCH_TO_ZODIAC } from '../services/bazi/constants.js';

function buildBirthCitySummary(locationContext: KismetLocationContext) {
  return {
    city: locationContext.birthCity.city,
    cityZh: locationContext.birthCity.cityZh,
    country: locationContext.birthCity.country,
    countryZh: locationContext.birthCity.countryZh,
    baseElement: locationContext.birthCity.baseElement,
    relationToDayMaster: locationContext.birthCity.relationToDayMaster,
    summary: locationContext.birthCity.summary,
  };
}

function getCurrentYearContext() {
  const year = new Date().getFullYear();
  const stemIndex = ((year - 4) % 10 + 10) % 10;
  const branchIndex = ((year - 4) % 12 + 12) % 12;
  const stem = HEAVENLY_STEMS[stemIndex]!;
  const branch = EARTHLY_BRANCHES[branchIndex]!;
  return {
    currentYear: year,
    currentYearGanZhi: `${stem}${branch}`,
    currentYearZodiac: BRANCH_TO_ZODIAC[branch],
  };
}

export function buildNatalUserPrompt(input: {
  canonicalProfile: KismetCanonicalProfile;
  birthCityLabel: string;
}): string {
  const profile = input.canonicalProfile;
  return JSON.stringify({
    pillars: profile.pillars,
    dayMaster: profile.dayMaster.label,
    fiveElementRatio: profile.fiveElementRatio,
    favorableElements: profile.favorableElements,
    unfavorableElements: profile.unfavorableElements,
    bigLuckCycles: profile.bigLuckCycles,
    startAge: profile.startAge,
    birthCity: input.birthCityLabel,
    ...getCurrentYearContext(),
  });
}

export function buildDailyUserPrompt(input: {
  canonicalProfile: KismetCanonicalProfile;
  dailyDefaults: Pick<
    KismetDailyFortuneResult,
    'date' | 'timezone' | 'todayGanZhi' | 'overallScore' | 'careerScore' | 'relationshipScore' | 'wealthScore' | 'healthScore' | 'luckyElements' | 'luckyDirections' | 'luckyColors' | 'luckyNumbers'
  >;
  locationContext: KismetLocationContext;
}): string {
  return JSON.stringify({
    canonicalProfile: input.canonicalProfile,
    dailyDefaults: input.dailyDefaults,
    birthCitySummary: buildBirthCitySummary(input.locationContext),
    instructions: {
      recommendedActionsCount: '2-5',
      avoidActionsCount: '2-5',
      summaryMaxLength: 120,
    },
  }, null, 2);
}

export function buildCompatibilityUserPrompt(input: KismetCompatibilityInput): string {
  return JSON.stringify({
    selfProfile: input.selfProfile,
    targetProfile: input.targetProfile,
    deterministicCompatibilityScore: input.score,
    relationSummary: input.relationSummary,
    instructions: {
      complementaryAreasCount: '1-3',
      tensionAreasCount: '0-3',
      summaryMaxLength: 80,
      adviceMaxLength: 80,
    },
  }, null, 2);
}
