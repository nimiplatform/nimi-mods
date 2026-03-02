function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = normalizeValue(source[key]);
  }
  return out;
}

export function stableSerialize(value: unknown): string {
  try {
    return JSON.stringify(normalizeValue(value));
  } catch {
    return String(value || '');
  }
}

export function createStableHash(value: unknown): string {
  const text = stableSerialize(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0).toString(16).padStart(8, '0');
  return `fnv1a32:${normalized}`;
}
