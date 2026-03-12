import { isSyntheticEntityName } from './errors.js';
import type { AccumulatedCharacter, AccumulatedEvent, AccumulatedLocation, AccumulatedRelation, AccumulatedState, AccumulatedTimeline, ChunkExtraction, EntityFreshness, EventNodeDraft, } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
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
function isPlaceholderEventId(value: unknown): boolean {
    const normalized = normalizeId(value);
    if (!normalized)
        return true;
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
        if (seen.has(value))
            return;
        seen.add(value);
        output.push(value);
    });
    return output;
}
function normalizeEventTitleForMerge(value: unknown): string {
    const source = normalizeId(value);
    if (!source)
        return '';
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
        if (seen.has(token))
            return;
        seen.add(token);
        output.push(token);
    });
    return output;
}
function buildTemporalMergeBucket(value: unknown): string {
    const source = normalizeId(value);
    if (!source)
        return 'na';
    const parts: string[] = [];
    if (/前/.test(source) && !/后/.test(source)) {
        parts.push('before');
    }
    else if (/后|之后|以后|后来|次日|翌日|隔日/.test(source)) {
        parts.push('after');
    }
    const durationMatch = source.match(/([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*(年|(?:个)?月|周|天|日|岁)/);
    if (durationMatch) {
        parts.push(`dur:${durationMatch[1]}${durationMatch[2]}`);
    }
    if (source.includes('春'))
        parts.push('spring');
    if (source.includes('夏'))
        parts.push('summer');
    if (source.includes('秋'))
        parts.push('autumn');
    if (source.includes('冬'))
        parts.push('winter');
    if (source.includes('凌晨'))
        parts.push('before-dawn');
    else if (source.includes('清晨') || source.includes('黎明'))
        parts.push('dawn');
    else if (source.includes('早晨') || source.includes('上午'))
        parts.push('morning');
    else if (source.includes('正午') || source.includes('中午'))
        parts.push('noon');
    else if (source.includes('下午'))
        parts.push('afternoon');
    else if (source.includes('傍晚') || source.includes('黄昏'))
        parts.push('evening');
    else if (source.includes('深夜'))
        parts.push('late-night');
    else if (source.includes('夜') || source.includes('晚上'))
        parts.push('night');
    return parts.length > 0 ? parts.join('|') : 'na';
}
function eventSignalScore(event: Pick<EventNodeDraft, 'summary' | 'process' | 'result' | 'confidence' | 'evidenceRefs'>): number {
    const evidenceCount = Array.isArray(event.evidenceRefs) ? event.evidenceRefs.length : 0;
    const confidence = Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0;
    const textSignal = [
        String(event.summary || '').trim(),
        String(event.process || '').trim(),
        String(event.result || '').trim(),
    ].filter(Boolean).join('').length;
    return (evidenceCount * 10) + confidence + Math.min(5, textSignal / 200);
}
function buildEventSemanticAlias(item: EventNodeDraft): string {
    const titleCore = normalizeEventTitleForMerge(item.title || item.summary || '');
    if (!titleCore)
        return '';
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
    if (!semanticAlias)
        return '';
    const parentEventId = isPlaceholderEventId(item.parentEventId)
        ? ''
        : normalizeId(item.parentEventId || '');
    return parentEventId ? `${parentEventId}|${semanticAlias}` : semanticAlias;
}
function buildEventSemanticKey(item: EventNodeDraft, fallbackKey: string): string {
    const semanticAlias = buildEventSemanticAlias(item);
    if (semanticAlias)
        return semanticAlias;
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
function mergeFreshness(left: EntityFreshness, right: EntityFreshness): EntityFreshness {
    return {
        firstSeenChunk: Math.min(left.firstSeenChunk, right.firstSeenChunk),
        lastSeenChunk: Math.max(left.lastSeenChunk, right.lastSeenChunk),
        mentionCount: left.mentionCount + right.mentionCount,
    };
}
function pickPreferredAccumulatedEvent(current: AccumulatedEvent, candidate: AccumulatedEvent): AccumulatedEvent {
    const preferred = eventSignalScore(candidate) > eventSignalScore(current) ? candidate : current;
    return {
        ...preferred,
        _freshness: mergeFreshness(current._freshness, candidate._freshness),
    };
}
function canonicalPair(a: string, b: string): string {
    return [a, b].sort().join('→');
}
function upsertCharacters(existing: AccumulatedCharacter[], incoming: Array<Record<string, unknown>>, chunkIndex: number): AccumulatedCharacter[] {
    const byKey = new Map<string, AccumulatedCharacter>();
    existing.forEach((item) => {
        const key = normalizeId(asRecord(item).name);
        if (key)
            byKey.set(key, item);
    });
    incoming.forEach((item) => {
        const name = String(item.name || '').trim();
        const key = normalizeId(name);
        if (!key || isSyntheticEntityName(name))
            return;
        const prev = byKey.get(key);
        if (prev) {
            byKey.set(key, {
                ...prev,
                ...item,
                name,
                _freshness: bumpFreshness(prev._freshness, chunkIndex),
            });
        }
        else {
            byKey.set(key, { ...item, name, _freshness: makeFreshness(chunkIndex) });
        }
    });
    return Array.from(byKey.values());
}
function upsertLocations(existing: AccumulatedLocation[], incoming: Array<Record<string, unknown>>, chunkIndex: number): AccumulatedLocation[] {
    const byKey = new Map<string, AccumulatedLocation>();
    existing.forEach((item) => {
        const key = normalizeId(asRecord(item).name);
        if (key)
            byKey.set(key, item);
    });
    incoming.forEach((item) => {
        const name = String(item.name || '').trim();
        const key = normalizeId(name);
        if (!key || isSyntheticEntityName(name))
            return;
        const prev = byKey.get(key);
        if (prev) {
            byKey.set(key, {
                ...prev,
                ...item,
                name,
                _freshness: bumpFreshness(prev._freshness, chunkIndex),
            });
        }
        else {
            byKey.set(key, { ...item, name, _freshness: makeFreshness(chunkIndex) });
        }
    });
    return Array.from(byKey.values());
}
function upsertEvents(existing: AccumulatedEvent[], incoming: EventNodeDraft[], chunkIndex: number, kind: 'PRIMARY' | 'SECONDARY'): AccumulatedEvent[] {
    const byKey = new Map<string, AccumulatedEvent>();
    const aliasToKey = new Map<string, string>();
    const aliasOf = (event: EventNodeDraft): string => (kind === 'SECONDARY'
        ? buildSecondaryEventSemanticAlias(event)
        : buildEventSemanticAlias(event));
    existing.forEach((item, index) => {
        const key = resolveEventMergeKey(item, `existing-${index + 1}`);
        if (!key)
            return;
        byKey.set(key, item);
        const semanticAlias = aliasOf(item);
        if (semanticAlias && !aliasToKey.has(semanticAlias)) {
            aliasToKey.set(semanticAlias, key);
        }
    });
    incoming.forEach((item, index) => {
        const mergeKey = resolveEventMergeKey(item, `chunk-${chunkIndex + 1}-event-${index + 1}`);
        if (!mergeKey)
            return;
        const semanticAlias = aliasOf(item);
        const resolvedKey = semanticAlias ? (aliasToKey.get(semanticAlias) || mergeKey) : mergeKey;
        const prev = byKey.get(resolvedKey);
        const incomingAccumulated: AccumulatedEvent = { ...item, _freshness: makeFreshness(chunkIndex) };
        if (prev) {
            byKey.set(resolvedKey, pickPreferredAccumulatedEvent(prev, incomingAccumulated));
        }
        else {
            byKey.set(resolvedKey, incomingAccumulated);
        }
        if (semanticAlias) {
            aliasToKey.set(semanticAlias, resolvedKey);
        }
    });
    return Array.from(byKey.values());
}
function upsertRelations(existing: AccumulatedRelation[], incoming: Array<Record<string, unknown>>, chunkIndex: number): AccumulatedRelation[] {
    const byKey = new Map<string, AccumulatedRelation>();
    existing.forEach((item) => {
        const record = asRecord(item);
        const source = normalizeId(record.source);
        const target = normalizeId(record.target);
        const relation = normalizeId(record.relation);
        const key = `${canonicalPair(source, target)}:${relation}`;
        if (key !== ':')
            byKey.set(key, item);
    });
    incoming.forEach((item) => {
        const source = normalizeId(item.source);
        const target = normalizeId(item.target);
        const relation = normalizeId(item.relation);
        if (!source || !target)
            return;
        const key = `${canonicalPair(source, target)}:${relation}`;
        const prev = byKey.get(key);
        if (prev) {
            byKey.set(key, {
                ...prev,
                ...item,
                _freshness: bumpFreshness(prev._freshness, chunkIndex),
            });
        }
        else {
            byKey.set(key, { ...item, _freshness: makeFreshness(chunkIndex) });
        }
    });
    return Array.from(byKey.values());
}
function upsertTimeline(existing: AccumulatedTimeline[], incoming: Array<Record<string, unknown>>, chunkIndex: number): AccumulatedTimeline[] {
    const byKey = new Map<string, AccumulatedTimeline>();
    existing.forEach((item) => {
        const record = asRecord(item);
        const key = normalizeId(record.id || record.label);
        if (key)
            byKey.set(key, item);
    });
    incoming.forEach((item) => {
        const key = normalizeId(item.id || item.label);
        if (!key)
            return;
        const prev = byKey.get(key);
        if (prev) {
            byKey.set(key, {
                ...prev,
                ...item,
                _freshness: bumpFreshness(prev._freshness, chunkIndex),
            });
        }
        else {
            byKey.set(key, { ...item, _freshness: makeFreshness(chunkIndex) });
        }
    });
    return Array.from(byKey.values());
}
/**
 * Upsert a chunk extraction into the accumulated state (latest wins).
 * Does NOT update lastProcessedChunk or successfulChunks — the caller does that.
 */
export function upsertMergeExtraction(state: AccumulatedState, extraction: ChunkExtraction, chunkIndex: number): AccumulatedState {
    const characters = upsertCharacters(state.characters, extraction.characters.map((item) => asRecord(item)), chunkIndex);
    const locations = upsertLocations(state.locations, extraction.locations.map((item) => asRecord(item)), chunkIndex);
    const primaryEvents = upsertEvents(state.events.primary, extraction.events.primary, chunkIndex, 'PRIMARY');
    const secondaryEvents = upsertEvents(state.events.secondary, extraction.events.secondary, chunkIndex, 'SECONDARY');
    const characterRelations = upsertRelations(state.characterRelations, extraction.characterRelations.map((item) => asRecord(item)), chunkIndex);
    const timeline = upsertTimeline(state.timeline, extraction.timeline.map((item) => asRecord(item)), chunkIndex);
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
    const stripFreshness = <T extends {
        _freshness: EntityFreshness;
    }>(items: T[]): Array<Omit<T, '_freshness'>> => {
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
