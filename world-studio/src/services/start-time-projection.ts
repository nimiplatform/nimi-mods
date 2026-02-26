import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type { EventNodeDraft, Phase1Option } from '../contracts.js';
import { computeTemporalOrder, parseStartTimeEventOptionId } from './temporal-order.js';

export const START_TIME_PROJECTED_FUTURE_EVENT_KIND = 'world-studio.start-time.future-event';

type EventBuckets = {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
};

type StartTimeProjectionInput = {
  selectedStartTimeId: string;
  startTimeOptions: Phase1Option[];
  timeline: Array<Record<string, unknown>>;
  events: EventBuckets;
  futureHistoricalEvents: Array<Record<string, unknown>>;
};

type StartTimeProjectionResult = {
  events: EventBuckets;
  futureHistoricalEvents: Array<Record<string, unknown>>;
};

type TimelineNode = {
  id: string;
  label: string;
  time: string;
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

function safeString(value: unknown): string {
  return String(value || '').trim();
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function eventKey(event: EventNodeDraft): string {
  const id = normalizeKey(event.id);
  if (id) return id;
  return normalizeKey(`${event.level}:${event.title}:${event.timeRef}:${event.parentEventId || ''}`);
}

function buildTimelineNodes(
  startTimeOptions: Phase1Option[],
  timeline: Array<Record<string, unknown>>,
): TimelineNode[] {
  if (Array.isArray(startTimeOptions) && startTimeOptions.length > 0) {
    return startTimeOptions.map((item) => ({
      id: safeString(item.id),
      label: safeString(item.label),
      time: '',
    }));
  }
  return (timeline || []).map((item, index) => {
    const record = asRecord(item);
    return {
      id: safeString(record.id) || `timeline:${index + 1}`,
      label: safeString(record.label),
      time: safeString(record.time),
    };
  });
}

function buildTimelineIndexMap(nodes: TimelineNode[]): Map<string, number> {
  const indexMap = new Map<string, number>();
  nodes.forEach((node, index) => {
    const keys = [normalizeKey(node.id), normalizeKey(node.label), normalizeKey(node.time)];
    keys.forEach((key) => {
      if (key && !indexMap.has(key)) {
        indexMap.set(key, index);
      }
    });
  });
  return indexMap;
}

function resolveEventTimelineIndex(
  event: EventNodeDraft,
  indexMap: Map<string, number>,
  nodes: TimelineNode[],
): number | null {
  const timeRef = safeString(event.timeRef);
  if (!timeRef) return null;
  const normalized = normalizeKey(timeRef);
  if (!normalized) return null;

  const direct = indexMap.get(normalized);
  if (typeof direct === 'number') return direct;

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const candidates = [normalizeKey(node.label), normalizeKey(node.time)];
    for (const candidate of candidates) {
      if (!candidate || candidate.length < 2) continue;
      if (normalized.includes(candidate) || candidate.includes(normalized)) {
        return i;
      }
    }
  }
  return null;
}

function normalizeEventNode(value: unknown, fallbackLevel: 'PRIMARY' | 'SECONDARY'): EventNodeDraft | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const level = String(record.level || fallbackLevel).toUpperCase() === 'SECONDARY'
    ? 'SECONDARY'
    : 'PRIMARY';
  const fallbackId = `${fallbackLevel.toLowerCase()}:${normalizeKey(record.title || record.timeRef || 'event') || 'event'}`;
  const temporalBeforeEventIds = safeStringArray(record.temporalBeforeEventIds || record.beforeEventIds);
  const temporalAfterEventIds = safeStringArray(record.temporalAfterEventIds || record.afterEventIds);
  const dependsOnEventIds = Array.from(new Set([
    ...safeStringArray(record.dependsOnEventIds),
    ...temporalBeforeEventIds,
  ]));
  const temporalConfidence = Number(record.temporalConfidence);

  return {
    id: safeString(record.id) || fallbackId,
    level,
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
    evidenceRefs: Array.isArray(record.evidenceRefs)
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
      : [],
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0.5,
    needsEvidence: Boolean(record.needsEvidence),
  };
}

function asProjectedFutureEventRecord(event: EventNodeDraft, selectedStartTimeId: string): Record<string, unknown> {
  return {
    ...event,
    projectionKind: START_TIME_PROJECTED_FUTURE_EVENT_KIND,
    projectionSelectedStartTimeId: selectedStartTimeId,
  };
}

