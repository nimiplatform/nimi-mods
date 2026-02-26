import { loadLocalStorageJson, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import type { PromptLayerId } from './prompt/index.js';
import type { ChatMessageMeta } from './types.js';

export type LocalChatPromptTrace = {
  id: string;
  routeSource: string;
  routeModel: string;
  promptChars: number;
  layerOrder: PromptLayerId[];
  appliedLayers: PromptLayerId[];
  droppedLayers: PromptLayerId[];
  memorySlices: {
    core: number;
    e2e: number;
    worldLore: number;
    agentLore: number;
  };
  budget: {
    maxChars: number;
    usedChars: number;
    truncated: boolean;
  };
  compilerVersion: 'v1';
  retryAttempted: boolean;
  retryImproved: boolean;
  planner?: 'object' | 'fallback';
  planSegments?: number;
  voiceSegments?: number;
  textSegments?: number;
  schedulerTotalDelayMs?: number;
  createdAt: string;
};

export type LocalChatTurnAudit = {
  id: string;
  targetId: string;
  worldId: string | null;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

export type LocalChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  kind?: 'text' | 'voice';
  content: string;
  timestamp: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatPromptTrace;
  audit?: LocalChatTurnAudit;
};

export type LocalChatSession = {
  id: string;
  targetId: string;
  worldId: string | null;
  title: string;
  turns: LocalChatTurn[];
  createdAt: string;
  updatedAt: string;
};

const LOCAL_CHAT_SESSION_STORE_KEY = 'nimi.local-chat.sessions.v1';
const LOCAL_CHAT_SESSION_LIMIT = 80;
const LOCAL_CHAT_SESSION_UPDATED_EVENT = 'local-chat:session-updated';

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadAllSessionsUnsafe(): LocalChatSession[] {
  return loadLocalStorageJson<LocalChatSession[]>(
    LOCAL_CHAT_SESSION_STORE_KEY,
    [],
    (parsed) => {
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as LocalChatSession)
        .filter((item) => typeof item.id === 'string' && typeof item.targetId === 'string')
        .map((item) => ({
          ...item,
          turns: Array.isArray(item.turns) ? item.turns.slice(-LOCAL_CHAT_SESSION_LIMIT * 2) : [],
          createdAt: String(item.createdAt || nowIso()),
          updatedAt: String(item.updatedAt || nowIso()),
          worldId: item.worldId ? String(item.worldId) : null,
          title: String(item.title || 'Session'),
        }));
    },
  );
}

function persistAllSessionsUnsafe(sessions: LocalChatSession[]): void {
  saveLocalStorageJson(LOCAL_CHAT_SESSION_STORE_KEY, sessions);
}

function emitSessionUpdated(payload: {
  targetId: string;
  sessionId: string;
}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(LOCAL_CHAT_SESSION_UPDATED_EVENT, {
    detail: payload,
  }));
}

export function listLocalChatSessions(targetId: string): LocalChatSession[] {
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedTargetId) return [];
  return loadAllSessionsUnsafe()
    .filter((session) => session.targetId === normalizedTargetId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listAllLocalChatSessions(): LocalChatSession[] {
  return loadAllSessionsUnsafe()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLocalChatSession(sessionId: string): LocalChatSession | null {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;
  const all = loadAllSessionsUnsafe();
  return all.find((session) => session.id === normalizedSessionId) || null;
}

export function createLocalChatSession(input: {
  targetId: string;
  worldId?: string | null;
  title?: string;
}): LocalChatSession {
  const createdAt = nowIso();
  return {
    id: createId('session'),
    targetId: String(input.targetId || '').trim(),
    worldId: input.worldId ? String(input.worldId) : null,
    title: String(input.title || 'Session').trim() || 'Session',
    turns: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function upsertLocalChatSession(session: LocalChatSession): LocalChatSession {
  const all = loadAllSessionsUnsafe();
  const next: LocalChatSession = {
    ...session,
    turns: Array.isArray(session.turns) ? session.turns.slice(-LOCAL_CHAT_SESSION_LIMIT * 2) : [],
    updatedAt: nowIso(),
  };
  const index = all.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    all[index] = next;
  } else {
    all.push(next);
  }
  persistAllSessionsUnsafe(all);
  emitSessionUpdated({
    targetId: next.targetId,
    sessionId: next.id,
  });
  return next;
}

export function deleteLocalChatSession(sessionId: string): void {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;
  const all = loadAllSessionsUnsafe();
  const deleted = all.find((session) => session.id === normalizedSessionId) || null;
  const filtered = all.filter((session) => session.id !== normalizedSessionId);
  persistAllSessionsUnsafe(filtered);
  if (deleted) {
    emitSessionUpdated({
      targetId: deleted.targetId,
      sessionId: deleted.id,
    });
  }
}

export function appendTurnsToSession(
  sessionId: string,
  turns: LocalChatTurn[],
): LocalChatSession | null {
  const current = getLocalChatSession(sessionId);
  if (!current) return null;
  const merged = {
    ...current,
    turns: [...current.turns, ...turns].slice(-LOCAL_CHAT_SESSION_LIMIT * 2),
  };
  return upsertLocalChatSession(merged);
}

export function getLocalChatSessionUpdatedEventName(): string {
  return LOCAL_CHAT_SESSION_UPDATED_EVENT;
}
