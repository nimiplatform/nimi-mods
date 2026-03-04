import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { isSyntheticEntityName } from './errors.js';
import type {
  AccumulatedCharacter,
  AccumulatedEvent,
  AccumulatedLocation,
  AccumulatedRelation,
  AccumulatedState,
  AccumulatedTimeline,
  ChunkExtraction,
  EntityFreshness,
  EventNodeDraft,
} from './types.js';

function normalizeId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

const PLACEHOLDER_EVENT_ID_RE = /^(?:evt|event|primary|secondary|main|sub|p|s)[-_:\s]*[a-z]*\d+(?:[-_:\s]*\d+)*$/i;
const PLACEHOLDER_ENTITY_NAME_RE = /^(?:char(?:acter)?|role|persona?|loc(?:ation)?|evt|event|timeline|segment|item|node|人物|角色|地点|事件|时间线)(?:[-_: ]+[a-z0-9]+|\d+)$/i;

function isPlaceholderEventId(value: unknown): boolean {
  const normalized = normalizeId(value);
  if (!normalized) return true;
  return PLACEHOLDER_ENTITY_NAME_RE.test(normalized) || PLACEHOLDER_EVENT_ID_RE.test(normalized);
}

function normalizeSortedList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values
    .map((value) => normalizeId(value))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .forEach((value) => {
      if (seen.has(value)) return;
      seen.add(value);
      output.push(value);
    });
  return output;
}

function buildEventSemanticKey(item: EventNodeDraft, fallbackKey: string): string {
  const normalizedTitle = normalizeId(item.title || '');
  const normalizedSummary = normalizeId(item.summary || '');
  const normalizedTimeRef = normalizeId(item.timeRef || '');
  const normalizedCharacters = normalizeSortedList(item.characterRefs || []).join(',');
  const normalizedLocations = normalizeSortedList(item.locationRefs || []).join(',');
  const key = [
    normalizedTitle,
    normalizedSummary,
    normalizedTimeRef,
    normalizedCharacters,
    normalizedLocations,
  ].filter(Boolean).join('|');
  return key || fallbackKey;
}

function resolveEventMergeKey(item: EventNodeDraft, fallbackKey: string): string {
  const normalizedId = normalizeId(item.id || '');
  if (normalizedId && !isPlaceholderEventId(normalizedId)) {
    return `id:${normalizedId}`;
  }
  return `semantic:${buildEventSemanticKey(item, fallbackKey)}`;
}

function makeFreshness(chunkIndex: number): EntityFreshness {
  return { firstSeenChunk: chunkIndex, lastSeenChunk: chunkIndex, mentionCount: 1 };
}

function bumpFreshness(existing: EntityFreshness, chunkIndex: number): EntityFreshness {
  return {
    firstSeenChunk: existing.firstSeenChunk,
    lastSeenChunk: chunkIndex,
    mentionCount: existing.mentionCount + 1,
  };
}

function canonicalPair(a: string, b: string): string {
  return [a, b].sort().join('→');
}

function upsertCharacters(
  existing: AccumulatedCharacter[],
  incoming: Array<Record<string, unknown>>,
  chunkIndex: number,
): AccumulatedCharacter[] {
  const byKey = new Map<string, AccumulatedCharacter>();
  existing.forEach((item) => {
    const key = normalizeId(asRecord(item).name);
    if (key) byKey.set(key, item);
  });
  incoming.forEach((item) => {
    const name = String(item.name || '').trim();
    const key = normalizeId(name);
    if (!key || isSyntheticEntityName(name)) return;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...item,
        name,
        _freshness: bumpFreshness(prev._freshness, chunkIndex),
      });
    } else {
      byKey.set(key, { ...item, name, _freshness: makeFreshness(chunkIndex) });
    }
  });
  return Array.from(byKey.values());
}

function upsertLocations(
  existing: AccumulatedLocation[],
  incoming: Array<Record<string, unknown>>,
  chunkIndex: number,
): AccumulatedLocation[] {
  const byKey = new Map<string, AccumulatedLocation>();
  existing.forEach((item) => {
    const key = normalizeId(asRecord(item).name);
    if (key) byKey.set(key, item);
  });
  incoming.forEach((item) => {
    const name = String(item.name || '').trim();
    const key = normalizeId(name);
    if (!key || isSyntheticEntityName(name)) return;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...item,
        name,
        _freshness: bumpFreshness(prev._freshness, chunkIndex),
      });
    } else {
      byKey.set(key, { ...item, name, _freshness: makeFreshness(chunkIndex) });
    }
  });
  return Array.from(byKey.values());
}

