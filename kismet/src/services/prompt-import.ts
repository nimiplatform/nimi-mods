import type { KismetInput, KismetResult, KismetError } from '../types.js';
import { buildKismetSystemPrompt } from '../prompt/system-prompt.js';
import { buildKismetUserPrompt } from '../prompt/user-prompt.js';
import { parseResultFromText } from '../validation/parse-result-json.js';
import { validateKismetResult } from '../validation/validate-result.js';

export type GeneratePromptsOutput = {
  systemPrompt: string;
  userPrompt: string;
};

export function generatePrompts(input: KismetInput): GeneratePromptsOutput {
  return {
    systemPrompt: buildKismetSystemPrompt(input),
    userPrompt: buildKismetUserPrompt(input),
  };
}

type ParseImportedResultOutput =
  | { ok: true; data: KismetResult }
  | { ok: false; error: KismetError };

export function parseImportedResult(rawText: string): ParseImportedResultOutput {
  const parseResult = parseResultFromText(rawText);
  if (!parseResult.ok) {
    return parseResult;
  }
  return validateKismetResult(parseResult.data);
}
