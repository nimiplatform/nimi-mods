const HANDLE_BASE_REGEX = /^[a-z0-9_]{4,16}$/;
const HANDLE_BASE_MAX_LEN = 16;
const HANDLE_SUFFIX_LEN = 4;

export function normalizeHandleBase(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/^[@~]+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function generateRandomSuffix(length: number = HANDLE_SUFFIX_LEN): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function generateHandle(displayName: string): string {
  const suffix = generateRandomSuffix(HANDLE_SUFFIX_LEN);
  const normalized = normalizeHandleBase(displayName);
  const fallbackCore = normalized || 'agent';
  const coreMaxLen = HANDLE_BASE_MAX_LEN - HANDLE_SUFFIX_LEN - 1;
  const core = fallbackCore.slice(0, Math.max(1, coreMaxLen));

  let base = `${core}_${suffix}`.slice(0, HANDLE_BASE_MAX_LEN);
  if (!HANDLE_BASE_REGEX.test(base)) {
    base = `agent_${suffix}`.slice(0, HANDLE_BASE_MAX_LEN);
  }

  return `~${base}`;
}
