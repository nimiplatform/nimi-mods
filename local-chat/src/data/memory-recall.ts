import type { PromptRetrievalTrace } from '../prompt/index.js';
import { emitLocalChatLog } from '../logging.js';
import {
  CORE_DATA_API_AGENT_MEMORY_CORE_LIST,
  CORE_DATA_API_AGENT_MEMORY_E2E_LIST,
  CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
  requireLocalChatCoreQueryBridge,
} from './core-query-bridge.js';
import type { LocalChatTarget } from './types.js';

type LocalChatMemoryRecallSource = PromptRetrievalTrace['recallSource'];

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

function dedupeStrings(input: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  input.forEach((item) => {
    const key = item.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(key);
  });
  return deduped;
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
): string[] {
  const normalized = entries
    .map((entry) => toMemoryText(entry))
    .filter((item) => item.length > 0);
  return dedupeStrings(normalized).slice(0, topK);
}

async function queryCoreFallback(input: {
  agentId: string;
  topK: number;
}): Promise<string[]> {
  const payload = await requireLocalChatCoreQueryBridge().query(
    CORE_DATA_API_AGENT_MEMORY_CORE_LIST,
    {
      agentId: input.agentId,
      limit: input.topK,
      offset: 0,
    },
  );
  return toMemoryTextList(toMemoryEntries(payload), input.topK);
}

async function queryE2EFallback(input: {
  agentId: string;
  entityId: string | null;
  topK: number;
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
  return toMemoryTextList(filterE2EEntriesByEntity(entries, input.entityId), input.topK);
}

export async function recallLocalChatMemoryForPrompt(input: {
  target: LocalChatTarget;
  userInput: string;
  topK?: number;
}): Promise<LocalChatMemoryRecallResult> {
  const topK = toPositiveInt(input.topK) || 10;
  const entityId = resolveEntityIdFromTarget(input.target);
  const recallQuery = {
    agentId: input.target.id,
    entityId: entityId || undefined,
    topK,
    queryText: toNonEmptyString(input.userInput),
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
    );
    e2eMemory = toMemoryTextList(
      filterE2EEntriesByEntity(
        toMemoryEntries(response.e2e || response.e2eMemory || response.e2eMemories),
        resolvedEntityId,
      ),
      topK,
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
    },
  });

  return {
    coreMemory,
    e2eMemory,
    recallSource,
    entityId: resolvedEntityId,
  };
}
