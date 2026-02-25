export type Gender = 'Male' | 'Female';

export type KismetInput = {
  name?: string;
  gender: Gender;
  birthYear: number;
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  startAge: number;
  firstDaYun: string;
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

export type AnalysisDimension = {
  summary: string;
  summaryScore: number;
  personality: string;
  personalityScore: number;
  industry: string;
  industryScore: number;
  fengShui: string;
  fengShuiScore: number;
  wealth: string;
  wealthScore: number;
  marriage: string;
  marriageScore: number;
  health: string;
  healthScore: number;
  family: string;
  familyScore: number;
  crypto: string;
  cryptoScore: number;
  cryptoYear: string;
  cryptoStyle: string;
};

export type KismetResult = {
  analysis: AnalysisDimension;
  chartData: ChartDataPoint[];
};

export type AiKeyNode = {
  age: number;
  daYun: string;
  score: number;
  open: number;
  close: number;
  high: number;
  low: number;
  tag: string;
};

export type AiKismetOutput = {
  analysis: AnalysisDimension;
  keyNodes: AiKeyNode[];
};

export type KismetError = {
  reasonCode: string;
  message: string;
  actionHint: string;
};

export type KismetMode = 'prompt-import' | 'runtime-ai';

export type RouteSourceDisplay = 'local-runtime' | 'token-api' | 'unavailable';
