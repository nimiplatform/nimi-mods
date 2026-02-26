import { asRecord } from '@nimiplatform/mod-sdk/utils';
import type {
  DraftPatch,
  FinalDraftAccumulator,
  WorldStudioAgentDraft,
} from './types.js';

const REVISION_LIMIT = 120;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) return Object.keys(value).length > 0;
  return false;
}

function mergeUnknown(existing: unknown, incoming: unknown): unknown {
  if (!hasMeaningfulValue(incoming)) return existing;
  if (Array.isArray(incoming)) {
    return incoming.filter((item) => hasMeaningfulValue(item));
  }
  if (isPlainRecord(incoming)) {
    return mergeRecordPreferIncoming(asRecord(existing), incoming);
  }
  return incoming;
}

export function mergeRecordPreferIncoming(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  Object.entries(incoming).forEach(([key, value]) => {
    const previous = merged[key];
    const next = mergeUnknown(previous, value);
    if (hasMeaningfulValue(next)) {
      merged[key] = next;
    }
  });
  return merged;
}

function draftArrayKey(value: Record<string, unknown>): string {
  const key = String(value.key || '').trim();
  if (key) return `key:${key}`;
  const id = String(value.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(value.name || '').trim();
  if (name) return `name:${name.toLowerCase()}`;
  return JSON.stringify(value);
}

function mergeDraftArray(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  existing.forEach((item) => {
    const record = asRecord(item);
    byKey.set(draftArrayKey(record), record);
  });
  incoming.forEach((item) => {
    const record = asRecord(item);
    const key = draftArrayKey(record);
    const previous = byKey.get(key);
    byKey.set(
      key,
      previous
        ? mergeRecordPreferIncoming(previous, record)
        : record,
    );
  });
  return Array.from(byKey.values());
}

function mergeAgentDraft(existing: WorldStudioAgentDraft | undefined, incoming: WorldStudioAgentDraft): WorldStudioAgentDraft {
  if (!existing) {
    return {
      ...incoming,
      characterName: incoming.characterName,
      handle: String(incoming.handle || ''),
      concept: String(incoming.concept || ''),
      backstory: String(incoming.backstory || ''),
      coreValues: String(incoming.coreValues || ''),
      relationshipStyle: String(incoming.relationshipStyle || ''),
    };
  }
  const merged = mergeRecordPreferIncoming(
    asRecord(existing),
    asRecord(incoming),
  ) as WorldStudioAgentDraft;
  return {
    ...existing,
    ...merged,
    characterName: incoming.characterName || existing.characterName,
    handle: String(merged.handle || existing.handle || ''),
    concept: String(merged.concept || existing.concept || ''),
    backstory: String(merged.backstory || existing.backstory || ''),
    coreValues: String(merged.coreValues || existing.coreValues || ''),
    relationshipStyle: String(merged.relationshipStyle || existing.relationshipStyle || ''),
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createEmptyFinalDraftAccumulator(): FinalDraftAccumulator {
  return {
    world: {},
    worldview: {},
    worldLorebooks: [],
    futureHistoricalEvents: [],
    agentDraftsByCharacter: {},
    revisions: [],
    lastUpdatedChunk: -1,
  };
}

export function buildFinalDraftAccumulatorSlice(
  accumulator: FinalDraftAccumulator,
  options?: {
    maxLorebooks?: number;
    maxFutureEvents?: number;
    maxAgentDrafts?: number;
    maxRevisions?: number;
  },
): Record<string, unknown> {
  const maxLorebooks = Math.max(1, options?.maxLorebooks ?? 10);
  const maxFutureEvents = Math.max(1, options?.maxFutureEvents ?? 10);
  const maxAgentDrafts = Math.max(1, options?.maxAgentDrafts ?? 8);
  const maxRevisions = Math.max(1, options?.maxRevisions ?? 10);
  const agentDrafts = Object.values(accumulator.agentDraftsByCharacter || {})
    .slice(0, maxAgentDrafts);

  return {
    world: accumulator.world || {},
    worldview: accumulator.worldview || {},
    worldLorebooks: (accumulator.worldLorebooks || []).slice(0, maxLorebooks),
    futureHistoricalEvents: (accumulator.futureHistoricalEvents || []).slice(0, maxFutureEvents),
    agentDrafts,
    revisions: (accumulator.revisions || []).slice(-maxRevisions),
    lastUpdatedChunk: accumulator.lastUpdatedChunk,
  };
}

export function applyDraftPatch(
  accumulator: FinalDraftAccumulator,
  patch: DraftPatch,
): {
  next: FinalDraftAccumulator;
  changedFields: string[];
} {
  const changedFields: string[] = [];

  const nextWorld = patch.world
    ? mergeRecordPreferIncoming(accumulator.world, patch.world)
    : accumulator.world;
  if (!valuesEqual(nextWorld, accumulator.world)) changedFields.push('world');

  const nextWorldview = patch.worldview
    ? mergeRecordPreferIncoming(accumulator.worldview, patch.worldview)
    : accumulator.worldview;
  if (!valuesEqual(nextWorldview, accumulator.worldview)) changedFields.push('worldview');

  const nextWorldLorebooks = Array.isArray(patch.worldLorebooks)
    ? mergeDraftArray(accumulator.worldLorebooks, patch.worldLorebooks.map((item) => asRecord(item)))
    : accumulator.worldLorebooks;
  if (!valuesEqual(nextWorldLorebooks, accumulator.worldLorebooks)) changedFields.push('worldLorebooks');

  const nextFutureEvents = Array.isArray(patch.futureHistoricalEvents)
    ? mergeDraftArray(accumulator.futureHistoricalEvents, patch.futureHistoricalEvents.map((item) => asRecord(item)))
    : accumulator.futureHistoricalEvents;
  if (!valuesEqual(nextFutureEvents, accumulator.futureHistoricalEvents)) changedFields.push('futureHistoricalEvents');

  const nextAgentDraftsByCharacter = { ...(accumulator.agentDraftsByCharacter || {}) };
  if (Array.isArray(patch.agentDrafts)) {
    patch.agentDrafts.forEach((draft) => {
      const characterName = String(draft.characterName || '').trim();
      if (!characterName) return;
      const merged = mergeAgentDraft(nextAgentDraftsByCharacter[characterName], draft);
      if (!valuesEqual(merged, nextAgentDraftsByCharacter[characterName])) {
        nextAgentDraftsByCharacter[characterName] = merged;
        changedFields.push(`agentDraftsByCharacter.${characterName}`);
      }
    });
  }

  const nextRevisions = changedFields.length > 0
    ? [
      ...accumulator.revisions,
      {
        chunkIndex: patch.chunkIndex,
        appliedAt: new Date().toISOString(),
        changedFields: Array.from(new Set(changedFields)),
        ...(Array.isArray(patch.notes) && patch.notes.length > 0
          ? { note: String(patch.notes[0] || '').trim() }
          : {}),
      },
    ].slice(-REVISION_LIMIT)
    : accumulator.revisions;

  const next: FinalDraftAccumulator = {
    world: nextWorld,
    worldview: nextWorldview,
    worldLorebooks: nextWorldLorebooks,
    futureHistoricalEvents: nextFutureEvents,
    agentDraftsByCharacter: nextAgentDraftsByCharacter,
    revisions: nextRevisions,
    lastUpdatedChunk: changedFields.length > 0
      ? Math.max(accumulator.lastUpdatedChunk, patch.chunkIndex)
      : accumulator.lastUpdatedChunk,
  };
  return {
    next,
    changedFields: Array.from(new Set(changedFields)),
  };
}

export function resolveAccumulatorAgentDrafts(
  accumulator: FinalDraftAccumulator,
  selectedCharacters: string[],
): WorldStudioAgentDraft[] {
  const byCharacter = accumulator.agentDraftsByCharacter || {};
  return selectedCharacters
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => byCharacter[name])
    .filter((draft): draft is WorldStudioAgentDraft => Boolean(draft));
}
