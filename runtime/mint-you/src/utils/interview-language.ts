import type { MintYouInterviewLanguage } from '../types.js';

export function normalizeInterviewLanguage(language: string | null | undefined): MintYouInterviewLanguage {
  const normalized = String(language || '').trim().toLowerCase();
  return normalized.startsWith('zh') ? 'zh' : 'en';
}

export function parseInterviewLanguage(language: unknown): MintYouInterviewLanguage | null {
  const normalized = String(language || '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  return null;
}
