import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { NarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
} from '../contracts.js';
import {
  NarrativeTurnLatestLookupRequestSchema,
  NarrativeTurnLatestLookupResponseSchema,
  TextplayMemoryRecallResponseSchema,
  TextplayWorldEventListResponseSchema,
  TextplayWorldLorebookListResponseSchema,
  type TextplayMemoryRecallResponse,
  type TextplayWorldEventRow,
  type TextplayWorldLorebookRow,
} from './schemas.js';
import type {
  TextplayReplicaDetail,
  TextplayReplicaSummary,
  TextplayStartupPackage,
} from '../types.js';
import { hashString } from '../utils/hash.js';

const REPLICA_STORY_PREFIX = 'tp.story';
const STARTUP_SOURCE = 'textplay:events+lorebooks+memory+narrative.turn.latest';

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_');
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoOrNow(value: unknown): string {
  const text = toText(value);
  if (!text) {
    return new Date().toISOString();
  }
  return text;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sortPrimaryEvents(rows: TextplayWorldEventRow[]): TextplayWorldEventRow[] {
  const picked = rows.filter((row) => toText(row.level).toUpperCase() === 'PRIMARY');
  return picked.sort((left, right) => {
    const leftTs = toText(left.updatedAt) || toText(left.createdAt);
    const rightTs = toText(right.updatedAt) || toText(right.createdAt);
    const dateOrder = rightTs.localeCompare(leftTs);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    return toText(left.id).localeCompare(toText(right.id));
  });
}

function toStoryId(worldId: string, eventId: string): string {
  return `${REPLICA_STORY_PREFIX}.${normalizeKey(worldId)}.${normalizeKey(eventId)}`;
}

function pickPrimaryAgentId(input: {
  runtimeAgentId?: string;
  characterRefs: string[];
}): string {
  const runtimeAgentId = toText(input.runtimeAgentId);
  if (runtimeAgentId) {
    return runtimeAgentId;
  }
  return input.characterRefs[0] || '';
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreLorebook(input: {
  lorebook: TextplayWorldLorebookRow;
  event: TextplayWorldEventRow;
}): number {
  const title = toText(input.event.title);
  const summary = toText(input.event.summary);
  const eventTokens = unique([...tokenize(title), ...tokenize(summary)]);

  const loreKey = toText(input.lorebook.key).toLowerCase();
  const loreName = toText(input.lorebook.name).toLowerCase();
  const loreContent = toText(input.lorebook.content).toLowerCase();
  const loreKeywords = toStringList(input.lorebook.keywords).map((item) => item.toLowerCase());

  let score = 0;
  for (const token of eventTokens) {
    if (loreKey.includes(token)) {
      score += 3;
    }
    if (loreName.includes(token)) {
      score += 2;
    }
    if (loreContent.includes(token)) {
      score += 1;
    }
    if (loreKeywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
      score += 2;
    }
  }

  return score;
}

function extractMemoryText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const row = value as Record<string, unknown>;
  return (
    toText(row.content)
    || toText(row.summary)
    || toText(row.text)
    || toText(row.value)
    || toText(row.title)
  );
}

function toMemoryTextList(payload: TextplayMemoryRecallResponse): string[] {
  const values: unknown[] = [];
  if (Array.isArray(payload.items)) {
    values.push(...payload.items);
  }
  if (Array.isArray(payload.core)) {
    values.push(...payload.core);
  }
  if (Array.isArray(payload.e2e)) {
    values.push(...payload.e2e);
  }

  const texts = values
    .map(extractMemoryText)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return unique(texts).slice(0, 8);
}

function toReplicaSummary(input: {
  worldId: string;
  event: TextplayWorldEventRow;
  runtimeAgentId?: string;
}): TextplayReplicaSummary {
  const worldId = toText(input.worldId) || toText(input.event.worldId);
  const eventId = toText(input.event.id);
  const participants = unique(toStringList(input.event.characterRefs));
  const primaryAgentId = pickPrimaryAgentId({
    runtimeAgentId: input.runtimeAgentId,
    characterRefs: participants,
  });

  return {
    replicaId: eventId,
    storyId: toStoryId(worldId, eventId),
    worldId,
    sourceEventId: eventId,
    title: toText(input.event.title) || eventId,
    summary: toText(input.event.summary) || toText(input.event.process) || toText(input.event.result) || 'No summary yet.',
    primaryAgentId,
    participants: unique(primaryAgentId ? [primaryAgentId, ...participants] : participants),
    createdAt: toIsoOrNow(input.event.createdAt),
    updatedAt: toIsoOrNow(input.event.updatedAt || input.event.createdAt),
    agentBindingMissing: !primaryAgentId,
  };
}

function toReplicaDetail(input: {
  summary: TextplayReplicaSummary;
  event: TextplayWorldEventRow;
}): TextplayReplicaDetail {
  return {
    ...input.summary,
    cause: toText(input.event.cause),
    process: toText(input.event.process),
    result: toText(input.event.result),
    timeRef: toText(input.event.timeRef),
  };
}

function buildBackgroundSummary(detail: TextplayReplicaDetail): string {
  const lines = [
    detail.title,
    detail.summary,
    detail.cause && `Cause: ${detail.cause}`,
    detail.process && `Process: ${detail.process}`,
    detail.result && `Result: ${detail.result}`,
    detail.timeRef && `TimeRef: ${detail.timeRef}`,
  ].filter((item): item is string => Boolean(item));

  return lines.join('\n');
}

function inferObjective(detail: TextplayReplicaDetail): string {
  return detail.result || detail.process || detail.summary || `Advance ${detail.title}`;
}

function inferPhase(detail: TextplayReplicaDetail): string {
  if (detail.result) {
    return 'post-outcome';
  }
  if (detail.process) {
    return 'in-progress';
  }
  return 'opening';
}

async function queryWorldEvents(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldEventRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
    query: {
      worldId: input.worldId,
    },
  });

  const parsed = TextplayWorldEventListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  const rows = Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data.items;

  return rows;
}

