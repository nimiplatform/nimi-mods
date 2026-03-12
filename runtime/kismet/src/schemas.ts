import { z } from 'zod';

export const ElementKeySchema = z.enum(['metal', 'wood', 'water', 'fire', 'earth']);

export const GenderSchema = z.enum(['male', 'female']);

export const KismetConsentSchema = z.object({
  allowLocalProfilePersist: z.boolean(),
  allowLocalProfileMatchUse: z.boolean(),
  allowCityAffinityUse: z.boolean(),
});

export const KismetBirthInputSchema = z.object({
  name: z.string().trim().max(40).optional(),
  gender: GenderSchema,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/),
  birthPlaceLabel: z.string().trim().min(1).max(80),
  birthPlaceId: z.string().trim().min(1).optional(),
  timezone: z.string().trim().min(1),
  consent: KismetConsentSchema,
});

export const FiveElementDistributionSchema = z.object({
  metal: z.number().int().min(0).max(100),
  wood: z.number().int().min(0).max(100),
  water: z.number().int().min(0).max(100),
  fire: z.number().int().min(0).max(100),
  earth: z.number().int().min(0).max(100),
}).refine((value) => (
  value.metal + value.wood + value.water + value.fire + value.earth
) === 100, {
  message: 'fiveElementRatio must sum to 100',
});

export const DayMasterSchema = z.object({
  label: z.string().min(1),
  stem: z.string().min(1),
  element: ElementKeySchema,
  yinYang: z.enum(['yin', 'yang']),
});

export const KismetPillarsSchema = z.object({
  year: z.string().min(2),
  month: z.string().min(2),
  day: z.string().min(2),
  hour: z.string().min(2),
});

export const KismetCanonicalProfileSchema = z.object({
  pillars: KismetPillarsSchema,
  zodiac: z.string().min(1),
  dayMaster: DayMasterSchema,
  fiveElementRatio: FiveElementDistributionSchema,
  favorableElements: z.array(ElementKeySchema).min(1).max(3),
  unfavorableElements: z.array(ElementKeySchema).min(1).max(3),
  compatibleArchetypes: z.array(z.string().min(1)).min(1),
  conflictArchetypes: z.array(z.string().min(1)).min(1),
  startAge: z.number().int().min(1).max(30),
  firstDaYun: z.string().min(2),
  bigLuckCycles: z.array(z.string().min(2)).min(1),
});

export const AnalysisScoresSchema = z.object({
  summary: z.number().min(0).max(10),
  personality: z.number().min(0).max(10),
  industry: z.number().min(0).max(10),
  fengShui: z.number().min(0).max(10),
  wealth: z.number().min(0).max(10),
  marriage: z.number().min(0).max(10),
  health: z.number().min(0).max(10),
  family: z.number().min(0).max(10),
  crypto: z.number().min(0).max(10),
});

const AnalysisTagArraySchema = z.array(z.string().min(1).max(8)).min(1).max(3);

const AnalysisTagsSchema = z.object({
  summary: AnalysisTagArraySchema,
  personality: AnalysisTagArraySchema,
  industry: AnalysisTagArraySchema,
  fengShui: AnalysisTagArraySchema,
  wealth: AnalysisTagArraySchema,
  marriage: AnalysisTagArraySchema,
  health: AnalysisTagArraySchema,
  family: AnalysisTagArraySchema,
  crypto: AnalysisTagArraySchema,
});

const ZodiacYearFortuneSchema = z.object({
  year: z.string().min(1),
  zodiac: z.string().min(1),
  wealth: z.string().min(1),
  relationship: z.string().min(1),
  career: z.string().min(1),
});

export const NatalAnalysisTextSchema = z.object({
  summary: z.string().min(1),
  personality: z.string().min(1),
  industry: z.string().min(1),
  fengShui: z.string().min(1),
  wealth: z.string().min(1),
  marriage: z.string().min(1),
  health: z.string().min(1),
  family: z.string().min(1),
  crypto: z.string().min(1),
  partnerAffinitySummary: z.string().min(1),
  cryptoYear: z.string().min(1),
  cryptoStyle: z.string().min(1),
  scores: AnalysisScoresSchema,
  tags: AnalysisTagsSchema,
  zodiacYearFortune: ZodiacYearFortuneSchema,
});

export const KismetAiKeyNodeSchema = z.object({
  age: z.number().int().min(1).max(100),
  daYun: z.string().min(1),
  score: z.number().min(0).max(100),
  open: z.number().min(0).max(100),
  close: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
  low: z.number().min(0).max(100),
  tag: z.string().min(1),
}).refine((value) => value.high >= Math.max(value.open, value.close), {
  message: 'high must be >= max(open, close)',
}).refine((value) => value.low <= Math.min(value.open, value.close), {
  message: 'low must be <= min(open, close)',
});

export const KismetRecommendedCitySchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  description: z.string().min(1),
});

