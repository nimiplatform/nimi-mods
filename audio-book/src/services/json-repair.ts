// ---------------------------------------------------------------------------
// JSON repair utilities — ported from world-studio with audio-book error codes
// ---------------------------------------------------------------------------

const REPAIR_OUTPUT_LIMIT = 2400;
const REPAIR_SOURCE_LIMIT = 3200;

export function summarizeModelError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'unknown error');
}

function truncateText(input: string, limit: number): string {
  const text = String(input || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

/**
 * Strip LLM thinking blocks (e.g. Gemini 2.5 Flash `<think>...</think>`)
 * before attempting JSON extraction.
 */
function stripThinkingBlocks(input: string): string {
  return input
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

function extractJsonText(input: string): string {
  const text = String(input || '').trim();
  if (!text) throw new Error('VS_EMPTY_MODEL_OUTPUT');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('VS_JSON_NOT_FOUND');
  return text.slice(first, last + 1);
}

function extractFirstBalancedObject(input: string): string | null {
  const text = String(input || '');
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (start < 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (start < 0) continue;
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stripCodeFences(input: string): string {
  const match = String(input || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match) return input;
  return String(match[1] || '').trim();
}

function extractAllCodeFenceBodies(input: string): string[] {
  const matches = String(input || '').matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  const outputs: string[] = [];
  for (const match of matches) {
    const body = String(match[1] || '').trim();
    if (body) outputs.push(body);
  }
  return outputs;
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function normalizeQuotes(input: string): string {
  return input.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function sanitizeControlChars(input: string): string {
  let output = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      output += input[i];
    }
  }
  return output;
}

function quoteBareKeys(input: string): string {
  return input.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');
}

function normalizeCommonJsonPunctuation(input: string): string {
  return input.replace(/，/g, ',').replace(/：/g, ':').replace(/；/g, ';');
}

function convertSingleQuotedStrings(input: string): string {
  return input.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content: string) => {
    const escaped = content.replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
}

function autoCloseJsonBrackets(input: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let output = '';
  for (const ch of input) {
    output += ch;
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' && stack[stack.length - 1] === '{') { stack.pop(); continue; }
    if (ch === ']' && stack[stack.length - 1] === '[') { stack.pop(); }
  }
  while (stack.length > 0) {
    const opener = stack.pop();
    output += opener === '{' ? '}' : ']';
  }
  return output;
}

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parse a JSON record from an LLM's raw text output.
 * Tries multiple extraction strategies before throwing.
 */
export function parseJsonRecord(input: string): Record<string, unknown> {
  const raw = stripThinkingBlocks(String(input || '').trim());
  if (!raw) throw new Error('VS_EMPTY_MODEL_OUTPUT');

  const candidates: string[] = [];
  try { candidates.push(extractJsonText(raw)); } catch { /* relaxed */ }
  const balanced = extractFirstBalancedObject(raw);
  if (balanced) candidates.push(balanced);
  candidates.push(...extractAllCodeFenceBodies(raw));
  candidates.push(stripCodeFences(raw));
  // Handle truncated code fence: opening ```json but no closing ``` (output hit maxTokens)
  const truncatedFenceStripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (truncatedFenceStripped !== raw) candidates.push(truncatedFenceStripped);
  candidates.push(raw);

  for (const candidate of candidates) {
    // Pass 1: WITHOUT normalizeQuotes — Chinese "" inside JSON strings are valid
    // and normalizeQuotes would break them by converting to ASCII "
    const safeNormalized = sanitizeControlChars(
      normalizeCommonJsonPunctuation(candidate),
    ).trim();
    if (safeNormalized) {
      const strict = tryParseJsonObject(safeNormalized);
      if (strict) return strict;

      const relaxed = autoCloseJsonBrackets(removeTrailingCommas(safeNormalized));
      const relaxedParsed = tryParseJsonObject(relaxed);
      if (relaxedParsed) return relaxedParsed;
    }

    // Pass 2: WITH normalizeQuotes — for LLMs that use smart quotes as JSON delimiters
    const quotesNormalized = sanitizeControlChars(
      normalizeCommonJsonPunctuation(normalizeQuotes(candidate)),
    ).trim();
    if (quotesNormalized && quotesNormalized !== safeNormalized) {
      const strict2 = tryParseJsonObject(quotesNormalized);
      if (strict2) return strict2;

      const relaxed2 = autoCloseJsonBrackets(removeTrailingCommas(quotesNormalized));
      const relaxedParsed2 = tryParseJsonObject(relaxed2);
      if (relaxedParsed2) return relaxedParsed2;

      const jsonLike = convertSingleQuotedStrings(quoteBareKeys(relaxed2));
      const jsonLikeParsed = tryParseJsonObject(jsonLike);
      if (jsonLikeParsed) return jsonLikeParsed;
    }
  }

  throw new Error('VS_JSON_OBJECT_REQUIRED');
}

function findBalancedArrayEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') {
      depth += 1;
      continue;
    }
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractArrayBodyByKey(input: string, key: string): string | null {
  const keyPattern = new RegExp(`["']?${key}["']?\\s*:`, 'i');
  const match = keyPattern.exec(input);
  if (!match) return null;

  const from = match.index + match[0].length;
  const arrayStart = input.indexOf('[', from);
  if (arrayStart < 0) return null;

  const arrayEnd = findBalancedArrayEnd(input, arrayStart);
  if (arrayEnd < 0) {
    return input.slice(arrayStart + 1);
  }
  return input.slice(arrayStart + 1, arrayEnd);
}

function extractCompleteObjectsFromArrayBody(arrayBody: string): string[] {
  const objects: string[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < arrayBody.length; i += 1) {
    const ch = arrayBody[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(arrayBody.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseObjectWithRepairs(input: string): Record<string, unknown> | null {
  const normalized = sanitizeControlChars(
    normalizeCommonJsonPunctuation(normalizeQuotes(input)),
  ).trim();
  if (!normalized) return null;

  const strict = tryParseJsonObject(normalized);
  if (strict) return strict;

  const relaxed = autoCloseJsonBrackets(removeTrailingCommas(normalized));
  const relaxedParsed = tryParseJsonObject(relaxed);
  if (relaxedParsed) return relaxedParsed;

  const jsonLike = convertSingleQuotedStrings(quoteBareKeys(relaxed));
  return tryParseJsonObject(jsonLike);
}

function recoverAnalysisRecord(input: string): Record<string, unknown> | null {
  const sources: string[] = [];
  const stripped = stripThinkingBlocks(String(input || '').trim());
  if (!stripped) return null;

  sources.push(stripped);
  sources.push(stripCodeFences(stripped));
  sources.push(...extractAllCodeFenceBodies(stripped));

  for (const source of sources) {
    const segmentsBody = extractArrayBodyByKey(source, 'segments');
    const charactersBody = extractArrayBodyByKey(source, 'characters');
    if (!segmentsBody && !charactersBody) continue;

    const segmentObjects = segmentsBody
      ? extractCompleteObjectsFromArrayBody(segmentsBody)
        .map((objText) => parseObjectWithRepairs(objText))
        .filter((obj): obj is Record<string, unknown> => Boolean(obj))
      : [];

    const characterObjects = charactersBody
      ? extractCompleteObjectsFromArrayBody(charactersBody)
        .map((objText) => parseObjectWithRepairs(objText))
        .filter((obj): obj is Record<string, unknown> => Boolean(obj))
      : [];

    if (segmentObjects.length > 0 || characterObjects.length > 0) {
      return {
        segments: segmentObjects,
        characters: characterObjects,
      };
    }
  }

  return null;
}

export function parseAnalysisJsonRecord(input: string): Record<string, unknown> {
  try {
    return parseJsonRecord(input);
  } catch {
    const recovered = recoverAnalysisRecord(input);
    if (recovered) return recovered;
    throw new Error('VS_JSON_OBJECT_REQUIRED');
  }
}

/**
 * Build a repair prompt when the first LLM output is invalid JSON.
 */
export function buildRepairPrompt(input: {
  schemaLines: string[];
  sourceText: string;
  chapterIndex: number;
  chapterTotal: number;
  invalidOutput: string;
  parseError: string;
}): string {
  return [
    'Your previous output was not valid JSON.',
    'Return STRICT JSON only.',
    'Schema:',
    ...input.schemaLines,
    'Rules:',
    '- Return only JSON object text.',
    '- Do not use markdown or code fences.',
    '- Keep keys present even when arrays are empty.',
    `CHAPTER_INDEX: ${input.chapterIndex + 1}/${input.chapterTotal}`,
    `PARSE_ERROR: ${input.parseError}`,
    'PREVIOUS_OUTPUT:',
    truncateText(input.invalidOutput, REPAIR_OUTPUT_LIMIT),
    'ORIGINAL_CHAPTER_SOURCE:',
    truncateText(input.sourceText, REPAIR_SOURCE_LIMIT),
  ].join('\n');
}

/**
 * Build a strict repair prompt with both previous error outputs.
 */
export function buildStrictRepairPrompt(input: {
  schemaLines: string[];
  sourceText: string;
  chapterIndex: number;
  chapterTotal: number;
  firstOutput: string;
  secondOutput: string;
  firstError: string;
  secondError: string;
}): string {
  return [
    'CRITICAL JSON REPAIR MODE.',
    'You must return exactly ONE valid JSON object and nothing else.',
    'If uncertain, keep arrays empty and strings empty, but JSON must be strictly valid.',
    'Do not use markdown fences, comments, trailing commas, or unquoted keys.',
    'Schema:',
    ...input.schemaLines,
    'Rules:',
    '- Output must start with { and end with }.',
    '- Keep required top-level keys: segments, characters.',
    `CHAPTER_INDEX: ${input.chapterIndex + 1}/${input.chapterTotal}`,
    `FIRST_PARSE_ERROR: ${input.firstError}`,
    `SECOND_PARSE_ERROR: ${input.secondError}`,
    'FIRST_INVALID_OUTPUT:',
    truncateText(input.firstOutput, 1400),
    'SECOND_INVALID_OUTPUT:',
    truncateText(input.secondOutput, 1400),
    'ORIGINAL_CHAPTER_SOURCE:',
    truncateText(input.sourceText, 2200),
  ].join('\n');
}
