import { KISMET_REASON } from '../contracts.js';
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
    return buildParseError('输入文本为空', '请粘贴 AI 生成的 JSON 结果。', trimmed);
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
      '检测到 JSON 起始符但未闭合，对象可能已被截断',
      '请确认已复制 AI 返回的完整内容，并要求模型只返回完整 JSON 结果对象。',
      trimmed,
    );
  }

  if (!extractBalancedJsonObject(trimmed) && !extractBalancedJsonObject(codeBlockText)) {
    return buildParseError(
      '未找到可解析的 JSON 对象',
      '请确保返回内容以 JSON 对象为主体，不要夹杂额外说明文字。',
      trimmed,
    );
  }

  return buildParseError(
    'JSON 解析失败',
    '请检查返回内容是否包含缺失括号、尾逗号或非 JSON 前后缀。',
    trimmed,
  );
}
