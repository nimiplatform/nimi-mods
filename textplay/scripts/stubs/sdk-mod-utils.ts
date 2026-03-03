const store = new Map<string, string>();

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function loadLocalStorageJson<T>(
  key: string,
  fallbackValue: T,
  normalize?: (value: unknown) => T,
): T {
  const raw = store.get(String(key));
  const parsed = parseJson(raw);
  if (parsed == null) {
    return fallbackValue;
  }
  if (typeof normalize === 'function') {
    return normalize(parsed);
  }
  return parsed as T;
}

export function saveLocalStorageJson(key: string, value: unknown): void {
  store.set(String(key), JSON.stringify(value));
}
