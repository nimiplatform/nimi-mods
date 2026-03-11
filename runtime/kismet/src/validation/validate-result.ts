import {
  KismetCompatibilityResultSchema,
  KismetDailyFortuneResultSchema,
  KismetFortuneStickResultSchema,
  KismetNatalAiOutputSchema,
  KismetNatalAnalysisResultSchema,
} from '../schemas.js';
import { KISMET_REASON } from '../contracts.js';
import type {
  KismetCompatibilityResult,
  KismetDailyFortuneResult,
  KismetError,
  KismetFortuneStickResult,
  KismetNatalAiOutput,
  KismetNatalAnalysisResult,
} from '../types.js';
import { kismetMessage } from '../i18n/messages.js';

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
    return buildSchemaError(
      kismetMessage('Messages.natalAiSchemaInvalid', 'AI output schema validation failed: {{issues}}', { issues }),
      kismetMessage('Messages.natalAiSchemaInvalidHint', 'Ensure the output only contains `analysis` and `keyNodes`.'),
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