function upsertEvents(
  existing: AccumulatedEvent[],
  incoming: EventNodeDraft[],
  chunkIndex: number,
): AccumulatedEvent[] {
  const byKey = new Map<string, AccumulatedEvent>();
  existing.forEach((item, index) => {
    const key = resolveEventMergeKey(item, `existing-${index + 1}`);
    if (key) byKey.set(key, item);
  });
  incoming.forEach((item, index) => {
    const key = resolveEventMergeKey(
      item,
      `chunk-${chunkIndex + 1}-event-${index + 1}`,
    );
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...item,
        _freshness: bumpFreshness(prev._freshness, chunkIndex),
      });
    } else {
      byKey.set(key, { ...item, _freshness: makeFreshness(chunkIndex) });
    }
  });
  return Array.from(byKey.values());
}

function upsertRelations(
  existing: AccumulatedRelation[],
  incoming: Array<Record<string, unknown>>,
  chunkIndex: number,
): AccumulatedRelation[] {
  const byKey = new Map<string, AccumulatedRelation>();
  existing.forEach((item) => {
    const record = asRecord(item);
    const source = normalizeId(record.source);
    const target = normalizeId(record.target);
    const relation = normalizeId(record.relation);
    const key = `${canonicalPair(source, target)}:${relation}`;
    if (key !== ':') byKey.set(key, item);
  });
  incoming.forEach((item) => {
    const source = normalizeId(item.source);
    const target = normalizeId(item.target);
    const relation = normalizeId(item.relation);
    if (!source || !target) return;
    const key = `${canonicalPair(source, target)}:${relation}`;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...item,
        _freshness: bumpFreshness(prev._freshness, chunkIndex),
      });
    } else {
      byKey.set(key, { ...item, _freshness: makeFreshness(chunkIndex) });
    }
  });
  return Array.from(byKey.values());
}

function upsertTimeline(
  existing: AccumulatedTimeline[],
  incoming: Array<Record<string, unknown>>,
  chunkIndex: number,
): AccumulatedTimeline[] {
  const byKey = new Map<string, AccumulatedTimeline>();
  existing.forEach((item) => {
    const record = asRecord(item);
    const key = normalizeId(record.id || record.label);
    if (key) byKey.set(key, item);
  });
  incoming.forEach((item) => {
    const key = normalizeId(item.id || item.label);
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        ...item,
        _freshness: bumpFreshness(prev._freshness, chunkIndex),
      });
    } else {
      byKey.set(key, { ...item, _freshness: makeFreshness(chunkIndex) });
    }
  });
  return Array.from(byKey.values());
}

/**
 * Upsert a chunk extraction into the accumulated state (latest wins).
 * Does NOT update lastProcessedChunk or successfulChunks — the caller does that.
 */
export function upsertMergeExtraction(
  state: AccumulatedState,
  extraction: ChunkExtraction,
  chunkIndex: number,
): AccumulatedState {
  const characters = upsertCharacters(
    state.characters,
    extraction.characters.map((item) => asRecord(item)),
    chunkIndex,
  );
  const locations = upsertLocations(
    state.locations,
    extraction.locations.map((item) => asRecord(item)),
    chunkIndex,
  );
  const primaryEvents = upsertEvents(state.events.primary, extraction.events.primary, chunkIndex);
  const secondaryEvents = upsertEvents(state.events.secondary, extraction.events.secondary, chunkIndex);
  const characterRelations = upsertRelations(
    state.characterRelations,
    extraction.characterRelations.map((item) => asRecord(item)),
    chunkIndex,
  );
  const timeline = upsertTimeline(
    state.timeline,
    extraction.timeline.map((item) => asRecord(item)),
    chunkIndex,
  );
  const worldSetting = extraction.worldSetting?.trim()
    ? extraction.worldSetting.trim()
    : state.worldSetting;

  return {
    ...state,
    worldSetting,
    timeline,
    locations,
    characters,
    events: { primary: primaryEvents, secondary: secondaryEvents },
    characterRelations,
  };
}

/** Strip _freshness from all entities, convert to ChunkExtraction for downstream compatibility */
export function toChunkExtraction(state: AccumulatedState): ChunkExtraction {
  const stripFreshness = <T extends { _freshness: EntityFreshness }>(items: T[]): Array<Omit<T, '_freshness'>> => {
    return items.map(({ _freshness, ...rest }) => rest as Omit<T, '_freshness'>);
  };

  return {
    worldSetting: state.worldSetting,
    timeline: stripFreshness(state.timeline) as ChunkExtraction['timeline'],
    locations: stripFreshness(state.locations) as ChunkExtraction['locations'],
    characters: stripFreshness(state.characters) as ChunkExtraction['characters'],
    events: {
      primary: stripFreshness(state.events.primary) as EventNodeDraft[],
      secondary: stripFreshness(state.events.secondary) as EventNodeDraft[],
    },
    characterRelations: stripFreshness(state.characterRelations) as ChunkExtraction['characterRelations'],
  };
}