function extractFutureEventNodes(
  futureHistoricalEvents: Array<Record<string, unknown>>,
): FutureEventExtraction {
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
    } else {
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
  events.forEach((event) => {
    byId.set(eventKey(event), event);
  });
  return Array.from(byId.values());
}

function sortEventsByRank(
  events: EventNodeDraft[],
  resolveRank: (event: EventNodeDraft) => number,
  sourceOrderMap: Map<string, number>,
): EventNodeDraft[] {
  const ranked: RankedEvent[] = events.map((event, index) => ({
    event,
    rank: resolveRank(event),
    index: sourceOrderMap.get(eventKey(event)) ?? index,
  }));
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.index - b.index;
  });
  return ranked.map((item) => item.event);
}

function resolveSelectedPrimaryEventId(
  selectedStartTimeId: string,
  startTimeOptions: Phase1Option[],
  primaryEvents: EventNodeDraft[],
): string | null {
  const directEventId = parseStartTimeEventOptionId(selectedStartTimeId)
    || (primaryEvents.some((item) => item.id === selectedStartTimeId) ? selectedStartTimeId : null);
  if (directEventId && primaryEvents.some((item) => item.id === directEventId)) {
    return directEventId;
  }

  const selectedOption = startTimeOptions.find((item) => item.id === selectedStartTimeId) || null;
  if (!selectedOption) return null;
  const normalizedLabel = normalizeKey(selectedOption.label);
  if (!normalizedLabel) return null;
  const matched = primaryEvents.find((event) => {
    const title = normalizeKey(event.title);
    const timeRef = normalizeKey(event.timeRef);
    if (title && (normalizedLabel.includes(title) || title.includes(normalizedLabel))) return true;
    if (timeRef && (normalizedLabel.includes(timeRef) || timeRef.includes(normalizedLabel))) return true;
    return false;
  });
  return matched?.id || null;
}

