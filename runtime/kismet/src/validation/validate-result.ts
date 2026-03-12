import {
  KismetCompatibilityResultSchema,
  KismetDailyFortuneResultSchema,
  KismetFortuneStickResultSchema,
  KismetNatalAiOutputSchema,
  KismetNatalAnalysisResultSchema,
} from '../schemas.js';
import { ANALYSIS_DIMENSIONS } from '../contracts.js';
import { KISMET_REASON } from '../contracts.js';
import { BRANCH_TO_ZODIAC, EARTHLY_BRANCHES, HEAVENLY_STEMS } from '../services/bazi/constants.js';
import type {
  KismetNatalAiOutput,
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetError,
  KismetFortuneStickResult,
  KismetNatalAnalysisResult,
} from '../types.js';
import { kismetMessage } from '../i18n/messages.js';

type ValidationFailure = { ok: false; error: KismetError };
type AnalysisDimensionKey = (typeof ANALYSIS_DIMENSIONS)[number];

const DEFAULT_DIMENSION_TAGS: Record<AnalysisDimensionKey, string> = {
  summary: '命局总览',
  personality: '性情取向',
  industry: '事业格局',
  fengShui: '风水宜忌',
  wealth: '财势轻重',
  marriage: '姻缘趋向',
  health: '身元起伏',
  family: '家宅气象',
  crypto: '虚财节奏',
};

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function asText(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input.trim() : fallback;
}

function deriveScoreFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 6;
  }

  let score = 6;
  const positiveSignals = ['吉', '旺', '利', '顺', '贵', '安', '稳', '得', '厚', '宜', '丰'];
  const negativeSignals = ['凶', '忌', '阻', '冲', '刑', '耗', '险', '病', '弱', '困', '损'];

  if (positiveSignals.some((item) => normalized.includes(item))) {
    score += 2;
  }
  if (negativeSignals.some((item) => normalized.includes(item))) {
    score -= 2;
  }

  return Math.max(0, Math.min(10, score));
}

function deriveTagsFromText(text: string, fallback: string): string[] {
  const parts = text
    .replace(/[：:]/g, '，')
    .split(/[，。；、！？\n]/)
    .map((item) => item.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, ''))
    .filter(Boolean)
    .map((item) => item.slice(0, 8))
    .filter(Boolean);

  const unique = Array.from(new Set(parts));
  if (unique.length > 0) {
    return unique.slice(0, 3);
  }
  return [fallback];
}

function buildCurrentYearContext() {
  const currentYear = new Date().getFullYear();
  const stem = HEAVENLY_STEMS[((currentYear - 4) % 10 + 10) % 10]!;
  const branch = EARTHLY_BRANCHES[((currentYear - 4) % 12 + 12) % 12]!;
  return {
    year: `${stem}${branch}年`,
    zodiac: BRANCH_TO_ZODIAC[branch],
  };
}

function normalizeNatalAiOutput(raw: unknown): unknown {
  const root = asRecord(raw);
  const analysis = asRecord(root.analysis);
  if (Object.keys(analysis).length === 0) {
    return raw;
  }

  const scores = asRecord(analysis.scores);
  const tags = asRecord(analysis.tags);
  const currentYear = buildCurrentYearContext();

  const normalizedScores = Object.fromEntries(
    ANALYSIS_DIMENSIONS.map((dimension) => {
      const value = scores[dimension];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return [dimension, Math.max(0, Math.min(10, value))];
      }
      return [dimension, deriveScoreFromText(asText(analysis[dimension]))];
    }),
  );

  const normalizedTags = Object.fromEntries(
    ANALYSIS_DIMENSIONS.map((dimension) => {
      const value = tags[dimension];
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return [dimension, value.map((item) => item.trim()).filter(Boolean).slice(0, 3)];
      }
      return [dimension, deriveTagsFromText(asText(analysis[dimension]), DEFAULT_DIMENSION_TAGS[dimension])];
    }),
  );

  const zodiacYearFortune = asRecord(analysis.zodiacYearFortune);
  const normalizedZodiacYearFortune = {
    year: asText(zodiacYearFortune.year, currentYear.year),
    zodiac: asText(zodiacYearFortune.zodiac, currentYear.zodiac),
    wealth: asText(zodiacYearFortune.wealth, asText(analysis.wealth, '流年财势宜守正待时。').slice(0, 40)),
    relationship: asText(zodiacYearFortune.relationship, asText(analysis.marriage, '流年情缘宜徐行静察。').slice(0, 40)),
    career: asText(zodiacYearFortune.career, asText(analysis.industry, '流年事业宜稳中求进。').slice(0, 40)),
  };

  const recommendedCities = Array.isArray(root.recommendedCities)
    ? root.recommendedCities
    : [];

  return {
    ...root,
    analysis: {
      ...analysis,
      scores: normalizedScores,
      tags: normalizedTags,
      zodiacYearFortune: normalizedZodiacYearFortune,
    },
    recommendedCities,
    citySummary: asText(root.citySummary),
  };
}

