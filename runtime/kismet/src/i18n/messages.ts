import i18next from 'i18next';
import { getI18n } from 'react-i18next';

type MessageValues = Record<string, string | number | boolean | null | undefined>;

export function kismetMessage(
  key: string,
  fallback: string,
  values?: MessageValues,
): string {
  const i18n = getI18n() || i18next;
  const translated = i18n.t(`kismet:${key}`, {
    ...(values || {}),
    defaultValue: fallback,
  });

  if (typeof translated === 'string' && translated.trim() && translated !== 'undefined' && translated !== `kismet:${key}`) {
    return translated;
  }

  return fallback;
}
