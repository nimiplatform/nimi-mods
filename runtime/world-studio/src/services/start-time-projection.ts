import type { EventNodeDraft, Phase1Option } from '../contracts.js';
import { deriveNeedsEvidence, normalizeEventHorizon, } from './event-horizon.js';
import { computeTemporalOrder, parseStartTimeEventOptionId } from './temporal-order.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export const START_TIME_PROJECTED_FUTURE_EVENT_KIND = 'world-studio.start-time.future-event';
const START_TIME_PROJECTION_REASON_CODE = {
    START_TIME_NOT_SELECTED: 'START_TIME_NOT_SELECTED',
    WORLD_STUDIO_START_TIME_NO_PRIMARY_EVENTS: 'WORLD_STUDIO_START_TIME_NO_PRIMARY_EVENTS',
    WORLD_STUDIO_START_TIME_EVENT_NOT_FOUND: 'WORLD_STUDIO_START_TIME_EVENT_NOT_FOUND',
    WORLD_STUDIO_START_TIME_ORDER_NOT_FOUND: 'WORLD_STUDIO_START_TIME_ORDER_NOT_FOUND',
} as const;
type EventBuckets = {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
};
type StartTimeProjectionInput = {
    selectedStartTimeId: string;
    startTimeOptions: Phase1Option[];
    events: EventBuckets;
    futureHistoricalEvents: Array<Record<string, unknown>>;
};
export type StartTimeProjectionReasonCode = (typeof START_TIME_PROJECTION_REASON_CODE)[keyof typeof START_TIME_PROJECTION_REASON_CODE];
type StartTimeProjectionResult = {
    applied: boolean;
    reasonCode: StartTimeProjectionReasonCode | null;
    events: EventBuckets;
    futureHistoricalEvents: Array<Record<string, unknown>>;
};
type FutureEventExtraction = {
    projectedFutureEventNodes: EventBuckets;
    preservedNarrativeEntries: Array<Record<string, unknown>>;
};
type RankedEvent = {
    event: EventNodeDraft;
    rank: number;
    index: number;
};
function normalizeKey(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}
const PLACEHOLDER_EVENT_ID_RE = /^(?:evt|event|primary|secondary|main|sub|p|s)[-_:\s]*[a-z]*\d+(?:[-_:\s]*\d+)*$/i;
const PLACEHOLDER_ENTITY_NAME_RE = /^(?:char(?:acter)?|role|persona?|loc(?:ation)?|evt|event|timeline|segment|item|node|人物|角色|地点|事件|时间线)(?:[-_: ]+[a-z0-9]+|\d+)$/i;
function isPlaceholderEventId(value: unknown): boolean {
    const normalized = normalizeKey(value);
    if (!normalized)
        return true;
    return PLACEHOLDER_ENTITY_NAME_RE.test(normalized) || PLACEHOLDER_EVENT_ID_RE.test(normalized);
}
function normalizeSortedList(values: string[]): string[] {
    return values
        .map((value) => normalizeKey(value))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}
