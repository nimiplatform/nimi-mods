import { KISMET_REASON } from '../contracts.js';
import { kismetMessage } from '../i18n/messages.js';
import type { KismetError } from '../types.js';

type ParseJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: KismetError };

function extractBalancedJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function countBraceBalance(text: string): number {
  let balance = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      balance += 1;
    } else if (char === '}') {
      balance -= 1;
    }
  }

  return balance;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toDiagnosticPreview(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function toDiagnosticTailPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 240) {
    return normalized;
  }
  return normalized.slice(-240);
}

function parseObjectCandidate(candidate: string): unknown | null {
  const first = tryParseJson(candidate);
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return first;
  }
  if (typeof first === 'string') {
    const nested = tryParseJson(first);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested;
    }
  }
  return null;
}

function buildParseError(message: string, actionHint: string, rawText: string): ParseJsonResult {
  return {
    ok: false,
    error: {
      reasonCode: KISMET_REASON.IMPORT_PARSE_FAILED,
      message,
      actionHint,
      diagnosticPreview: toDiagnosticPreview(rawText),
      diagnosticTailPreview: toDiagnosticTailPreview(rawText),
      diagnosticLength: rawText.length,
    },
  };
}

export function parseResultFromText(text: string): ParseJsonResult {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return buildParseError(
      kismetMessage('Messages.parseEmpty', 'Input text is empty.'),
      kismetMessage('Messages.parseEmptyHint', 'Paste the AI-generated JSON result.'),
      trimmed,
    );
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  const unclosedCodeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]+)/i);
  const codeBlockText = codeBlockMatch
    ? codeBlockMatch[1]!.trim()
    : (unclosedCodeBlockMatch ? unclosedCodeBlockMatch[1]!.trim() : '');

  const candidates = [
    trimmed,
    codeBlockText,
    extractBalancedJsonObject(codeBlockText),
    extractBalancedJsonObject(trimmed),
  ].filter((value, index, list): value is string => (
    Boolean(value) && list.indexOf(value) === index
  ));

  for (const candidate of candidates) {
    const parsed = parseObjectCandidate(candidate);
    if (parsed) {
      return { ok: true, data: parsed };
    }
  }

  const braceBalance = countBraceBalance(trimmed);
  if (trimmed.includes('{') && braceBalance > 0) {
    return buildParseError(
      kismetMessage(
        'Messages.parseTruncated',
        'Detected an opening JSON brace without a closing pair. The object may be truncated.',
      ),
      kismetMessage(
        'Messages.parseTruncatedHint',
        'Copy the full AI response and ask the model to return only one complete JSON object.',
      ),
      trimmed,
    );
  }

  if (!extractBalancedJsonObject(trimmed) && !extractBalancedJsonObject(codeBlockText)) {
    return buildParseError(
      kismetMessage('Messages.parseNoObject', 'No parseable JSON object was found.'),
      kismetMessage(
        'Messages.parseNoObjectHint',
        'Make sure the response is primarily a JSON object without extra explanation.',
      ),
      trimmed,
    );
  }

  return buildParseError(
    kismetMessage('Messages.parseFailed', 'JSON parsing failed.'),
    kismetMessage(
      'Messages.parseFailedHint',
      'Check for missing braces, trailing commas, or non-JSON prefixes/suffixes.',
    ),
    trimmed,
  );
}
