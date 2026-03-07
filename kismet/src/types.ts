export type Gender = 'male' | 'female';

export type ElementKey = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export type RouteSourceDisplay = 'local-runtime' | 'token-api' | 'unavailable';

export type KismetFeatureTab = 'natal-profile' | 'daily-fortune' | 'compatibility';

export type KismetConsent = {
  allowLocalProfilePersist: boolean;
  allowLocalProfileMatchUse: boolean;
  allowCityAffinityUse: boolean;
};

export type KismetBirthInputV2 = {
  name?: string;
  gender: Gender;
  birthDate: string;
  birthTime: string;
  birthPlaceLabel: string;
  birthPlaceId?: string;
  timezone: string;
  consent: KismetConsent;
};

export type FiveElementDistribution = Record<ElementKey, number>;

export type DayMaster = {
  label: string;
  stem: string;
  element: ElementKey;
  yinYang: 'yin' | 'yang';
};

export type KismetPillars = {
  year: string;
  month: string;
  day: string;
  hour: string;
};

export type KismetCanonicalProfile = {
  pillars: KismetPillars;
  zodiac: string;
  dayMaster: DayMaster;
  fiveElementRatio: FiveElementDistribution;
  favorableElements: ElementKey[];
  unfavorableElements: ElementKey[];
  compatibleArchetypes: string[];
  conflictArchetypes: string[];
  startAge: number;
  firstDaYun: string;
  bigLuckCycles: string[];
};

export type CityCatalogTier = 'cn-major' | 'global-major';

export type CityCatalogEntry = {
  cityId: string;
  city: string;
  cityZh: string;
  country: string;
  countryZh: string;
  province?: string;
  provinceZh?: string;
  lat: number;
  lng: number;
  timezone: string;
  tier: CityCatalogTier;
  baseElement: ElementKey;
  elementWeights: FiveElementDistribution;
  themeColor: string;
  rationaleTags: string[];
  rationaleSummary: string;
};

export type KismetBirthCityRelation = 'supports' | 'balances' | 'drains' | 'conflicts';

export type KismetCityAffinityItem = {
  cityId: string;
  city: string;
  cityZh: string;
  country: string;
  countryZh: string;
  lat: number;
  lng: number;
  baseElement: ElementKey;
  elementWeights: FiveElementDistribution;
  themeColor: string;
  score: number;
  reason: string;
};

export type KismetLocationContext = {
  birthCity: KismetCityAffinityItem & {
    relationToDayMaster: KismetBirthCityRelation;
    summary: string;
  };
  topCityId: string;
  topCities: KismetCityAffinityItem[];
};

export type ChartDataPoint = {
  age: number;
  year: number;
  ganZhi: string;
  daYun: string;
  open: number;
  close: number;
  high: number;
  low: number;
  score: number;
  reason: string;
};

export type AnalysisScores = {
  summary: number;
  personality: number;
  industry: number;
  fengShui: number;
  wealth: number;
  marriage: number;
  health: number;
  family: number;
  crypto: number;
};

export type AnalysisTags = Record<string, string[]>;

export type ZodiacYearFortune = {
  year: string;
  zodiac: string;
  wealth: string;
  relationship: string;
  career: string;
};

export type NatalAnalysisText = {
  summary: string;
  personality: string;
  industry: string;
  fengShui: string;
  wealth: string;
  marriage: string;
  health: string;
  family: string;
  crypto: string;
  partnerAffinitySummary: string;
  cryptoYear: string;
  cryptoStyle: string;
  scores: AnalysisScores;
  tags: AnalysisTags;
  zodiacYearFortune: ZodiacYearFortune;
};

export type KismetNatalAnalysisResult = {
  canonicalProfile: KismetCanonicalProfile;
  birthCityLabel: string;
  locationContext?: KismetLocationContext;
  analysis: NatalAnalysisText;
  keyNodes: Array<{
    age: number;
    daYun: string;
    score: number;
    open: number;
    close: number;
    high: number;
    low: number;
    tag: string;
  }>;
  chartData: ChartDataPoint[];
  recommendedCities: KismetRecommendedCity[];
  citySummary?: string;
};

export type KismetDailyFortuneResult = {
  date: string;
  timezone: string;
  todayGanZhi: string;
  overallScore: number;
  careerScore: number;
  relationshipScore: number;
  wealthScore: number;
  healthScore: number;
  luckyElements: ElementKey[];
  luckyDirections: string[];
  luckyColors: string[];
  luckyNumbers: number[];
  recommendedActions: string[];
  avoidActions: string[];
  summary: string;
};

export type KismetLocalShareProfile = {
  id: string;
  displayName: string;
  createdAt: string;
  canonicalProfile: Pick<
    KismetCanonicalProfile,
    'dayMaster' | 'fiveElementRatio' | 'favorableElements' | 'unfavorableElements' | 'compatibleArchetypes' | 'conflictArchetypes'
  >;
};

export type KismetCompatibilityInput = {
  selfProfile: KismetLocalShareProfile;
  targetProfile: KismetLocalShareProfile;
  relationSummary: string;
  score: number;
};

export type KismetCompatibilityResult = {
  overallScore: number;
  fiveElementRelation: string;
  complementaryAreas: string[];
  tensionAreas: string[];
  summary: string;
  advice: string;
};

export type KismetPromptKind = 'natal-profile' | 'daily-fortune' | 'compatibility';

export type GeneratedPromptPackage = {
  kind: KismetPromptKind;
  title: string;
  systemPrompt: string;
  userPrompt: string;
};

export type KismetAiRawResponse = {
  text: string;
  traceId?: string;
  routeSource: RouteSourceDisplay;
  resolvedModel?: string;
  resolvedConnectorId?: string;
  resolvedProvider?: string;
  length: number;
  escapedText: string;
  firstChar?: string;
  lastChar?: string;
};

export type KismetError = {
  reasonCode: string;
  message: string;
  actionHint: string;
  traceId?: string;
  upstreamReasonCode?: string;
  diagnosticPreview?: string;
  diagnosticTailPreview?: string;
  diagnosticLength?: number;
};

export type KismetRecommendedCity = {
  name: string;
  score: number;
  description: string;
};

export type KismetAiKeyNode = {
  age: number;
  daYun: string;
  score: number;
  open: number;
  close: number;
  high: number;
  low: number;
  tag: string;
};

export type KismetNatalAiOutput = {
  analysis: NatalAnalysisText;
  keyNodes: KismetAiKeyNode[];
  recommendedCities: KismetRecommendedCity[];
  citySummary: string;
};
