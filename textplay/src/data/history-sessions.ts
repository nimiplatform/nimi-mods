import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { TEXTPLAY_DATA_API_SESSIONS_MINE } from '../contracts.js';
import { TextplayHistorySessionMineResponseSchema } from './schemas.js';
import type { TextplayHistorySession } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toSessionRow(value: unknown): TextplayHistorySession | null {
  const row = asRecord(value);
  const runId = toText(row.runId);
  const storyId = toText(row.storyId);
  const worldId = toText(row.worldId);
  const agentId = toText(row.agentId);
  const storyTitle = toText(row.storyTitle) || storyId;
  const updatedAt = toText(row.updatedAt);
  const triggerSourceRaw = toText(row.triggerSource);
  const triggerSource: TextplayHistorySession['triggerSource'] = (
    triggerSourceRaw === 'UserTurn'
    || triggerSourceRaw === 'AgentInitiative'
    || triggerSourceRaw === 'SystemEvent'
  )
    ? triggerSourceRaw
    : 'UserTurn';
  const preview = toText(row.preview) || '(no preview)';
  if (!runId || !storyId || !worldId || !agentId || !updatedAt) {
    return null;
  }
  return {
    runId,
    storyId,
    worldId,
    agentId,
    storyTitle,
    updatedAt,
    triggerSource,
    preview,
  };
}

export async function listMyHistorySessions(input: {
  hookClient: HookClient;
  playerId: string;
  worldId?: string;
  limit?: number;
  cursor?: string;
  refresh?: boolean;
}): Promise<{
  items: TextplayHistorySession[];
  nextCursor: string | null;
  total: number;
}> {
  const normalizedPlayerId = toText(input.playerId);
  if (!normalizedPlayerId) {
    return {
      items: [],
      nextCursor: null,
      total: 0,
    };
  }

  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_SESSIONS_MINE,
    query: {
      playerId: normalizedPlayerId,
      ...(toText(input.worldId) ? { worldId: toText(input.worldId) } : {}),
      ...(Number.isFinite(input.limit) ? { limit: input.limit } : {}),
      ...(toText(input.cursor) ? { cursor: toText(input.cursor) } : {}),
      ...(input.refresh === true ? { refresh: true } : {}),
    },
  });

  const envelope = asRecord(payload);
  const data = envelope.ok === true
    ? envelope
    : (asRecord(envelope.data).items ? asRecord(envelope.data) : envelope);
  const parsed = TextplayHistorySessionMineResponseSchema.safeParse(data);
  if (!parsed.success) {
    return {
      items: [],
      nextCursor: null,
      total: 0,
    };
  }

  const rows = Array.isArray(parsed.data.items) ? parsed.data.items : [];
  return {
    items: rows
      .map((row) => toSessionRow(row))
      .filter((row): row is TextplayHistorySession => row !== null),
    nextCursor: parsed.data.nextCursor ?? null,
    total: Number.isFinite(parsed.data.total) ? Number(parsed.data.total) : rows.length,
  };
}