export const KismetNatalAiOutputSchema = z.object({
  analysis: NatalAnalysisTextSchema,
  keyNodes: z.array(KismetAiKeyNodeSchema).min(5).max(15),
  recommendedCities: z.array(KismetRecommendedCitySchema).max(3).default([]),
  citySummary: z.string().max(40).default(''),
}).refine((value) => value.keyNodes[0]?.age === 1, {
  message: 'keyNodes must start from age 1',
}).refine((value) => (value.keyNodes[value.keyNodes.length - 1]?.age || 0) >= 95, {
  message: 'keyNodes must end at age >= 95',
}).refine((value) => {
  for (let index = 1; index < value.keyNodes.length; index += 1) {
    if (value.keyNodes[index]!.age <= value.keyNodes[index - 1]!.age) {
      return false;
    }
  }
  return true;
}, {
  message: 'keyNodes age must be strictly increasing',
});

export const ChartDataPointSchema = z.object({
  age: z.number().int().min(1).max(100),
  year: z.number().int(),
  ganZhi: z.string().min(1),
  daYun: z.string().min(1),
  open: z.number().min(0).max(100),
  close: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
  low: z.number().min(0).max(100),
  score: z.number().min(0).max(100),
  reason: z.string().min(1),
}).refine((value) => value.high >= Math.max(value.open, value.close), {
  message: 'high must be >= max(open, close)',
}).refine((value) => value.low <= Math.min(value.open, value.close), {
  message: 'low must be <= min(open, close)',
});

export const KismetCityAffinityItemSchema = z.object({
  cityId: z.string().min(1),
  city: z.string().min(1),
  cityZh: z.string().min(1),
  country: z.string().min(1),
  countryZh: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  baseElement: ElementKeySchema,
  elementWeights: FiveElementDistributionSchema,
  themeColor: z.string().min(1),
  score: z.number().min(0).max(100),
  reason: z.string().min(1),
});

export const KismetLocationContextSchema = z.object({
  birthCity: KismetCityAffinityItemSchema.extend({
    relationToDayMaster: z.enum(['supports', 'balances', 'drains', 'conflicts']),
    summary: z.string().min(1),
  }),
  topCityId: z.string().min(1),
  topCities: z.array(KismetCityAffinityItemSchema).min(1).max(5),
});

export const KismetNatalAnalysisResultSchema = z.object({
  canonicalProfile: KismetCanonicalProfileSchema,
  birthCityLabel: z.string().min(1),
  locationContext: KismetLocationContextSchema.optional(),
  analysis: NatalAnalysisTextSchema,
  keyNodes: z.array(KismetAiKeyNodeSchema).min(5).max(15),
  chartData: z.array(ChartDataPointSchema).length(100),
  recommendedCities: z.array(KismetRecommendedCitySchema).max(3).default([]),
  citySummary: z.string().max(40).optional(),
}).refine((value) => value.chartData[0]?.age === 1 && value.chartData[99]?.age === 100, {
  message: 'chartData must span ages 1..100',
}).refine((value) => {
  for (let index = 1; index < value.chartData.length; index += 1) {
    if (value.chartData[index]!.age <= value.chartData[index - 1]!.age) {
      return false;
    }
  }
  return true;
}, {
  message: 'chartData age must be strictly increasing',
});

export const KismetDailyFortuneResultSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  todayGanZhi: z.string().min(2),
  overallScore: z.number().min(0).max(100),
  careerScore: z.number().min(0).max(100),
  relationshipScore: z.number().min(0).max(100),
  wealthScore: z.number().min(0).max(100),
  healthScore: z.number().min(0).max(100),
  luckyElements: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string().min(1)).min(1).max(3)),
  luckyDirections: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string().min(1)).min(1).max(3)),
  luckyColors: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string().min(1)).min(1).max(3)),
  luckyNumbers: z.preprocess((v) => (typeof v === 'number' ? [v] : v), z.array(z.number().int().min(1).max(9)).min(1).max(3)),
  recommendedActions: z.array(z.string().min(1)).min(2).max(5),
  avoidActions: z.array(z.string().min(1)).min(2).max(5),
  summary: z.string().min(1),
});

export const KismetCompatibilityResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  fiveElementRelation: z.string().min(1),
  complementaryAreas: z.array(z.string().min(1)).min(1).max(3),
  tensionAreas: z.array(z.string().min(1)).max(3),
  summary: z.string().min(1),
  advice: z.string().min(1),
});

export const KismetFortuneStickResultSchema = z.object({
  stickNumber: z.number().int().min(1).max(100),
  rank: z.enum(['上上签', '上签', '中上签', '中签', '中下签', '下签', '下下签']),
  rankEn: z.string().min(1),
  poem: z.array(z.string().min(1)).length(4),
  interpretation: z.string().min(1),
  career: z.string().min(1),
  relationship: z.string().min(1),
  wealth: z.string().min(1),
  health: z.string().min(1),
  advice: z.string().min(1),
});

export const KismetLocalShareProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  createdAt: z.string().min(1),
  canonicalProfile: z.object({
    dayMaster: DayMasterSchema,
    fiveElementRatio: FiveElementDistributionSchema,
    favorableElements: z.array(ElementKeySchema).min(1),
    unfavorableElements: z.array(ElementKeySchema).min(1),
    compatibleArchetypes: z.array(z.string().min(1)).min(1),
    conflictArchetypes: z.array(z.string().min(1)).min(1),
  }),
});
