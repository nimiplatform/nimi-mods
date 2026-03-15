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
  KismetAiKeyNode,
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

const MIN_KEY_NODE_AGE = 1;
const MAX_KEY_NODE_AGE = 100;
const MIN_KEY_NODE_COUNT = 5;
const MAX_KEY_NODE_COUNT = 15;
const MIN_TERMINAL_KEY_NODE_AGE = 95;

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function asText(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input.trim() : fallback;
}

function asNumber(input: unknown, fallback: number): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundAndClamp(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
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

function normalizeKeyNode(entry: unknown, fallbackAge: number, fallbackDaYun: string, fallbackTag: string): KismetAiKeyNode | null {
  const record = asRecord(entry);
  if (Object.keys(record).length === 0) {
    return null;
  }

  const age = roundAndClamp(asNumber(record.age, fallbackAge), MIN_KEY_NODE_AGE, MAX_KEY_NODE_AGE);
  const score = roundAndClamp(asNumber(record.score, 50), 0, 100);
  const open = roundAndClamp(asNumber(record.open, score), 0, 100);
  const close = roundAndClamp(asNumber(record.close, score), 0, 100);
  const baseHigh = Math.max(open, close);
  const baseLow = Math.min(open, close);
  const high = roundAndClamp(asNumber(record.high, baseHigh), baseHigh, 100);
  const low = roundAndClamp(asNumber(record.low, baseLow), 0, baseLow);

  return {
    age,
    daYun: asText(record.daYun, fallbackDaYun || `第${Math.ceil(age / 10)}运`),
    score,
    open,
    close,
    high,
    low,
    tag: asText(record.tag, fallbackTag || '运势节点'),
  };
}

function dedupeAndSortKeyNodes(nodes: KismetAiKeyNode[]): KismetAiKeyNode[] {
  const sorted = [...nodes].sort((left, right) => left.age - right.age);
  const deduped: KismetAiKeyNode[] = [];
  for (const node of sorted) {
    if (deduped.length === 0 || deduped[deduped.length - 1]!.age !== node.age) {
      deduped.push(node);
    }
  }
  return deduped;
}

function interpolateNumeric(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function synthesizeKeyNode(age: number, anchors: KismetAiKeyNode[]): KismetAiKeyNode {
  const normalizedAge = roundAndClamp(age, MIN_KEY_NODE_AGE, MAX_KEY_NODE_AGE);
  const exact = anchors.find((node) => node.age === normalizedAge);
  if (exact) {
    return exact;
  }

  const previous = [...anchors].reverse().find((node) => node.age < normalizedAge) ?? anchors[0]!;
  const next = anchors.find((node) => node.age > normalizedAge) ?? anchors[anchors.length - 1]!;

  if (previous.age === next.age) {
    return {
      ...previous,
      age: normalizedAge,
    };
  }

  const amount = (normalizedAge - previous.age) / Math.max(1, next.age - previous.age);
  const score = roundAndClamp(interpolateNumeric(previous.score, next.score, amount), 0, 100);
  const open = roundAndClamp(interpolateNumeric(previous.open, next.open, amount), 0, 100);
  const close = roundAndClamp(interpolateNumeric(previous.close, next.close, amount), 0, 100);
  const highBase = Math.max(open, close);
  const lowBase = Math.min(open, close);

  return {
    age: normalizedAge,
    daYun: amount < 0.5 ? previous.daYun : next.daYun,
    score,
    open,
    close,
    high: roundAndClamp(interpolateNumeric(previous.high, next.high, amount), highBase, 100),
    low: roundAndClamp(interpolateNumeric(previous.low, next.low, amount), 0, lowBase),
    tag: amount < 0.5 ? previous.tag : next.tag,
  };
}

function buildEvenAges(startAge: number, endAge: number, count: number): number[] {
  if (count <= 1) {
    return [startAge];
  }

  const ages = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const amount = index / (count - 1);
    ages.add(roundAndClamp(interpolateNumeric(startAge, endAge, amount), MIN_KEY_NODE_AGE, MAX_KEY_NODE_AGE));
  }

  ages.add(startAge);
  ages.add(endAge);
  return Array.from(ages).sort((left, right) => left - right);
}

function ensureBoundaryNodes(nodes: KismetAiKeyNode[]): KismetAiKeyNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const bounded = [...nodes];
  if (bounded[0]!.age !== MIN_KEY_NODE_AGE) {
    bounded.unshift(synthesizeKeyNode(MIN_KEY_NODE_AGE, nodes));
  }

  const tailAge = bounded[bounded.length - 1]!.age >= MIN_TERMINAL_KEY_NODE_AGE
    ? bounded[bounded.length - 1]!.age
    : MIN_TERMINAL_KEY_NODE_AGE;
  if (bounded[bounded.length - 1]!.age < MIN_TERMINAL_KEY_NODE_AGE) {
    bounded.push(synthesizeKeyNode(tailAge, bounded));
  }

  return dedupeAndSortKeyNodes(bounded);
}

function trimKeyNodes(nodes: KismetAiKeyNode[], maxCount: number): KismetAiKeyNode[] {
  if (nodes.length <= maxCount) {
    return nodes;
  }

  const targetAges = buildEvenAges(nodes[0]!.age, nodes[nodes.length - 1]!.age, maxCount);
  return targetAges.map((age) => synthesizeKeyNode(age, nodes));
}

function padKeyNodes(nodes: KismetAiKeyNode[], minCount: number): KismetAiKeyNode[] {
  if (nodes.length >= minCount) {
    return nodes;
  }

  const targetAges = buildEvenAges(nodes[0]!.age, nodes[nodes.length - 1]!.age, minCount);
  return targetAges.map((age) => synthesizeKeyNode(age, nodes));
}

function normalizeNatalKeyNodes(raw: unknown): KismetAiKeyNode[] {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((entry, index) => normalizeKeyNode(entry, MIN_KEY_NODE_AGE + index * 10, `第${index + 1}运`, `节点${index + 1}`))
    .filter((entry): entry is KismetAiKeyNode => entry !== null);

  if (normalized.length === 0) {
    return [];
  }

  const bounded = ensureBoundaryNodes(dedupeAndSortKeyNodes(normalized));
  const padded = padKeyNodes(bounded, MIN_KEY_NODE_COUNT);
  const trimmed = trimKeyNodes(padded, MAX_KEY_NODE_COUNT);
  return dedupeAndSortKeyNodes(trimmed);
}

function normalizeNatalAiOutput(raw: unknown): unknown {
  const root = asRecord(raw);
  const analysis = asRecord(root.analysis);
  const normalizedKeyNodes = normalizeNatalKeyNodes(root.keyNodes);

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

  if (Object.keys(analysis).length === 0) {
    return {
      ...root,
      keyNodes: normalizedKeyNodes,
      recommendedCities,
      citySummary: asText(root.citySummary),
    };
  }

  return {
    ...root,
    analysis: {
      ...analysis,
      scores: normalizedScores,
      tags: normalizedTags,
      zodiacYearFortune: normalizedZodiacYearFortune,
    },
    keyNodes: normalizedKeyNodes,
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
