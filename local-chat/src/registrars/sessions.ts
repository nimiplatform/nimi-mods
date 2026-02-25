import type { HookClient } from '@nimiplatform/mod-sdk/types';
import {
  LOCAL_CHAT_DATA_API_SESSIONS_DELETE,
  LOCAL_CHAT_DATA_API_SESSIONS_GET,
  LOCAL_CHAT_DATA_API_SESSIONS_LIST,
  LOCAL_CHAT_DATA_API_SESSIONS_UPSERT,
} from '../contracts.js';
import {
  createLocalChatSession,
  deleteLocalChatSession,
  getLocalChatSession,
  listLocalChatSessions,
  upsertLocalChatSession,
  type LocalChatSession,
} from '../state/index.js';

function readStringField(input: unknown, key: string): string {
  if (!input || typeof input !== 'object') return '';
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readSessionInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const session = (input as Record<string, unknown>).session;
  if (!session || typeof session !== 'object') return null;
  return session as Record<string, unknown>;
}

export async function registerLocalChatSessionCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;
  await hookClient.data.register({
    capability: LOCAL_CHAT_DATA_API_SESSIONS_LIST,
    handler: async (query) => {
      const targetId = readStringField(query, 'targetId');
      return listLocalChatSessions(targetId);
    },
  });
  await hookClient.data.register({
    capability: LOCAL_CHAT_DATA_API_SESSIONS_GET,
    handler: async (query) => {
      const sessionId = readStringField(query, 'sessionId');
      return getLocalChatSession(sessionId);
    },
  });
  await hookClient.data.register({
    capability: LOCAL_CHAT_DATA_API_SESSIONS_UPSERT,
    handler: async (query) => {
      const session = readSessionInput(query);
      if (session) {
        return upsertLocalChatSession(session as LocalChatSession);
      }
      const targetId = readStringField(query, 'targetId');
      const worldIdRaw = readStringField(query, 'worldId');
      const title = readStringField(query, 'title');
      return upsertLocalChatSession(createLocalChatSession({
        targetId,
        worldId: worldIdRaw || null,
        title,
      }));
    },
  });
  await hookClient.data.register({
    capability: LOCAL_CHAT_DATA_API_SESSIONS_DELETE,
    handler: async (query) => {
      const sessionId = readStringField(query, 'sessionId');
      deleteLocalChatSession(sessionId);
      return { ok: true };
    },
  });
}