function buildEventSemanticKey(event: EventNodeDraft, fallbackKey: string): string {
    const normalizedTitle = normalizeKey(event.title || '');
    const normalizedSummary = normalizeKey(event.summary || '');
    const normalizedTimeRef = normalizeKey(event.timeRef || '');
    const normalizedCharacters = normalizeSortedList(event.characterRefs || []).join(',');
    const normalizedLocations = normalizeSortedList(event.locationRefs || []).join(',');
    const normalizedEvidence = normalizeKey((event.evidenceRefs || [])[0]?.excerpt || '');
    const key = [
        normalizedTitle,
        normalizedSummary,
        normalizedTimeRef,
        normalizedCharacters,
        normalizedLocations,
        normalizedEvidence,
    ].filter(Boolean).join('|');
    return key || fallbackKey;
}
function safeString(value: unknown): string {
    return String(value || '').trim();
}
function safeStringArray(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}
function eventKey(event: EventNodeDraft, index: number): string {
    const id = normalizeKey(event.id);
    if (id && !isPlaceholderEventId(id))
        return `id:${id}`;
    return `semantic:${buildEventSemanticKey(event, normalizeKey(`${event.level}:${event.title}:${event.timeRef}:${event.parentEventId || ''}:${index + 1}`))}`;
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
function normalizeEventNode(value: unknown, fallbackLevel: 'PRIMARY' | 'SECONDARY'): EventNodeDraft | null {
    if (!value || typeof value !== 'object')
        return null;
    const record = asRecord(value);
    const projectionKind = safeString(record.projectionKind);
    const isProjectedFutureEvent = projectionKind === START_TIME_PROJECTED_FUTURE_EVENT_KIND;
    const level = String(record.level || fallbackLevel).toUpperCase() === 'SECONDARY'
        ? 'SECONDARY'
        : 'PRIMARY';
    const eventHorizon = isProjectedFutureEvent
        ? normalizeEventHorizon(record.projectionOriginalEventHorizon, 'PAST')
        : normalizeEventHorizon(record.eventHorizon, 'PAST');
    const fallbackId = `${fallbackLevel.toLowerCase()}:${normalizeKey(record.title || record.timeRef || 'event') || 'event'}`;
    const temporalBeforeEventIds = safeStringArray(record.temporalBeforeEventIds || record.beforeEventIds);
    const temporalAfterEventIds = safeStringArray(record.temporalAfterEventIds || record.afterEventIds);
    const dependsOnEventIds = Array.from(new Set([
        ...safeStringArray(record.dependsOnEventIds),
        ...temporalBeforeEventIds,
    ]));
    const temporalConfidence = Number(record.temporalConfidence);
    const evidenceRefs = Array.isArray(record.evidenceRefs)
        ? record.evidenceRefs
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
            const evidence = asRecord(item);
            return {
                segmentId: safeString(evidence.segmentId),
                offsetStart: Number.isFinite(Number(evidence.offsetStart)) ? Number(evidence.offsetStart) : 0,
                offsetEnd: Number.isFinite(Number(evidence.offsetEnd)) ? Number(evidence.offsetEnd) : 0,
                excerpt: safeString(evidence.excerpt),
                confidence: Number.isFinite(Number(evidence.confidence)) ? Number(evidence.confidence) : 0.5,
                sourceType: 'chunk' as const,
            };
        })
        : [];
    return {
        id: safeString(record.id) || fallbackId,
        ...(Number.isFinite(Number(record.timelineSeq))
            ? { timelineSeq: Math.max(1, Math.trunc(Number(record.timelineSeq))) }
            : {}),
        level,
        eventHorizon,
        parentEventId: safeString(record.parentEventId) || null,
        title: safeString(record.title) || 'Untitled Event',
        summary: safeString(record.summary),
        cause: safeString(record.cause),
        process: safeString(record.process),
        result: safeString(record.result),
        timeRef: safeString(record.timeRef || record.timelineAnchorLabel),
        locationRefs: safeStringArray(record.locationRefs),
        characterRefs: safeStringArray(record.characterRefs),
        dependsOnEventIds,
        ...(temporalBeforeEventIds.length > 0 ? { temporalBeforeEventIds } : {}),
        ...(temporalAfterEventIds.length > 0 ? { temporalAfterEventIds } : {}),
        ...(Number.isFinite(temporalConfidence)
            ? { temporalConfidence: Math.max(0, Math.min(1, temporalConfidence)) }
            : {}),
        evidenceRefs,
        confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0.5,
        needsEvidence: deriveNeedsEvidence({
            level,
            eventHorizon,
            evidenceRefs,
            needsEvidence: record.needsEvidence,
        }),
    };
}
function asProjectedFutureEventRecord(event: EventNodeDraft, selectedStartTimeId: string): Record<string, unknown> {
    const projectionOriginalEventHorizon = normalizeEventHorizon(event.eventHorizon, 'PAST');
    return {
        ...event,
        eventHorizon: 'FUTURE',
        needsEvidence: deriveNeedsEvidence({
            ...event,
            eventHorizon: 'FUTURE',
        }),
        projectionKind: START_TIME_PROJECTED_FUTURE_EVENT_KIND,
        projectionSelectedStartTimeId: selectedStartTimeId,
        projectionOriginalEventHorizon,
    };
}
function extractFutureEventNodes(futureHistoricalEvents: Array<Record<string, unknown>>): FutureEventExtraction {
    const projectedFutureEventNodes: EventBuckets = { primary: [], secondary: [] };
    const preservedNarrativeEntries: Array<Record<string, unknown>> = [];
    (futureHistoricalEvents || []).forEach((item) => {
        const record = asRecord(item);
        const kind = safeString(record.projectionKind);
        const level = String(record.level || '').toUpperCase();
        const isProjectedFutureEvent = kind === START_TIME_PROJECTED_FUTURE_EVENT_KIND;
        if (!isProjectedFutureEvent || (level !== 'PRIMARY' && level !== 'SECONDARY')) {
            preservedNarrativeEntries.push(record);
            return;
        }
        const normalized = normalizeEventNode(record, level === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY');
        if (!normalized) {
            preservedNarrativeEntries.push(record);
            return;
        }
        if (normalized.level === 'SECONDARY') {
            projectedFutureEventNodes.secondary.push(normalized);
        }
        else {
            projectedFutureEventNodes.primary.push(normalized);
        }
    });
    return {
        projectedFutureEventNodes,
        preservedNarrativeEntries,
    };
}
function dedupeEvents(events: EventNodeDraft[]): EventNodeDraft[] {
    const byId = new Map<string, EventNodeDraft>();
    events.forEach((event, index) => {
        const key = eventKey(event, index);
        const existing = byId.get(key);
        if (!existing) {
            byId.set(key, event);
            return;
        }
        byId.set(key, pickPreferredEvent(existing, event));
    });
    return Array.from(byId.values());
}
function sortEventsByRank(events: EventNodeDraft[], resolveRank: (event: EventNodeDraft) => number, sourceOrderMap: Map<string, number>): EventNodeDraft[] {
    const ranked: RankedEvent[] = events.map((event, index) => ({
        event,
        rank: resolveRank(event),
        index: sourceOrderMap.get(eventKey(event, index)) ?? index,
    }));
    ranked.sort((a, b) => {
        if (a.rank !== b.rank)
            return a.rank - b.rank;
        return a.index - b.index;
    });
    return ranked.map((item) => item.event);
}
function resolveSelectedPrimaryEventId(selectedStartTimeId: string, startTimeOptions: Phase1Option[], primaryEvents: EventNodeDraft[]): string | null {
    const directEventId = parseStartTimeEventOptionId(selectedStartTimeId)
        || (primaryEvents.some((item) => item.id === selectedStartTimeId) ? selectedStartTimeId : null);
    if (directEventId && primaryEvents.some((item) => item.id === directEventId)) {
        return directEventId;
    }
    const selectedOption = startTimeOptions.find((item) => item.id === selectedStartTimeId) || null;
    if (!selectedOption)
        return null;
    const normalizedLabel = normalizeKey(selectedOption.label);
    if (!normalizedLabel)
        return null;
    const matched = primaryEvents.find((event) => {
        const title = normalizeKey(event.title);
        const timeRef = normalizeKey(event.timeRef);
        if (title && (normalizedLabel.includes(title) || title.includes(normalizedLabel)))
            return true;
        if (timeRef && (normalizedLabel.includes(timeRef) || timeRef.includes(normalizedLabel)))
            return true;
        return false;
    });
    return matched?.id || null;
}
function projectWithTemporalOrder(input: {
    selectedStartTimeId: string;
    startTimeOptions: Phase1Option[];
    fullPrimary: EventNodeDraft[];
    fullSecondary: EventNodeDraft[];
}): ({
    success: true;
    events: EventBuckets;
} | {
    success: false;
    reasonCode: Exclude<StartTimeProjectionReasonCode, 'START_TIME_NOT_SELECTED'>;
    events: EventBuckets;
}) {
    const fullPrimary = input.fullPrimary;
    const fullSecondary = input.fullSecondary;
    if (fullPrimary.length === 0) {
        return {
            success: false,
            reasonCode: START_TIME_PROJECTION_REASON_CODE.WORLD_STUDIO_START_TIME_NO_PRIMARY_EVENTS,
            events: { primary: fullPrimary, secondary: fullSecondary },
        };
    }
    const selectedPrimaryId = resolveSelectedPrimaryEventId(input.selectedStartTimeId, input.startTimeOptions, fullPrimary);
    if (!selectedPrimaryId) {
        return {
            success: false,
            reasonCode: START_TIME_PROJECTION_REASON_CODE.WORLD_STUDIO_START_TIME_EVENT_NOT_FOUND,
            events: { primary: fullPrimary, secondary: fullSecondary },
        };
    }
    const temporalOrder = computeTemporalOrder({
        primary: fullPrimary,
        secondary: fullSecondary,
    });
    const selectedOrderIndex = temporalOrder.eventOrderIndexMap.get(selectedPrimaryId);
    if (typeof selectedOrderIndex !== 'number') {
        return {
            success: false,
            reasonCode: START_TIME_PROJECTION_REASON_CODE.WORLD_STUDIO_START_TIME_ORDER_NOT_FOUND,
            events: { primary: fullPrimary, secondary: fullSecondary },
        };
    }
    const sourceOrderMap = new Map<string, number>();
    [...fullPrimary, ...fullSecondary].forEach((event, index) => {
        sourceOrderMap.set(eventKey(event, index), index);
    });
    const rankOf = (event: EventNodeDraft): number => (temporalOrder.eventOrderIndexMap.get(event.id) ?? Number.MAX_SAFE_INTEGER);
    const futurePrimary = fullPrimary.filter((event) => rankOf(event) > selectedOrderIndex);
    const currentPrimary = fullPrimary.filter((event) => rankOf(event) <= selectedOrderIndex);
    const currentPrimaryIdSet = new Set<string>(currentPrimary.map((event) => event.id));
    const futureEventIdSet = new Set<string>(futurePrimary.map((event) => event.id));
    let changed = true;
    while (changed) {
        changed = false;
        fullSecondary.forEach((event) => {
            if (futureEventIdSet.has(event.id))
                return;
            const rankBeyondStart = rankOf(event) > selectedOrderIndex;
            const parentInFuture = Boolean(event.parentEventId && futureEventIdSet.has(event.parentEventId));
            const dependencyInFuture = (event.dependsOnEventIds || []).some((depId) => futureEventIdSet.has(depId));
            const parentInCurrent = Boolean(event.parentEventId && currentPrimaryIdSet.has(event.parentEventId));
            const dependencyInCurrent = (event.dependsOnEventIds || []).some((depId) => currentPrimaryIdSet.has(depId));
            const hasRelationalAnchor = Boolean(event.parentEventId) || (event.dependsOnEventIds || []).length > 0;
            const shouldFallbackToRank = !hasRelationalAnchor && !parentInCurrent && !dependencyInCurrent;
            if (parentInFuture || dependencyInFuture || (shouldFallbackToRank && rankBeyondStart)) {
                futureEventIdSet.add(event.id);
                changed = true;
            }
        });
    }
    const futureSecondary = fullSecondary.filter((event) => futureEventIdSet.has(event.id));
    const currentSecondary = fullSecondary.filter((event) => !futureEventIdSet.has(event.id));
    return {
        success: true,
        events: {
            primary: sortEventsByRank(currentPrimary, rankOf, sourceOrderMap),
            secondary: sortEventsByRank(currentSecondary, rankOf, sourceOrderMap),
        },
    };
}
export function projectEventsForSelectedStartTime(input: StartTimeProjectionInput): StartTimeProjectionResult {
    const selectedStartTimeId = safeString(input.selectedStartTimeId);
    const futureExtraction = extractFutureEventNodes(input.futureHistoricalEvents);
    const fullPrimary = dedupeEvents([
        ...input.events.primary,
        ...futureExtraction.projectedFutureEventNodes.primary,
    ]);
    const fullSecondary = dedupeEvents([
        ...input.events.secondary,
        ...futureExtraction.projectedFutureEventNodes.secondary,
    ]);
    if (!selectedStartTimeId) {
        return {
            applied: false,
            reasonCode: START_TIME_PROJECTION_REASON_CODE.START_TIME_NOT_SELECTED,
            events: {
                primary: fullPrimary,
                secondary: fullSecondary,
            },
            futureHistoricalEvents: futureExtraction.preservedNarrativeEntries,
        };
    }
    const temporalProjection = projectWithTemporalOrder({
        selectedStartTimeId,
        startTimeOptions: input.startTimeOptions,
        fullPrimary,
        fullSecondary,
    });
    let projectedEvents = temporalProjection.events;
    let futureEventsForProjection: EventNodeDraft[] = [];
    if (temporalProjection.success) {
        const projectedCurrentIdSet = new Set([
            ...projectedEvents.primary.map((event) => event.id),
            ...projectedEvents.secondary.map((event) => event.id),
        ]);
        futureEventsForProjection = [
            ...fullPrimary,
            ...fullSecondary,
        ].filter((event) => !projectedCurrentIdSet.has(event.id));
    }
    else {
        return {
            applied: false,
            reasonCode: temporalProjection.reasonCode,
            events: {
                primary: fullPrimary,
                secondary: fullSecondary,
            },
            futureHistoricalEvents: futureExtraction.preservedNarrativeEntries,
        };
    }
    const projectedFutureEvents = futureEventsForProjection
        .map((event) => asProjectedFutureEventRecord(event, selectedStartTimeId));
    return {
        applied: true,
        reasonCode: null,
        events: projectedEvents,
        futureHistoricalEvents: [
            ...futureExtraction.preservedNarrativeEntries,
            ...projectedFutureEvents,
        ],
    };
}
