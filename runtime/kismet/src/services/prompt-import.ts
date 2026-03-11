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
import { kismetMessage } from '../i18n/messages.js';

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
      message: kismetMessage(
        'Messages.promptImportNatalUserPrompt',
        'The pasted content is the natal-analysis user prompt, not the AI result.',
      ),
      actionHint: kismetMessage(
        'Messages.promptImportNatalUserPromptHint',
        'Send the prompt above to AI, then paste only the final JSON response here.',
      ),
    };
  }

  if (kind === 'daily-fortune' && record.canonicalProfile && record.dailyDefaults && record.instructions) {
    return {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message: kismetMessage(
        'Messages.promptImportDailyUserPrompt',
        'The pasted content is the daily-fortune user prompt, not the AI result.',
      ),
      actionHint: kismetMessage(
        'Messages.promptImportDailyUserPromptHint',
        'Send the prompt above to AI, then paste only the final JSON response here.',
      ),
    };
  }

  if (kind === 'compatibility' && record.selfProfile && record.targetProfile && record.deterministicCompatibilityScore !== undefined) {
    return {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message: kismetMessage(
        'Messages.promptImportCompatibilityUserPrompt',
        'The pasted content is the compatibility user prompt, not the AI result.',
      ),
      actionHint: kismetMessage(
        'Messages.promptImportCompatibilityUserPromptHint',
        'Send the prompt above to AI, then paste only the final JSON response here.',
      ),
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
    title: kismetMessage('Messages.natalPromptTitle', 'Natal Analysis Prompt'),
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
    title: kismetMessage('Messages.dailyPromptTitle', 'Daily Fortune Prompt'),
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
    title: kismetMessage('Messages.fortuneStickPromptTitle', 'Fortune Stick Prompt'),
    systemPrompt: buildFortuneStickSystemPrompt(),
    userPrompt: buildFortuneStickUserPrompt(input),
  };
}

export function buildCompatibilityPromptPackage(input: KismetCompatibilityInput): GeneratedPromptPackage {
  return {
    kind: 'compatibility',
    title: kismetMessage('Messages.compatibilityPromptTitle', 'Compatibility Prompt'),
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
