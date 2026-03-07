import { emitLocalChatLog } from '../logging.js';
import {
  CORE_DATA_API_AGENT_MEMORY_CORE_LIST,
  CORE_DATA_API_AGENT_MEMORY_E2E_LIST,
  CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
  requireLocalChatCoreQueryBridge,
} from './core-query-bridge.js';
import type { LocalChatTarget } from './types.js';

type LocalChatMemoryRecallSource = 'local-index-only' | 'local-index+remote-backfill' | 'remote-only';

export type LocalChatMemoryRecallResult = {
  coreMemory: string[];
  e2eMemory: string[];
  recallSource: LocalChatMemoryRecallSource;
  entityId: string | null;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNonEmptyString(value: unknown): string {
  return String(value || '').trim();
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : undefined;
}

function toMemoryEntries(value: unknown): Array<string | Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' || (item && typeof item === 'object' && !Array.isArray(item)))
      .map((item) => (typeof item === 'string' ? item : item as Record<string, unknown>));
  }
  const record = toRecord(value);
  if (Array.isArray(record.items)) {
    return toMemoryEntries(record.items);
  }
  if (Array.isArray(record.data)) {
    return toMemoryEntries(record.data);
  }
  return [];
}

function toMemoryText(entry: string | Record<string, unknown>): string {
  if (typeof entry === 'string') return entry.trim();
  const content = toNonEmptyString(
    entry.content
    || entry.text
    || entry.summary
    || entry.memory
    || entry.description
    || entry.value,
  );
  if (content) return content;
  const fallback = JSON.stringify(entry);
  return fallback === '{}' ? '' : fallback;
}

function normalizeMemoryKey(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/喜欢|喜爱/g, '爱好')
    .replace(/玩游戏|打游戏/g, '游戏')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function entryTimestampMs(entry: string | Record<string, unknown>): number | null {
  if (typeof entry === 'string') return null;
  return (
    parseTimestampMs(entry.updatedAt)
    || parseTimestampMs(entry.createdAt)
    || parseTimestampMs(entry.occurredAt)
    || parseTimestampMs(entry.timestamp)
  );
}

function queryTokens(queryText: string): string[] {
  return String(queryText || '')
    .toLowerCase()
    .replace(/喜欢|喜爱/g, '爱好')
    .replace(/玩游戏|打游戏/g, '游戏')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreMemoryEntry(input: {
  text: string;
  queryText: string;
  timestampMs: number | null;
  index: number;
}): number {
  const normalizedText = normalizeMemoryKey(input.text);
  if (!normalizedText) return 0;
  const tokens = queryTokens(input.queryText);
  const relevanceScore = tokens.reduce((score, token) => (
    normalizedText.includes(token) ? score + 1 : score
  ), 0);
  const now = Date.now();
  const ageDays = input.timestampMs
    ? Math.max(0, (now - input.timestampMs) / 86_400_000)
    : 999;
  const recencyScore = input.timestampMs
    ? Math.max(0, 1 - Math.min(1, ageDays / 30))
    : 0.2;
  const orderBias = Math.max(0, 0.4 - input.index * 0.02);
  return relevanceScore * 2 + recencyScore + orderBias;
}

function resolveTopK(input: {
  preferredTopK: number;
  queryText: string;
}): number {
  const preferred = Math.max(1, Math.min(24, Math.floor(input.preferredTopK)));
  const queryLength = String(input.queryText || '').trim().length;
  const budgetBased = queryLength > 0
    ? Math.max(6, Math.min(18, Math.floor(1800 / Math.max(120, queryLength))))
    : 10;
  return Math.max(4, Math.min(preferred, budgetBased));
}

function normalizeRecallSource(value: unknown): LocalChatMemoryRecallSource {
  const source = toNonEmptyString(value);
  if (source === 'local-index-only') return source;
  if (source === 'local-index+remote-backfill') return source;
  return 'remote-only';
}

function resolveEntityIdFromTarget(target: LocalChatTarget): string | null {
  const payload = toRecord(target.payload);
  const candidate = toNonEmptyString(
    payload.entityId
    || payload.currentUserId
    || payload.userId
    || payload.viewerId
    || payload.subjectId,
  );
  return candidate || null;
}

function filterE2EEntriesByEntity(
  entries: Array<string | Record<string, unknown>>,
  entityId: string | null,
): Array<string | Record<string, unknown>> {
  if (!entityId) return entries;
  return entries.filter((entry) => {
    if (typeof entry === 'string') return true;
    const subject = toNonEmptyString(entry.subjectId || entry.entityId || entry.userId);
    if (!subject) return true;
    return subject === entityId;
  });
}

function toMemoryTextList(
  entries: Array<string | Record<string, unknown>>,
  topK: number,
  queryText: string,
): string[] {
  const dedupe = new Map<string, {
    text: string;
    score: number;
  }>();
  entries.forEach((entry, index) => {
    const text = toMemoryText(entry);
    if (!text) return;
    const key = normalizeMemoryKey(text);
    if (!key) return;
    const score = scoreMemoryEntry({
      text,
      queryText,
      timestampMs: entryTimestampMs(entry),
      index,
    });
    const previous = dedupe.get(key);
    if (!previous || score > previous.score) {
      dedupe.set(key, { text, score });
    }
  });
  return Array.from(dedupe.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK))
    .map((item) => item.text);
}

