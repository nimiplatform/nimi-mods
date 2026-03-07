import type {
  GeneratedPromptPackage,
  KismetCompatibilityInput,
  KismetDailyFortuneResult,
  KismetLocationContext,
  KismetCanonicalProfile,
  KismetError,
  KismetPromptKind,
} from '../types.js';
import {
  buildCompatibilitySystemPrompt,
  buildDailySystemPrompt,
  buildFortuneStickSystemPrompt,
  buildNatalSystemPrompt,
} from '../prompt/system-prompt.js';
import {
  buildCompatibilityUserPrompt,
  buildDailyUserPrompt,
  buildFortuneStickUserPrompt,
  buildNatalUserPrompt,
} from '../prompt/user-prompt.js';
import { parseResultFromText } from '../validation/parse-result-json.js';
import {
  validateCompatibilityResult,
  validateDailyResult,
  validateFortuneStickResult,
  validateNatalAiOutput,
} from '../validation/validate-result.js';
import { KISMET_REASON } from '../contracts.js';

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function detectPromptPayload(kind: KismetPromptKind, raw: unknown): KismetError | null {
  const record = asRecord(raw);

  if (kind === 'natal-profile' && record.pillars && record.dayMaster && record.birthCity) {
    return {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message: '当前粘贴内容是命盘分析的 User Prompt，不是 AI 输出结果。',
      actionHint: '请把上方 Prompt 发给 AI，并将 AI 最终返回的 JSON 结果粘贴到这里，不要直接粘贴 User Prompt。',
    };
  }

  if (kind === 'daily-fortune' && record.canonicalProfile && record.dailyDefaults && record.instructions) {
    return {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message: '当前粘贴内容是今日运势的 User Prompt，不是 AI 输出结果。',
      actionHint: '请把上方 Prompt 发给 AI，并将 AI 最终返回的 JSON 结果粘贴到这里，不要直接粘贴 User Prompt。',
    };
  }

  if (kind === 'compatibility' && record.selfProfile && record.targetProfile && record.deterministicCompatibilityScore !== undefined) {
    return {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message: '当前粘贴内容是命理匹配的 User Prompt，不是 AI 输出结果。',
      actionHint: '请把上方 Prompt 发给 AI，并将 AI 最终返回的 JSON 结果粘贴到这里，不要直接粘贴 User Prompt。',
    };
  }

  return null;
}

export function buildNatalPromptPackage(input: {
  canonicalProfile: KismetCanonicalProfile;
  birthCityLabel: string;
}): GeneratedPromptPackage {
  return {
    kind: 'natal-profile',
    title: '命盘分析 Prompt',
    systemPrompt: buildNatalSystemPrompt(),
    userPrompt: buildNatalUserPrompt(input),
  };
}

export function buildDailyPromptPackage(input: {
  canonicalProfile: KismetCanonicalProfile;
  locationContext: KismetLocationContext;
  dailyDefaults: Pick<
    KismetDailyFortuneResult,
    'date' | 'timezone' | 'todayGanZhi' | 'overallScore' | 'careerScore' | 'relationshipScore' | 'wealthScore' | 'healthScore' | 'luckyElements' | 'luckyDirections' | 'luckyColors' | 'luckyNumbers'
  >;
}): GeneratedPromptPackage {
  return {
    kind: 'daily-fortune',
    title: '今日运势 Prompt',
    systemPrompt: buildDailySystemPrompt(),
    userPrompt: buildDailyUserPrompt(input),
  };
}

export function buildFortuneStickPromptPackage(input: {
  canonicalProfile: KismetCanonicalProfile;
  dailyResult: KismetDailyFortuneResult;
}): GeneratedPromptPackage {
  return {
    kind: 'fortune-stick',
    title: '求签 Prompt',
    systemPrompt: buildFortuneStickSystemPrompt(),
    userPrompt: buildFortuneStickUserPrompt(input),
  };
}

export function buildCompatibilityPromptPackage(input: KismetCompatibilityInput): GeneratedPromptPackage {
  return {
    kind: 'compatibility',
    title: '命理匹配 Prompt',
    systemPrompt: buildCompatibilitySystemPrompt(),
    userPrompt: buildCompatibilityUserPrompt(input),
  };
}

export function parseImportedResult(kind: KismetPromptKind, rawText: string):
  | { ok: true; data: unknown }
  | { ok: false; error: KismetError } {
  const parseResult = parseResultFromText(rawText);
  if (!parseResult.ok) {
    return parseResult;
  }

  const promptPayloadError = detectPromptPayload(kind, parseResult.data);
  if (promptPayloadError) {
    return { ok: false, error: promptPayloadError };
  }

  if (kind === 'natal-profile') {
    return validateNatalAiOutput(parseResult.data);
  }
  if (kind === 'daily-fortune') {
    return validateDailyResult(parseResult.data);
  }
  if (kind === 'fortune-stick') {
    return validateFortuneStickResult(parseResult.data);
  }
  return validateCompatibilityResult(parseResult.data);
}
