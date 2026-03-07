import {
  KismetCompatibilityResultSchema,
  KismetDailyFortuneResultSchema,
  KismetNatalAiOutputSchema,
  KismetNatalAnalysisResultSchema,
} from '../schemas.js';
import { KISMET_REASON } from '../contracts.js';
import type {
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetError,
  KismetNatalAiOutput,
  KismetNatalAnalysisResult,
} from '../types.js';

type ValidationFailure = { ok: false; error: KismetError };

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
  const result = KismetNatalAiOutputSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError('AI 输出 schema 校验失败', '请确保输出仅包含 analysis 与 keyNodes。', issues);
  }
  return { ok: true, data: result.data };
}

export function validateNatalResult(raw: unknown):
  | { ok: true; data: KismetNatalAnalysisResult }
  | ValidationFailure {
  const result = KismetNatalAnalysisResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError('命盘结果 schema 校验失败', '请确认导入内容是完整的命盘 JSON。', issues);
  }
  return { ok: true, data: result.data };
}

export function validateDailyResult(raw: unknown):
  | { ok: true; data: KismetDailyFortuneResult }
  | ValidationFailure {
  const result = KismetDailyFortuneResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError('今日运势结果 schema 校验失败', '请确认导入内容是完整的今日运势 JSON。', issues);
  }
  return { ok: true, data: result.data };
}

export function validateCompatibilityResult(raw: unknown):
  | { ok: true; data: KismetCompatibilityResult }
  | ValidationFailure {
  const result = KismetCompatibilityResultSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return buildSchemaError('命理匹配结果 schema 校验失败', '请确认导入内容是完整的匹配 JSON。', issues);
  }
  return { ok: true, data: result.data };
}
