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

function extractJsonText(input: string): string {
  const text = String(input || '').trim();
  if (!text) throw new Error('WORLD_STUDIO_EMPTY_MODEL_OUTPUT');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('WORLD_STUDIO_JSON_NOT_FOUND');
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
      if (start < 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (start < 0) continue;
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function stripCodeFences(input: string): string {
  const text = String(input || '');
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match) return text;
  return String(match[1] || '').trim();
}

function extractAllCodeFenceBodies(input: string): string[] {
  const text = String(input || '');
  const matches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  const outputs: string[] = [];
  for (const match of matches) {
    const body = String(match[1] || '').trim();
    if (body) {
      outputs.push(body);
    }
  }
  return outputs;
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function normalizeQuotes(input: string): string {
  return input
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function sanitizeControlChars(input: string): string {
  const text = String(input || '');
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] || '';
    const code = char.charCodeAt(0);
    const keep = code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20;
    if (keep) output += char;
  }
  return output;
}

function quoteBareKeys(input: string): string {
  return input.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');
}

function normalizeCommonJsonPunctuation(input: string): string {
  return input
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/；/g, ';');
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
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' && stack[stack.length - 1] === '{') {
      stack.pop();
      continue;
    }
    if (ch === ']' && stack[stack.length - 1] === '[') {
      stack.pop();
    }
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

export function parseJsonRecord(input: string): Record<string, unknown> {
  const candidates: string[] = [];
  const raw = String(input || '').trim();
  if (!raw) throw new Error('WORLD_STUDIO_EMPTY_MODEL_OUTPUT');

  try {
    candidates.push(extractJsonText(raw));
  } catch {
    // keep relaxed candidates
  }
  const balanced = extractFirstBalancedObject(raw);
  if (balanced) {
    candidates.push(balanced);
  }
  candidates.push(...extractAllCodeFenceBodies(raw));
  candidates.push(stripCodeFences(raw));
  candidates.push(raw);

  for (const candidate of candidates) {
    const normalized = sanitizeControlChars(
      normalizeCommonJsonPunctuation(normalizeQuotes(candidate)),
    ).trim();
    if (!normalized) continue;
    const strictParsed = tryParseJsonObject(normalized);
    if (strictParsed) return strictParsed;

    const relaxed = autoCloseJsonBrackets(removeTrailingCommas(normalized));
    const relaxedParsed = tryParseJsonObject(relaxed);
    if (relaxedParsed) return relaxedParsed;

    const jsonLike = convertSingleQuotedStrings(quoteBareKeys(relaxed));
    const jsonLikeParsed = tryParseJsonObject(jsonLike);
    if (jsonLikeParsed) return jsonLikeParsed;
  }

  throw new Error('WORLD_STUDIO_JSON_OBJECT_REQUIRED');
}

export function buildRepairPrompt(input: {
  schemaLines: string[];
  chunk: string;
  chunkIndex: number;
  chunkTotal: number;
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
    `CHUNK_INDEX: ${input.chunkIndex + 1}/${input.chunkTotal}`,
    `PARSE_ERROR: ${input.parseError}`,
    'PREVIOUS_OUTPUT:',
    truncateText(input.invalidOutput, REPAIR_OUTPUT_LIMIT),
    'ORIGINAL_CHUNK_SOURCE:',
    truncateText(input.chunk, REPAIR_SOURCE_LIMIT),
  ].join('\n');
}
