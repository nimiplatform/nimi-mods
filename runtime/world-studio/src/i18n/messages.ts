import i18next from 'i18next';
import { getI18n } from 'react-i18next';

type MessageValues = Record<string, string | number | boolean | null | undefined>;

function interpolateFallback(message: string, values?: MessageValues): string {
  if (!values) {
    return message;
  }
  return message.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

function isUsableMessage(result: unknown, key: string): result is string {
  if (typeof result !== 'string') {
    return false;
  }
  const normalized = result.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return false;
  }
  if (normalized === key || normalized === `world-studio:${key}`) {
    return false;
  }
  return true;
}

export function worldStudioMessage(
  key: string,
  fallback: string,
  values?: MessageValues,
): string {
  const i18n = getI18n() || i18next;
  const translated = i18n.t(`world-studio:${key}`, {
    ...(values || {}),
    defaultValue: fallback,
  });
  if (isUsableMessage(translated, key)) {
    return translated;
  }
  return interpolateFallback(fallback, values);
}