async function queryCoreFallback(input: {
  agentId: string;
  topK: number;
  queryText: string;
}): Promise<string[]> {
  const payload = await requireLocalChatCoreQueryBridge().query(
    CORE_DATA_API_AGENT_MEMORY_CORE_LIST,
    {
      agentId: input.agentId,
      limit: input.topK,
      offset: 0,
    },
  );
  return toMemoryTextList(toMemoryEntries(payload), input.topK, input.queryText);
}

async function queryE2EFallback(input: {
  agentId: string;
  entityId: string | null;
  topK: number;
  queryText: string;
}): Promise<string[]> {
  if (!input.entityId) return [];
  const payload = await requireLocalChatCoreQueryBridge().query(
    CORE_DATA_API_AGENT_MEMORY_E2E_LIST,
    {
      agentId: input.agentId,
      entityId: input.entityId,
      limit: input.topK,
      offset: 0,
    },
  );
  const entries = toMemoryEntries(payload);
  return toMemoryTextList(filterE2EEntriesByEntity(entries, input.entityId), input.topK, input.queryText);
}

export async function recallLocalChatMemoryForPrompt(input: {
  target: LocalChatTarget;
  viewerId?: string;
  userInput: string;
  topK?: number;
}): Promise<LocalChatMemoryRecallResult> {
  const queryText = toNonEmptyString(input.userInput);
  const topK = resolveTopK({
    preferredTopK: toPositiveInt(input.topK) || 10,
    queryText,
  });
  const entityId = toNonEmptyString(input.viewerId) || resolveEntityIdFromTarget(input.target);
  const recallQuery = {
    agentId: input.target.id,
    entityId: entityId || undefined,
    topK,
    queryText,
  };

  let coreMemory: string[] = [];
  let e2eMemory: string[] = [];
  let recallSource: LocalChatMemoryRecallSource = 'remote-only';
  let resolvedEntityId = entityId;

  try {
    const payload = await requireLocalChatCoreQueryBridge().query(
      CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
      recallQuery,
    );
    const response = toRecord(payload);
    const entityFromResponse = toNonEmptyString(response.entityId);
    if (entityFromResponse) {
      resolvedEntityId = entityFromResponse;
    }
    recallSource = normalizeRecallSource(response.recallSource);
    coreMemory = toMemoryTextList(
      toMemoryEntries(response.core || response.coreMemory || response.coreMemories),
      topK,
      queryText,
    );
    e2eMemory = toMemoryTextList(
      filterE2EEntriesByEntity(
        toMemoryEntries(response.e2e || response.e2eMemory || response.e2eMemories),
        resolvedEntityId,
      ),
      topK,
      queryText,
    );
  } catch (error) {
    emitLocalChatLog({
      level: 'warn',
      message: 'local-chat:memory-recall:capability-failed',
      source: 'recallLocalChatMemoryForPrompt',
      details: {
        targetId: input.target.id,
        entityId: resolvedEntityId,
        error: error instanceof Error ? error.message : String(error || ''),
      },
    });
  }

  if (coreMemory.length === 0) {
    try {
      coreMemory = await queryCoreFallback({
        agentId: input.target.id,
        topK,
        queryText,
      });
    } catch {
      coreMemory = [];
    }
  }

  if (e2eMemory.length === 0) {
    try {
      e2eMemory = await queryE2EFallback({
        agentId: input.target.id,
        entityId: resolvedEntityId,
        topK,
        queryText,
      });
    } catch {
      e2eMemory = [];
    }
  }

  emitLocalChatLog({
    level: 'debug',
    message: 'local-chat:memory-recall:done',
    source: 'recallLocalChatMemoryForPrompt',
    details: {
      targetId: input.target.id,
      entityId: resolvedEntityId,
      recallSource,
      coreCount: coreMemory.length,
      e2eCount: e2eMemory.length,
      topK,
      queryLength: queryText.length,
    },
  });

  return {
    coreMemory,
    e2eMemory,
    recallSource,
    entityId: resolvedEntityId,
  };
}
