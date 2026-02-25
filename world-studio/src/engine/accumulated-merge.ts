import { asRecord } from '@nimiplatform/mod-sdk/utils';
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

/** Reject synthetic IDs leaked from LLM output schema examples.
 *  Matches: char-1, char-han-li, loc-3, evt-p1, segment-5, etc.
 *  Safe for CJK names: Chinese/Japanese/Korean characters are NOT in [\w-]. */
const SYNTHETIC_ID_PATTERN = /^(char|loc|evt|t|segment|future|primary|secondary)-[\w-]+$/i;

function isSyntheticId(name: string): boolean {
  return SYNTHETIC_ID_PATTERN.test(name.trim());
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
    if (!key || isSyntheticId(name)) return;
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
    if (!key || isSyntheticId(name)) return;
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
  existing.forEach((item) => {
    const key = normalizeId(item.id);
    if (key) byKey.set(key, item);
  });
  incoming.forEach((item) => {
    const key = normalizeId(item.id);
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
