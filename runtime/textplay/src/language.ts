import type { TextplayLanguage } from './types.js';

function toText(value: unknown): string {
  return String(value || '').trim();
}

export function isTextplayLanguage(value: unknown): value is TextplayLanguage {
  return value === 'en' || value === 'zh';
}

export function normalizeTextplayLanguage(value: unknown): TextplayLanguage | null {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const normalized = text.toLowerCase();
  if (
    normalized === 'zh'
    || normalized.startsWith('zh-')
    || normalized === 'chinese'
    || text === '中文'
    || text === '汉语'
    || text === '漢語'
    || text === '华语'
    || text === '華語'
  ) {
    return 'zh';
  }
  if (
    normalized === 'en'
    || normalized.startsWith('en-')
    || normalized === 'english'
    || text === '英文'
    || text === '英语'
    || text === '英語'
  ) {
    return 'en';
  }
  return null;
}

export function normalizeTextplayRenderLocale(value: unknown): TextplayLanguage {
  return normalizeTextplayLanguage(value) || 'en';
}

export function normalizeTextplayLanguageList(value: unknown): TextplayLanguage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set<TextplayLanguage>();
  for (const item of value) {
    const normalized = normalizeTextplayLanguage(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

export function resolveTextplayStoryLanguage(input: {
  worldPrimaryLanguage: TextplayLanguage | null;
  agentLanguage: TextplayLanguage | null;
  promptLanguage: TextplayLanguage;
}): TextplayLanguage {
  return input.worldPrimaryLanguage || input.agentLanguage || input.promptLanguage;
}

export function describeTextplayLanguage(language: TextplayLanguage, locale: TextplayLanguage): string {
  if (locale === 'zh') {
    return language === 'zh' ? '中文' : '英文';
  }
  return language === 'zh' ? 'Chinese' : 'English';
}
