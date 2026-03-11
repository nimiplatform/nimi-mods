import { emitWorldStudioLog } from '../logging.js';

const HANDLE_BASE_REGEX = /^[a-z0-9_]{4,16}$/;

function diagLog(message: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioLog({
      level: 'error',
      message: `[MODS-TEST-DIAG] ${message}`,
      source: 'DIAG',
      details,
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments.
  }
}

function normalizeHandleBase(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toWorldHandleSuffix(worldId: string): string {
  const suffix = String(worldId || '')
    .slice(-6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '0');
  return suffix.padStart(6, '0').slice(-6);
}

function buildFallbackBase(worldId: string, sequence: number): string {
  const normalizedSequence = Math.max(1, Math.trunc(sequence) || 1);
  const tail = `${toWorldHandleSuffix(worldId)}_${normalizedSequence}`;
  const base = `agent_${tail}`;
  if (base.length <= 16) return base;
  return `agent_${tail.slice(-(16 - 'agent_'.length))}`;
}

function toRequestedBase(handle: unknown): string | null {
  const raw = String(handle || '').trim();
  if (!raw) return null;
  const base = raw.startsWith('~') || raw.startsWith('@') ? raw.slice(1) : raw;
  const normalized = normalizeHandleBase(base).slice(0, 16);
  if (!HANDLE_BASE_REGEX.test(normalized)) return null;
  return normalized;
}

export function resolveWorldOwnedAgentHandle(input: {
  requestedHandle: unknown;
  worldId: string;
  index: number;
  usedHandleBases: Set<string>;
}): string {
  const requestedBase = toRequestedBase(input.requestedHandle);
  if (requestedBase && !input.usedHandleBases.has(requestedBase)) {
    input.usedHandleBases.add(requestedBase);
    const resolved = `~${requestedBase}`;
    diagLog('resolveWorldOwnedAgentHandle: use requested', {
      requestedHandle: String(input.requestedHandle || ''),
      requestedBase,
      worldId: input.worldId,
      index: input.index,
      resolved,
    });
    return resolved;
  }

  const worldSuffix = toWorldHandleSuffix(input.worldId);
  if (requestedBase && input.usedHandleBases.has(requestedBase)) {
    diagLog('resolveWorldOwnedAgentHandle: requested duplicate fallback', {
      requestedHandle: String(input.requestedHandle || ''),
      requestedBase,
      worldId: input.worldId,
      worldSuffix,
      index: input.index,
    });
  }

  let sequence = input.index + 1;
  let fallbackBase = buildFallbackBase(input.worldId, sequence);
  while (input.usedHandleBases.has(fallbackBase)) {
    sequence += 1;
    fallbackBase = buildFallbackBase(input.worldId, sequence);
  }
  input.usedHandleBases.add(fallbackBase);
  const resolved = `~${fallbackBase}`;
  diagLog('resolveWorldOwnedAgentHandle: use fallback', {
    requestedHandle: String(input.requestedHandle || ''),
    requestedBase,
    worldId: input.worldId,
    worldSuffix,
    index: input.index,
    sequence,
    fallbackBase,
    resolved,
  });
  return resolved;
}