function buildSchemaError(message: string, actionHint: string, rawIssues: string): ValidationFailure {
  return {
    ok: false,
    error: {
      reasonCode: KISMET_REASON.RESULT_SCHEMA_INVALID,
      message: `${message}: ${rawIssues}`,
      actionHint,
    },
  };
}

export function validateNatalAiOutput(raw: unknown):
  | { ok: true; data: KismetNatalAiOutput }
  | ValidationFailure {
  const result = KismetNatalAiOutputSchema.safeParse(normalizeNatalAiOutput(raw));
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError(
      kismetMessage('Messages.natalAiSchemaInvalid', 'AI output schema validation failed: {{issues}}', { issues }),
      kismetMessage(
        'Messages.natalAiSchemaInvalidHint',
        'Ensure the output contains `analysis`, `keyNodes`, and valid city recommendation fields.',
      ),
      issues,
    );
  }
  return { ok: true, data: result.data };
}

export function validateNatalResult(raw: unknown):
  | { ok: true; data: KismetNatalAnalysisResult }
  | ValidationFailure {
  const result = KismetNatalAnalysisResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError(
      kismetMessage('Messages.natalResultSchemaInvalid', 'Natal result schema validation failed: {{issues}}', { issues }),
      kismetMessage('Messages.natalResultSchemaInvalidHint', 'Make sure the imported content is a complete natal JSON payload.'),
      issues,
    );
  }
  return { ok: true, data: result.data };
}

export function validateDailyResult(raw: unknown):
  | { ok: true; data: KismetDailyFortuneResult }
  | ValidationFailure {
  const result = KismetDailyFortuneResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError(
      kismetMessage('Messages.dailyResultSchemaInvalid', 'Daily fortune schema validation failed: {{issues}}', { issues }),
      kismetMessage('Messages.dailyResultSchemaInvalidHint', 'Make sure the imported content is a complete daily fortune JSON payload.'),
      issues,
    );
  }
  return { ok: true, data: result.data };
}

export function validateFortuneStickResult(raw: unknown):
  | { ok: true; data: KismetFortuneStickResult }
  | ValidationFailure {
  const result = KismetFortuneStickResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError(
      kismetMessage('Messages.fortuneStickSchemaInvalid', 'Fortune stick schema validation failed: {{issues}}', { issues }),
      kismetMessage('Messages.fortuneStickSchemaInvalidHint', 'Make sure the imported content is a complete fortune stick JSON payload.'),
      issues,
    );
  }
  return { ok: true, data: result.data };
}

export function validateCompatibilityResult(raw: unknown):
  | { ok: true; data: KismetCompatibilityResult }
  | ValidationFailure {
  const result = KismetCompatibilityResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError(
      kismetMessage('Messages.compatibilitySchemaInvalid', 'Compatibility schema validation failed: {{issues}}', { issues }),
      kismetMessage('Messages.compatibilitySchemaInvalidHint', 'Make sure the imported content is a complete compatibility JSON payload.'),
      issues,
    );
  }
  return { ok: true, data: result.data };
}