async function queryWorldLorebooks(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldLorebookRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
    query: {
      worldId: input.worldId,
    },
  });

  const parsed = TextplayWorldLorebookListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  return Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data.items;
}

async function queryMemoryRecall(input: {
  hookClient: HookClient;
  agentId: string;
  playerId: string;
}): Promise<TextplayMemoryRecallResponse> {
  if (!input.agentId || !input.playerId) {
    return {
      items: [],
      core: [],
      e2e: [],
      recallSource: 'none',
    };
  }

  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
    query: {
      agentId: input.agentId,
      entityId: input.playerId,
      topK: 8,
    },
  });

  const parsed = TextplayMemoryRecallResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      items: [],
      core: [],
      e2e: [],
      recallSource: 'invalid',
    };
  }

  return parsed.data;
}

async function queryNarrativeLatestTurn(input: {
  narrativeEngine: NarrativeEngineModule;
  storyId: string;
}): Promise<{ turnId: string; createdAt?: string } | null> {
  const requestParsed = NarrativeTurnLatestLookupRequestSchema.safeParse({ storyId: input.storyId });
  if (!requestParsed.success) {
    return null;
  }

  try {
    const payload = await input.narrativeEngine.turnLatest(requestParsed.data);
    const parsed = NarrativeTurnLatestLookupResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    return {
      turnId: parsed.data.turnId,
      createdAt: parsed.data.createdAt,
    };
  } catch {
    return null;
  }
}

export async function listPlayableReplicas(input: {
  hookClient: HookClient;
  worldId: string;
  runtimeAgentId?: string;
}): Promise<TextplayReplicaSummary[]> {
  const worldId = toText(input.worldId);
  if (!worldId) {
    return [];
  }

  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });

  return sortPrimaryEvents(events).map((event) => toReplicaSummary({
    worldId,
    event,
    runtimeAgentId: input.runtimeAgentId,
  }));
}

export async function getPlayableReplicaDetail(input: {
  hookClient: HookClient;
  worldId: string;
  replicaId: string;
  runtimeAgentId?: string;
}): Promise<TextplayReplicaDetail | null> {
  const worldId = toText(input.worldId);
  const replicaId = toText(input.replicaId);
  if (!worldId || !replicaId) {
    return null;
  }

  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });
  const primaryEvents = sortPrimaryEvents(events);
  const event = primaryEvents.find((row) => toText(row.id) === replicaId);
  if (!event) {
    return null;
  }

  const summary = toReplicaSummary({
    worldId,
    event,
    runtimeAgentId: input.runtimeAgentId,
  });

  return toReplicaDetail({
    summary,
    event,
  });
}

export async function loadReplicaStartupPackage(input: {
  hookClient: HookClient;
  narrativeEngine: NarrativeEngineModule;
  detail: TextplayReplicaDetail;
  playerId: string;
}): Promise<TextplayStartupPackage> {
  const detail = input.detail;

  const [lorebooks, memoryRecall, latestTurn] = await Promise.all([
    queryWorldLorebooks({
      hookClient: input.hookClient,
      worldId: detail.worldId,
    }),
    queryMemoryRecall({
      hookClient: input.hookClient,
      agentId: detail.primaryAgentId,
      playerId: input.playerId,
    }),
    queryNarrativeLatestTurn({
      narrativeEngine: input.narrativeEngine,
      storyId: detail.storyId,
    }),
  ]);

  const scoredLorebooks = lorebooks
    .map((row) => ({
      id: toText(row.id),
      key: toText(row.key),
      content: toText(row.content),
      score: scoreLorebook({
        lorebook: row,
        event: {
          id: detail.sourceEventId,
          worldId: detail.worldId,
          level: 'PRIMARY',
          title: detail.title,
          summary: detail.summary,
          cause: detail.cause,
          process: detail.process,
          result: detail.result,
          timeRef: detail.timeRef,
          characterRefs: detail.participants,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
      }),
    }))
    .filter((row) => row.id && row.content)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 8);

  const memories = toMemoryTextList(memoryRecall).slice(0, 8);

  const versionSeed = JSON.stringify({
    eventId: detail.sourceEventId,
    lorebookIds: scoredLorebooks.map((item) => item.id),
    recallSource: toText(memoryRecall.recallSource),
    primaryAgentId: detail.primaryAgentId,
  });

  const snapshot = {
    replicaId: detail.replicaId,
    storyId: detail.storyId,
    primaryAgentId: detail.primaryAgentId,
    version: hashString(versionSeed),
    source: STARTUP_SOURCE,
    loadedAt: new Date().toISOString(),
  };

  return {
    replicaId: detail.replicaId,
    storyId: detail.storyId,
    worldId: detail.worldId,
    primaryAgentId: detail.primaryAgentId,
    participants: detail.participants,
    backgroundSummary: buildBackgroundSummary(detail),
    phase: inferPhase(detail),
    objective: inferObjective(detail),
    availableMaterials: {
      lorebooks: scoredLorebooks,
      memories,
      recallSource: toText(memoryRecall.recallSource) || 'unknown',
    },
    recommendedEntryTurn: latestTurn,
    snapshot,
  };
}
