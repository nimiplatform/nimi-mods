import { asRecord } from "@nimiplatform/sdk/mod";
import type {
  EventNodeDraft,
  TemporalNormalizationSummary,
  WorldStudioKnowledgeGraphDraft,
} from '../../engine/types.js';
import { buildStartTimeOptionsFromEvents, computeTemporalOrder } from '../../services/temporal-order.js';

type TemporalNormalizationResult = {
  graph: WorldStudioKnowledgeGraphDraft;
  summary: TemporalNormalizationSummary;
};

function normalizeKey(value: unknown): string {
  return String(value || '').trim();
}

function hasTemporalSignal(event: EventNodeDraft): boolean {
  return Boolean(
    normalizeKey(event.timeRef)
      || (event.dependsOnEventIds || []).length > 0
      || (event.temporalBeforeEventIds || []).length > 0
      || (event.temporalAfterEventIds || []).length > 0,
  );
}

function rebuildTimeline(primaryEvents: EventNodeDraft[]): Array<Record<string, unknown>> {
  return primaryEvents.map((event, index) => {
    const timeRef = normalizeKey(event.timeRef);
    const title = normalizeKey(event.title) || `Primary Event ${index + 1}`;
    return {
      id: `timeline:${index + 1}`,
      eventId: event.id,
      label: timeRef
        ? `${index + 1}. ${timeRef} · ${title}`
        : `${index + 1}. ${title}`,
      description: normalizeKey(event.summary)
        || normalizeKey(event.process)
        || normalizeKey(event.result)
        || '',
      time: timeRef,
      title,
      weight: Number.isFinite(Number(event.temporalConfidence))
        ? Number(event.temporalConfidence)
        : Number(event.confidence || 0.5),
      timelineSeq: Number(event.timelineSeq || index + 1),
    };
  });
}

function normalizeTemporalEdges(
  event: EventNodeDraft,
  orderIndexMap: Map<string, number>,
): { event: EventNodeDraft; droppedEdges: number } {
  const currentIndex = orderIndexMap.get(event.id);
  if (currentIndex == null) {
    return { event, droppedEdges: 0 };
  }
  let droppedEdges = 0;
  const nextBefore = (event.temporalBeforeEventIds || []).filter((candidateId) => {
    const nextIndex = orderIndexMap.get(candidateId);
    const keep = nextIndex == null || nextIndex > currentIndex;
    if (!keep) droppedEdges += 1;
    return keep;
  });
  const nextAfter = (event.temporalAfterEventIds || []).filter((candidateId) => {
    const nextIndex = orderIndexMap.get(candidateId);
    const keep = nextIndex == null || nextIndex < currentIndex;
    if (!keep) droppedEdges += 1;
    return keep;
  });
  return {
    event: {
      ...event,
      ...(nextBefore.length > 0 ? { temporalBeforeEventIds: nextBefore } : {}),
      ...(nextAfter.length > 0 ? { temporalAfterEventIds: nextAfter } : {}),
      ...((nextBefore.length === 0 && event.temporalBeforeEventIds && event.temporalBeforeEventIds.length > 0)
        ? { temporalBeforeEventIds: undefined }
        : {}),
      ...((nextAfter.length === 0 && event.temporalAfterEventIds && event.temporalAfterEventIds.length > 0)
        ? { temporalAfterEventIds: undefined }
        : {}),
    },
    droppedEdges,
  };
}

export function normalizeTemporalGraph(graph: WorldStudioKnowledgeGraphDraft): TemporalNormalizationResult {
  const order = computeTemporalOrder(graph.events);
  const primaryById = new Map(graph.events.primary.map((event) => [event.id, event] as const));
  const secondaryById = new Map(graph.events.secondary.map((event) => [event.id, event] as const));
  const orderedEvents = order.orderedEventIds
    .map((eventId) => primaryById.get(eventId) || secondaryById.get(eventId))
    .filter((event): event is EventNodeDraft => Boolean(event));
  const orderedIds = new Set(orderedEvents.map((event) => event.id));
  const trailing = [...graph.events.primary, ...graph.events.secondary]
    .filter((event) => !orderedIds.has(event.id));
  const allOrdered = [...orderedEvents, ...trailing];

  let droppedConflictingEdges = 0;
  const normalizedEvents = allOrdered.map((event, index) => {
    const normalized = {
      ...event,
      timelineSeq: index + 1,
    } satisfies EventNodeDraft;
    const edgeResult = normalizeTemporalEdges(normalized, order.eventOrderIndexMap);
    droppedConflictingEdges += edgeResult.droppedEdges;
    return edgeResult.event;
  });

  const nextPrimary = normalizedEvents.filter((event) => event.level === 'PRIMARY');
  const nextSecondary = normalizedEvents.filter((event) => event.level === 'SECONDARY');
  const nextTimeline = rebuildTimeline(nextPrimary);
  const startTimeOptions = buildStartTimeOptionsFromEvents({
    primary: nextPrimary,
    secondary: nextSecondary,
  });

  const reorderedEvents = normalizedEvents.reduce((count, event, index) => {
    const original = [...graph.events.primary, ...graph.events.secondary].find((item) => item.id === event.id);
    return count + ((original && original.timelineSeq !== index + 1) ? 1 : 0);
  }, 0);

  const dedupedPrimaryAnchors = Math.max(0, nextPrimary.filter((event) => hasTemporalSignal(event)).length - startTimeOptions.length);

  return {
    graph: {
      ...graph,
      events: {
        primary: nextPrimary,
        secondary: nextSecondary,
      },
      timeline: nextTimeline.map((item) => asRecord(item)),
    },
    summary: {
      reorderedEvents,
      rewrittenTimelineSeq: normalizedEvents.length,
      rebuiltTimelineCount: nextTimeline.length,
      droppedConflictingEdges,
      dedupedPrimaryAnchors,
      startTimeCandidateCount: startTimeOptions.length,
    },
  };
}
