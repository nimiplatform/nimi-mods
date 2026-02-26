import { asRecord, clamp01 } from '@nimiplatform/sdk/mod/utils';
import type {
  CharacterPoint,
  CharacterRelationPoint,
  ChunkExtraction,
  EventNodeDraft,
  LocationPoint,
  Phase1Character,
  Phase1Option,
  TimelinePoint,
  WorldStudioKnowledgeGraphDraft,
} from './types.js';

function normalizeId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function uniqueBy<T>(items: T[], keyOf: (item: T, index: number) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  items.forEach((item, index) => {
    const key = keyOf(item, index);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
}

function normalizeEvent(item: EventNodeDraft, fallbackLevel: 'PRIMARY' | 'SECONDARY'): EventNodeDraft {
  const level = item.level === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
  const evidenceRefs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  return {
    ...item,
    id: String(item.id || `${fallbackLevel.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`),
    level,
    parentEventId: item.parentEventId || null,
    title: String(item.title || '').trim() || 'Untitled Event',
    summary: String(item.summary || '').trim(),
    cause: String(item.cause || '').trim(),
    process: String(item.process || '').trim(),
    result: String(item.result || '').trim(),
    timeRef: String(item.timeRef || '').trim(),
    locationRefs: Array.isArray(item.locationRefs)
      ? item.locationRefs.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    characterRefs: Array.isArray(item.characterRefs)
      ? item.characterRefs.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    dependsOnEventIds: Array.isArray(item.dependsOnEventIds)
      ? item.dependsOnEventIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    evidenceRefs,
    confidence: clamp01(item.confidence, 0.5),
    needsEvidence: level === 'PRIMARY' ? evidenceRefs.length === 0 : Boolean(item.needsEvidence),
  };
}

function mergeWorldSetting(extractions: ChunkExtraction[]): string {
  return extractions
    .map((item) => String(item.worldSetting || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';
}

function mergeEvents(extractions: ChunkExtraction[]): { primary: EventNodeDraft[]; secondary: EventNodeDraft[] } {
  const primaryRaw = extractions.flatMap((item) => item.events.primary || []).map((item) => normalizeEvent(item, 'PRIMARY'));
  const secondaryRaw = extractions.flatMap((item) => item.events.secondary || []).map((item) => normalizeEvent(item, 'SECONDARY'));

  const primary = uniqueBy(primaryRaw, (item, index) => (
    normalizeId(item.id || item.title || `primary-${index + 1}`)
  ));

  const primaryIdSet = new Set(primary.map((item) => item.id));
  const secondary = uniqueBy(secondaryRaw, (item, index) => (
    normalizeId(item.id || `${item.parentEventId || ''}-${item.title || ''}-${index + 1}`)
  )).map((item) => {
    if (item.parentEventId && primaryIdSet.has(item.parentEventId)) {
      return item;
    }
    return {
      ...item,
      parentEventId: item.parentEventId || null,
    };
  });

  return { primary, secondary };
}

function collectCharactersFromEvents(events: EventNodeDraft[]): CharacterPoint[] {
  const names = events.flatMap((event) => event.characterRefs || []).map((name) => String(name || '').trim()).filter(Boolean);
  return uniqueBy(
    names.map((name) => ({
      name,
      summary: 'Recovered from event graph.',
      significance: 0.5,
    })),
    (item) => normalizeId(item.name),
  );
}

function collectLocationsFromEvents(events: EventNodeDraft[]): LocationPoint[] {
  const names = events.flatMap((event) => event.locationRefs || []).map((name) => String(name || '').trim()).filter(Boolean);
  return uniqueBy(
    names.map((name) => ({
      id: `loc:${name.toLowerCase()}`,
      name,
      description: 'Recovered from event graph.',
      importance: 0.5,
    })),
    (item) => normalizeId(item.name),
  );
}

function collectTimelineFromEvents(events: EventNodeDraft[]): TimelinePoint[] {
  const labels = events
    .map((event) => String(event.timeRef || '').trim())
    .filter(Boolean);
  return uniqueBy(
    labels.map((label, index) => ({
      id: `timeline:${index + 1}`,
      label,
      description: 'Recovered from event timeRef.',
      weight: 0.5,
    })),
    (item) => normalizeId(item.label || item.id || ''),
  );
}

function collectCharactersFromRelations(relations: CharacterRelationPoint[]): CharacterPoint[] {
  const names: string[] = [];
  relations.forEach((relation) => {
    const record = asRecord(relation);
    const source = String(record.source || '').trim();
    const target = String(record.target || '').trim();
    if (source) names.push(source);
    if (target) names.push(target);
  });
  return uniqueBy(
    names.map((name) => ({
      name,
      summary: 'Recovered from relation graph.',
      significance: 0.45,
    })),
    (item) => normalizeId(item.name),
  );
}

function mergeCharacters(primary: CharacterPoint[], eventFallback: CharacterPoint[], relationFallback: CharacterPoint[]): CharacterPoint[] {
  return uniqueBy(
    [...primary, ...eventFallback, ...relationFallback],
    (item, index) => normalizeId(item.name || item.id || `char-${index + 1}`),
  );
}

function mergeLocations(primary: LocationPoint[], eventFallback: LocationPoint[]): LocationPoint[] {
  return uniqueBy(
    [...primary, ...eventFallback],
    (item, index) => normalizeId(item.name || item.id || `loc-${index + 1}`),
  );
}

function mergeTimeline(primary: TimelinePoint[], eventFallback: TimelinePoint[]): TimelinePoint[] {
  return uniqueBy(
    [...primary, ...eventFallback],
    (item, index) => normalizeId(item.id || item.label || `timeline-${index + 1}`),
  );
}

export function mergeExtractions(extractions: ChunkExtraction[]): WorldStudioKnowledgeGraphDraft {
  const primaryTimeline = uniqueBy(
    extractions.flatMap((item) => item.timeline),
    (item, index) => normalizeId(asRecord(item).id || asRecord(item).label || `timeline-${index + 1}`),
  );
  const primaryLocations = uniqueBy(
    extractions.flatMap((item) => item.locations),
    (item, index) => normalizeId(asRecord(item).name || asRecord(item).id || `loc-${index + 1}`),
  );
  const primaryCharacters = uniqueBy(
    extractions.flatMap((item) => item.characters),
    (item, index) => normalizeId(asRecord(item).name || asRecord(item).id || `char-${index + 1}`),
  );
  const characterRelations = uniqueBy(
    extractions.flatMap((item) => item.characterRelations),
    (item, index) => {
      const record = asRecord(item);
      const relationKey = `${record.source || ''}->${record.target || ''}:${record.relation || ''}`;
      return normalizeId(relationKey || `rel-${index + 1}`);
    },
  );

  const mergedEvents = mergeEvents(extractions);
  const flatEvents = [...mergedEvents.primary, ...mergedEvents.secondary];

  const eventCharacters = collectCharactersFromEvents(flatEvents);
  const relationCharacters = collectCharactersFromRelations(characterRelations);
  const eventLocations = collectLocationsFromEvents(flatEvents);
  const eventTimeline = collectTimelineFromEvents(flatEvents);

  return {
    worldSetting: mergeWorldSetting(extractions),
    timeline: mergeTimeline(primaryTimeline, eventTimeline),
    locations: mergeLocations(primaryLocations, eventLocations),
    characters: mergeCharacters(primaryCharacters, eventCharacters, relationCharacters),
    events: mergedEvents,
    characterRelations,
    futureHistoricalEvents: [],
  };
}

export function toStartTimeOptions(timeline: Array<Record<string, unknown>>): Phase1Option[] {
  const seen = new Set<string>();
  const options: Phase1Option[] = [];
  timeline.forEach((item, index) => {
    const label = String(item.label || item.time || '').trim();
    const id = String(item.id || `timeline:${index + 1}`).trim();
    if (!label) return;
    const key = normalizeId(`${label}|${String(item.time || '').trim()}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({
      id: id || `timeline:${index + 1}`,
      label,
      description: String(item.description || ''),
      weight: clamp01(item.weight, 0.5),
    });
  });
  return options;
}

export function toCharacterCandidates(characters: Array<Record<string, unknown>>): Phase1Character[] {
  return uniqueBy(
    characters
      .map((item, index) => ({
        name: String(item.name || `Character-${index + 1}`).trim(),
        summary: String(item.summary || item.description || ''),
        significance: clamp01(item.significance, 0.5),
      }))
      .filter((item) => Boolean(item.name)),
    (item) => normalizeId(item.name),
  ).slice(0, 24);
}
