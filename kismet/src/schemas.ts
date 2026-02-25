import { z } from 'zod';

export const GenderSchema = z.enum(['Male', 'Female']);

export const KismetInputSchema = z.object({
  name: z.string().optional(),
  gender: GenderSchema,
  birthYear: z.number().int().min(1900).max(2100),
  yearPillar: z.string().min(1),
  monthPillar: z.string().min(1),
  dayPillar: z.string().min(1),
  hourPillar: z.string().min(1),
  startAge: z.number().int().min(1),
  firstDaYun: z.string().min(1),
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
}).refine(
  (d) => d.high >= Math.max(d.open, d.close),
  { message: 'high must be >= max(open, close)' },
).refine(
  (d) => d.low <= Math.min(d.open, d.close),
  { message: 'low must be <= min(open, close)' },
);

export const AnalysisDimensionSchema = z.object({
  summary: z.string().min(1),
  summaryScore: z.number().min(0).max(10),
  personality: z.string().min(1),
  personalityScore: z.number().min(0).max(10),
  industry: z.string().min(1),
  industryScore: z.number().min(0).max(10),
  fengShui: z.string().min(1),
  fengShuiScore: z.number().min(0).max(10),
  wealth: z.string().min(1),
  wealthScore: z.number().min(0).max(10),
  marriage: z.string().min(1),
  marriageScore: z.number().min(0).max(10),
  health: z.string().min(1),
  healthScore: z.number().min(0).max(10),
  family: z.string().min(1),
  familyScore: z.number().min(0).max(10),
  crypto: z.string().min(1),
  cryptoScore: z.number().min(0).max(10),
  cryptoYear: z.string().min(1),
  cryptoStyle: z.string().min(1),
});

export const KismetResultSchema = z.object({
  analysis: AnalysisDimensionSchema,
  chartData: z.array(ChartDataPointSchema).length(100),
}).refine(
  (r) => {
    for (let i = 1; i < r.chartData.length; i++) {
      if (r.chartData[i]!.age <= r.chartData[i - 1]!.age) return false;
    }
    return true;
  },
  { message: 'chartData age must be strictly monotonically increasing' },
).refine(
  (r) => r.chartData[0]?.age === 1 && r.chartData[99]?.age === 100,
  { message: 'chartData must span ages 1-100' },
);

export const AiKeyNodeSchema = z.object({
  age: z.number().int().min(1).max(100),
  daYun: z.string().min(1),
  score: z.number().min(0).max(100),
  open: z.number().min(0).max(100),
  close: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
  low: z.number().min(0).max(100),
  tag: z.string().min(1),
}).refine(
  (d) => d.high >= Math.max(d.open, d.close),
  { message: 'high must be >= max(open, close)' },
).refine(
  (d) => d.low <= Math.min(d.open, d.close),
  { message: 'low must be <= min(open, close)' },
);

export const AiKismetOutputSchema = z.object({
  analysis: AnalysisDimensionSchema,
  keyNodes: z.array(AiKeyNodeSchema).min(5).max(20),
}).refine(
  (r) => {
    for (let i = 1; i < r.keyNodes.length; i++) {
      if (r.keyNodes[i]!.age <= r.keyNodes[i - 1]!.age) return false;
    }
    return true;
  },
  { message: 'keyNodes age must be strictly monotonically increasing' },
);
