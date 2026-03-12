type HookClient = Record<string, unknown>;
type ModRuntimeClient = Record<string, unknown>;
type RuntimeRouteBinding = {
  source: string;
  connectorId: string;
  model: string;
};
type RuntimeRouteOptionsSnapshot = {
  selected: RuntimeRouteBinding;
  resolvedDefault: Record<string, unknown>;
  local: Record<string, unknown>;
  connectors: unknown[];
};
type RuntimeRouteSource = string;
type RuntimeCanonicalCapability = string;
type RuntimeModRegistration = Record<string, unknown>;

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

export function emitRuntimeLog(_input: unknown): void {
  // smoke stub
}

export function registerModTranslations(): void {
  // smoke stub
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

export function removeLocalStorageKey(key: string): void {
  store.delete(String(key));
}

export function parseRuntimeRouteOptions(payload: unknown): RuntimeRouteOptionsSnapshot | null {
  const record = asRecord(payload);
  const selected = asRecord(record.selected);
  const source = String(selected.source || '').trim();
  const connectorId = String(selected.connectorId || '').trim();
  const model = String(selected.model || '').trim();
  if (!source || !connectorId || !model) {
    return null;
  }
  return {
    selected: {
      source,
      connectorId,
      model,
    },
    resolvedDefault: asRecord(record.resolvedDefault),
    local: asRecord(record.local),
    connectors: Array.isArray(record.connectors) ? record.connectors : [],
  };
}

export type {
  HookClient,
  ModRuntimeClient,
  RuntimeCanonicalCapability,
  RuntimeModRegistration,
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
};
