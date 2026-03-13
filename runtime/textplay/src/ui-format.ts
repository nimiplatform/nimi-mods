import type { TextplayPersistRecord } from './types.js';

function normalizeLocale(locale: string | null | undefined): string {
  const normalized = String(locale || '').trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized) {
    return normalized;
  }
  return 'en-US';
}

export function formatUpdatedAt(value: string, locale?: string | null): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function triggerSourceLabel(
  triggerSource: TextplayPersistRecord['triggerSource'],
  t: (key: string) => string,
): string {
  if (triggerSource === 'SystemEvent') return t('timeline.triggerOpening');
  if (triggerSource === 'AgentInitiative') return t('timeline.triggerWorldEvent');
  return t('timeline.triggerNarrativeTurn');
}
