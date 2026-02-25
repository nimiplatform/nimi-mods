import i18next from 'i18next';
import { getI18n } from 'react-i18next';

type MessageValues = Record<string, string | number | boolean | null | undefined>;

export function worldStudioMessage(
  key: string,
  fallback: string,
  values?: MessageValues,
): string {
  const i18n = getI18n() || i18next;
  return String(i18n.t(`world-studio:${key}`, {
    ...(values || {}),
    defaultValue: fallback,
  }));
}