function projectWithTemporalOrder(input: {
  selectedStartTimeId: string;
  startTimeOptions: Phase1Option[];
  fullPrimary: EventNodeDraft[];
  fullSecondary: EventNodeDraft[];
}): { success: boolean; events: EventBuckets } {
  const fullPrimary = input.fullPrimary;
  const fullSecondary = input.fullSecondary;
  if (fullPrimary.length === 0) {
    return {
      success: false,
      events: { primary: fullPrimary, secondary: fullSecondary },
    };
  }

  const selectedPrimaryId = resolveSelectedPrimaryEventId(
    input.selectedStartTimeId,
    input.startTimeOptions,
    fullPrimary,
  );
  if (!selectedPrimaryId) {
    return {
      success: false,
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
      events: { primary: fullPrimary, secondary: fullSecondary },
    };
  }

  const sourceOrderMap = new Map<string, number>();
  [...fullPrimary, ...fullSecondary].forEach((event, index) => {
    sourceOrderMap.set(eventKey(event), index);
  });

  const rankOf = (event: EventNodeDraft): number => (
    temporalOrder.eventOrderIndexMap.get(event.id) ?? Number.MAX_SAFE_INTEGER
  );

  const futurePrimary = fullPrimary.filter((event) => rankOf(event) > selectedOrderIndex);
  const currentPrimary = fullPrimary.filter((event) => rankOf(event) <= selectedOrderIndex);

  const futureEventIdSet = new Set<string>(futurePrimary.map((event) => event.id));
  let changed = true;
  while (changed) {
    changed = false;
    fullSecondary.forEach((event) => {
      if (futureEventIdSet.has(event.id)) return;
      const rankBeyondStart = rankOf(event) > selectedOrderIndex;
      const parentInFuture = Boolean(event.parentEventId && futureEventIdSet.has(event.parentEventId));
      const dependencyInFuture = (event.dependsOnEventIds || []).some((depId) => futureEventIdSet.has(depId));
      if (rankBeyondStart || parentInFuture || dependencyInFuture) {
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

function projectWithLegacyTimeline(input: {
  selectedStartTimeId: string;
  startTimeOptions: Phase1Option[];
  timeline: Array<Record<string, unknown>>;
  fullPrimary: EventNodeDraft[];
  fullSecondary: EventNodeDraft[];
}): { success: boolean; events: EventBuckets; futurePrimary: EventNodeDraft[]; futureSecondary: EventNodeDraft[] } {
  const timelineNodes = buildTimelineNodes(input.startTimeOptions, input.timeline);
  const timelineIndexMap = buildTimelineIndexMap(timelineNodes);
  const selectedIndex = input.selectedStartTimeId
    ? timelineNodes.findIndex((node) => node.id === input.selectedStartTimeId)
    : -1;
  if (selectedIndex < 0) {
    return {
      success: false,
      events: { primary: input.fullPrimary, secondary: input.fullSecondary },
      futurePrimary: [],
      futureSecondary: [],
    };
  }

  const sourceOrderMap = new Map<string, number>();
  [...input.fullPrimary, ...input.fullSecondary].forEach((event, index) => {
    sourceOrderMap.set(eventKey(event), index);
  });

  const rankOf = (event: EventNodeDraft): number => {
    const rank = resolveEventTimelineIndex(event, timelineIndexMap, timelineNodes);
    return typeof rank === 'number' ? rank : Number.MAX_SAFE_INTEGER;
  };

  const futurePrimary = input.fullPrimary.filter((event) => {
    const rank = resolveEventTimelineIndex(event, timelineIndexMap, timelineNodes);
    return typeof rank === 'number' && rank > selectedIndex;
  });
  const currentPrimary = input.fullPrimary.filter((event) => !futurePrimary.includes(event));

  const futurePrimaryIdSet = new Set(futurePrimary.map((event) => event.id));
  const futureSecondary = input.fullSecondary.filter((event) => {
    const rank = resolveEventTimelineIndex(event, timelineIndexMap, timelineNodes);
    const parentInFuture = Boolean(event.parentEventId && futurePrimaryIdSet.has(event.parentEventId));
    const dependencyInFuture = (event.dependsOnEventIds || []).some((depId) => futurePrimaryIdSet.has(depId));
    return parentInFuture || dependencyInFuture || (typeof rank === 'number' && rank > selectedIndex);
  });
  const currentSecondary = input.fullSecondary.filter((event) => !futureSecondary.includes(event));

  return {
    success: true,
    events: {
      primary: sortEventsByRank(currentPrimary, rankOf, sourceOrderMap),
      secondary: sortEventsByRank(currentSecondary, rankOf, sourceOrderMap),
    },
    futurePrimary: sortEventsByRank(futurePrimary, rankOf, sourceOrderMap),
    futureSecondary: sortEventsByRank(futureSecondary, rankOf, sourceOrderMap),
  };
}

export function projectEventsForSelectedStartTime(
  input: StartTimeProjectionInput,
): StartTimeProjectionResult {
  const selectedStartTimeId = safeString(input.selectedStartTimeId);

  const futureExtraction = extractFutureEventNodes(input.futureHistoricalEvents);
  const fullPrimary = dedupeEvents([
    ...futureExtraction.projectedFutureEventNodes.primary,
    ...input.events.primary,
  ]);
  const fullSecondary = dedupeEvents([
    ...futureExtraction.projectedFutureEventNodes.secondary,
    ...input.events.secondary,
  ]);

  if (!selectedStartTimeId) {
    return {
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
  } else {
    const legacyProjection = projectWithLegacyTimeline({
      selectedStartTimeId,
      startTimeOptions: input.startTimeOptions,
      timeline: input.timeline,
      fullPrimary,
      fullSecondary,
    });
    if (!legacyProjection.success) {
      return {
        events: {
          primary: fullPrimary,
          secondary: fullSecondary,
        },
        futureHistoricalEvents: futureExtraction.preservedNarrativeEntries,
      };
    }
    projectedEvents = legacyProjection.events;
    futureEventsForProjection = [
      ...legacyProjection.futurePrimary,
      ...legacyProjection.futureSecondary,
    ];
  }

  const projectedFutureEvents = futureEventsForProjection
    .map((event) => asProjectedFutureEventRecord(event, selectedStartTimeId));

  return {
    events: projectedEvents,
    futureHistoricalEvents: [
      ...futureExtraction.preservedNarrativeEntries,
      ...projectedFutureEvents,
    ],
  };
}
