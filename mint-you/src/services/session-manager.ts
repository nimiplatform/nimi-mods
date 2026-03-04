import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { MintYouSession, BasicInfo, TraitExtractionResult, DnaSynthesisOutput } from '../types.js';
import type { MintYouPipelineStep, DnaPrimaryType, DnaSecondaryTrait } from '../contracts.js';

const SESSION_KEY_PREFIX = 'mint-you:session:';
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MOD_STATE_CAPABILITY = 'data.store.mod-state';

function normalizeScopeKey(scopeKey: string): string {
  const normalized = String(scopeKey || '').trim();
  return normalized || 'anonymous';
}

function getSessionKey(scopeKey: string): string {
  return `${SESSION_KEY_PREFIX}${normalizeScopeKey(scopeKey)}`;
}

function readLocalStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silent fail
  }
}

function removeLocalStorage(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Silent fail
  }
}

function extractStateValue(response: unknown): string | null {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;
  if (typeof record.value === 'string') return record.value;
  return null;
}

async function readFromModStateStore(
  hookClient: HookClient,
  key: string,
): Promise<string | null> {
  try {
    const response = await hookClient.data.query({
      capability: MOD_STATE_CAPABILITY,
      query: { op: 'get', key },
    });
    return extractStateValue(response);
  } catch {
    return null;
  }
}

async function writeToModStateStore(
  hookClient: HookClient,
  key: string,
  value: string,
): Promise<boolean> {
  try {
    await hookClient.data.query({
      capability: MOD_STATE_CAPABILITY,
      query: { op: 'set', key, value },
    });
    return true;
  } catch {
    return false;
  }
}

async function removeFromModStateStore(
  hookClient: HookClient,
  key: string,
): Promise<boolean> {
  try {
    await hookClient.data.query({
      capability: MOD_STATE_CAPABILITY,
      query: { op: 'delete', key },
    });
    return true;
  } catch {
    return false;
  }
}

function parseSession(raw: string | null): MintYouSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MintYouSession;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(
  scopeKey: string,
  session: MintYouSession,
  options?: { hookClient?: HookClient | null },
): Promise<void> {
  const key = getSessionKey(scopeKey);
  const data = JSON.stringify({ ...session, updatedAt: Date.now() });

  const hookClient = options?.hookClient ?? null;
  if (hookClient) {
    const saved = await writeToModStateStore(hookClient, key, data);
    if (saved) {
      return;
    }
  }

  writeLocalStorage(key, data);
}

export async function loadSession(
  scopeKey: string,
  options?: { hookClient?: HookClient | null },
): Promise<MintYouSession | null> {
  const key = getSessionKey(scopeKey);

  const hookClient = options?.hookClient ?? null;
  if (hookClient) {
    const remote = await readFromModStateStore(hookClient, key);
    const parsedRemote = parseSession(remote);
    if (parsedRemote) {
      return parsedRemote;
    }
  }

  return parseSession(readLocalStorage(key));
}

export async function clearSession(
  scopeKey: string,
  options?: { hookClient?: HookClient | null },
): Promise<void> {
  const key = getSessionKey(scopeKey);

  const hookClient = options?.hookClient ?? null;
  if (hookClient) {
    const removed = await removeFromModStateStore(hookClient, key);
    if (removed) {
      return;
    }
  }

  removeLocalStorage(key);
}

export function isSessionExpired(session: MintYouSession): boolean {
  const now = Date.now();
  return (now - session.updatedAt) > SESSION_EXPIRY_MS;
}

export function buildSessionSnapshot(input: {
  sessionId: string;
  userId: string;
  currentStep: MintYouPipelineStep;
  basicInfo: BasicInfo | null;
  selectedInterests: string[];
  scenarioChoices: Record<string, string>;
  traitResult: TraitExtractionResult | null;
  dnaSynthesis: DnaSynthesisOutput | null;
  traitOverrides: { dnaPrimary?: DnaPrimaryType; dnaSecondary?: DnaSecondaryTrait[] } | null;
  referenceImageUrl: string | null;
  worldId: string | null;
  confirmed: boolean;
  createdAgentId: string | null;
}): MintYouSession {
  const now = Date.now();
  return {
    sessionId: input.sessionId,
    userId: input.userId,
    currentStep: input.currentStep,
    basicInfo: input.basicInfo,
    selectedInterests: input.selectedInterests,
    scenarioChoices: input.scenarioChoices,
    traitResult: input.traitResult,
    dnaSynthesis: input.dnaSynthesis,
    traitOverrides: input.traitOverrides,
    referenceImageUrl: input.referenceImageUrl,
    worldId: input.worldId,
    confirmed: input.confirmed,
    createdAgentId: input.createdAgentId,
    createdAt: now,
    updatedAt: now,
  };
}
