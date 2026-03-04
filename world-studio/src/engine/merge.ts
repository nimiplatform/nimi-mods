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

const PLACEHOLDER_EVENT_ID_RE = /^(?:evt|event|primary|secondary|main|sub|p|s)[-_:\s]*[a-z]*\d+(?:[-_:\s]*\d+)*$/i;

const PLACEHOLDER_ENTITY_NAME_RE = /^(?:char(?:acter)?|role|persona?|loc(?:ation)?|evt|event|timeline|segment|item|node|人物|角色|地点|事件|时间线)(?:[-_: ]+[a-z0-9]+|\d+)$/i;
const EVENT_TITLE_PUNCTUATION_RE = /[\s,.;:!?，。！？；：“”"'`~\-—_()[\]{}<>《》【】、]/g;
const EVENT_TITLE_ACTION_SYNONYM_RE = /(捡获|捡到|发现|拾得|获得|得到|获取|拿到|找到|意外发现|意外捡到)/g;
const EVENT_TITLE_OPEN_SYNONYM_RE = /(开启|开瓶|打开|拧开|尝试开启|尝试开瓶)/g;
const EVENT_TITLE_FAIL_SYNONYM_RE = /(失败|未果|未能|不成)/g;
const EVENT_TITLE_GREEN_BOTTLE_RE = /(神秘)?(墨绿|碧绿|绿色?|绿)(色)?(小)?瓶(子)?/g;
const EVENT_NUMERIC_TOKEN_RE = /(\d+(?:\.\d+)?|[零一二两三四五六七八九十百千万半]+)(?:岁|年|个月|月|周|天|日|层|次)?/g;

function isPlaceholderEntityName(value: string): boolean {
  const name = String(value || '').trim();
  if (!name) return true;
  return PLACEHOLDER_ENTITY_NAME_RE.test(name);
}

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

function normalizeEventTitleForMerge(value: unknown): string {
  const source = normalizeId(value);
  if (!source) return '';
  return source
    .replace(EVENT_TITLE_ACTION_SYNONYM_RE, '获得')
    .replace(EVENT_TITLE_OPEN_SYNONYM_RE, '开瓶')
    .replace(EVENT_TITLE_FAIL_SYNONYM_RE, '失败')
    .replace(EVENT_TITLE_GREEN_BOTTLE_RE, '绿瓶')
    .replace(EVENT_TITLE_PUNCTUATION_RE, '');
}

function extractNumericTokens(value: string): string[] {
  const tokens = Array.from(value.matchAll(EVENT_NUMERIC_TOKEN_RE))
    .map((match) => String(match[0] || '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const output: string[] = [];
  tokens.forEach((token) => {
    if (seen.has(token)) return;
    seen.add(token);
    output.push(token);
  });
  return output;
}

function buildTemporalMergeBucket(value: unknown): string {
  const source = normalizeId(value);
  if (!source) return 'na';
  const parts: string[] = [];
  if (/前/.test(source) && !/后/.test(source)) {
    parts.push('before');
  } else if (/后|之后|以后|后来|次日|翌日|隔日/.test(source)) {
    parts.push('after');
  }
  const durationMatch = source.match(/([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*(年|(?:个)?月|周|天|日|岁)/);
  if (durationMatch) {
    parts.push(`dur:${durationMatch[1]}${durationMatch[2]}`);
  }
  if (source.includes('春')) parts.push('spring');
  if (source.includes('夏')) parts.push('summer');
  if (source.includes('秋')) parts.push('autumn');
  if (source.includes('冬')) parts.push('winter');
  if (source.includes('凌晨')) parts.push('before-dawn');
  else if (source.includes('清晨') || source.includes('黎明')) parts.push('dawn');
  else if (source.includes('早晨') || source.includes('上午')) parts.push('morning');
  else if (source.includes('正午') || source.includes('中午')) parts.push('noon');
  else if (source.includes('下午')) parts.push('afternoon');
  else if (source.includes('傍晚') || source.includes('黄昏')) parts.push('evening');
  else if (source.includes('深夜')) parts.push('late-night');
  else if (source.includes('夜') || source.includes('晚上')) parts.push('night');
  return parts.length > 0 ? parts.join('|') : 'na';
}

function eventSignalScore(event: EventNodeDraft): number {
  const evidenceCount = Array.isArray(event.evidenceRefs) ? event.evidenceRefs.length : 0;
  const confidence = Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0;
  const textSignal = [
    String(event.summary || '').trim(),
    String(event.process || '').trim(),
    String(event.result || '').trim(),
  ].filter(Boolean).join('').length;
  return (evidenceCount * 10) + confidence + Math.min(5, textSignal / 200);
}

function pickPreferredEvent(current: EventNodeDraft, candidate: EventNodeDraft): EventNodeDraft {
  return eventSignalScore(candidate) > eventSignalScore(current) ? candidate : current;
}

function buildEventSemanticAlias(item: EventNodeDraft): string {
  const titleCore = normalizeEventTitleForMerge(item.title || item.summary || '');
  if (!titleCore) return '';
  const normalizedCharacters = normalizeSortedList(item.characterRefs || []).slice(0, 3).join(',');
  const normalizedLocations = normalizeSortedList(item.locationRefs || []).slice(0, 2).join(',');
  const temporalBucket = buildTemporalMergeBucket(item.timeRef || '');
  const numericTokens = extractNumericTokens(`${String(item.title || '')} ${String(item.summary || '')} ${String(item.timeRef || '')}`)
    .join(',');
  if (!normalizedCharacters && !normalizedLocations && temporalBucket === 'na' && !numericTokens) {
    return '';
  }
  return [
    titleCore,
    normalizedCharacters ? `c:${normalizedCharacters}` : '',
    normalizedLocations ? `l:${normalizedLocations}` : '',
    temporalBucket !== 'na' ? `t:${temporalBucket}` : '',
    numericTokens ? `n:${numericTokens}` : '',
  ].filter(Boolean).join('|');
}

function buildSecondaryEventSemanticAlias(item: EventNodeDraft): string {
  const semanticAlias = buildEventSemanticAlias(item);
  if (!semanticAlias) return '';
  const parentEventId = isPlaceholderEventId(item.parentEventId)
    ? ''
    : normalizeId(item.parentEventId || '');
  return parentEventId ? `${parentEventId}|${semanticAlias}` : semanticAlias;
}

function buildEventSemanticKey(item: EventNodeDraft, fallbackKey: string): string {
  const semanticAlias = buildEventSemanticAlias(item);
  if (semanticAlias) return semanticAlias;
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

function primaryMergeKey(item: EventNodeDraft, index: number): string {
  const id = normalizeId(item.id || '');
  if (id && !isPlaceholderEventId(id)) {
    return `id:${id}`;
  }
  return `semantic:${buildEventSemanticKey(item, `primary-${index + 1}`)}`;
}

function secondaryMergeKey(item: EventNodeDraft, index: number): string {
  const id = normalizeId(item.id || '');
  if (id && !isPlaceholderEventId(id)) {
    return `id:${id}`;
  }
  const semanticAlias = buildSecondaryEventSemanticAlias(item);
  if (semanticAlias) return `semantic:${semanticAlias}`;
  const parentEventId = isPlaceholderEventId(item.parentEventId) ? '' : normalizeId(item.parentEventId || '');
  return `semantic:${parentEventId}|${buildEventSemanticKey(item, `secondary-${index + 1}`)}`;
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

function mergeEventsByKey(
  events: EventNodeDraft[],
  keyOf: (event: EventNodeDraft, index: number) => string,
): EventNodeDraft[] {
  const byKey = new Map<string, EventNodeDraft>();
  events.forEach((event, index) => {
    const key = keyOf(event, index);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      return;
    }
    byKey.set(key, pickPreferredEvent(existing, event));
  });
  return Array.from(byKey.values());
}

function dedupeEventsBySemanticAlias(
  events: EventNodeDraft[],
  aliasOf: (event: EventNodeDraft) => string,
): EventNodeDraft[] {
  const aliasToIndex = new Map<string, number>();
  const output: EventNodeDraft[] = [];
  events.forEach((event) => {
    const alias = aliasOf(event);
    if (!alias) {
      output.push(event);
      return;
    }
    const existingIndex = aliasToIndex.get(alias);
    if (typeof existingIndex !== 'number') {
      aliasToIndex.set(alias, output.length);
      output.push(event);
      return;
    }
    output[existingIndex] = pickPreferredEvent(output[existingIndex]!, event);
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
      ? item.locationRefs
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0 && !isPlaceholderEntityName(entry))
      : [],
    characterRefs: Array.isArray(item.characterRefs)
      ? item.characterRefs
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0 && !isPlaceholderEntityName(entry))
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

  const primaryByMergeKey = mergeEventsByKey(primaryRaw, (item, index) => primaryMergeKey(item, index));
  const primary = dedupeEventsBySemanticAlias(primaryByMergeKey, (item) => buildEventSemanticAlias(item));

  const primaryIdSet = new Set(primary.map((item) => item.id));
  const secondaryByMergeKey = mergeEventsByKey(secondaryRaw, (item, index) => secondaryMergeKey(item, index));
  const secondary = dedupeEventsBySemanticAlias(secondaryByMergeKey, (item) => buildSecondaryEventSemanticAlias(item))
    .map((item) => {
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
      .map((item) => ({
        name: String(item.name || '').trim(),
        summary: String(item.summary || item.description || ''),
        significance: clamp01(item.significance, 0.5),
      }))
      .filter((item) => item.name.length > 0 && !isPlaceholderEntityName(item.name)),
    (item) => normalizeId(item.name),
  ).slice(0, 24);
}
