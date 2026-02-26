import type { EventNodeDraft, Phase1Option } from '../contracts.js';

type EventBuckets = {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
};

type TemporalOrderResult = {
  orderedEventIds: string[];
  orderedPrimaryIds: string[];
  eventOrderIndexMap: Map<string, number>;
  primaryOrderIndexMap: Map<string, number>;
};

const START_TIME_EVENT_ID_PREFIX = 'event:';

type EventWithSourceIndex = {
  event: EventNodeDraft;
  sourceIndex: number;
};

function normalizeKey(value: unknown): string {
  return String(value || '').trim();
}

function clamp01(value: unknown, fallback = 0.5): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const next = normalizeKey(value);
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  });
  return output;
}

function toEventSequence(events: EventBuckets): EventWithSourceIndex[] {
  return [
    ...events.primary.map((event, index) => ({ event, sourceIndex: index })),
    ...events.secondary.map((event, index) => ({ event, sourceIndex: events.primary.length + index })),
  ];
}

function toTemporalPredecessorIds(event: EventNodeDraft): string[] {
  return uniqueStrings([
    ...(Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : []),
    ...(Array.isArray(event.temporalBeforeEventIds) ? event.temporalBeforeEventIds : []),
    ...(event.parentEventId ? [event.parentEventId] : []),
  ]);
}

function toTemporalSuccessorIds(event: EventNodeDraft): string[] {
  return uniqueStrings(Array.isArray(event.temporalAfterEventIds) ? event.temporalAfterEventIds : []);
}

function eventSortComparator(
  byId: Map<string, EventWithSourceIndex>,
): (leftId: string, rightId: string) => number {
  return (leftId, rightId) => {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left && !right) return leftId.localeCompare(rightId);
    if (!left) return 1;
    if (!right) return -1;
    if (left.event.level !== right.event.level) {
      return left.event.level === 'PRIMARY' ? -1 : 1;
    }
    if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex;
    return leftId.localeCompare(rightId);
  };
}

function topologicalOrder(events: EventBuckets): TemporalOrderResult {
  const sequence = toEventSequence(events)
    .filter((item) => normalizeKey(item.event.id).length > 0);
  const byId = new Map<string, EventWithSourceIndex>();
  sequence.forEach((item) => {
    byId.set(item.event.id, item);
  });
  const compare = eventSortComparator(byId);

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const edgeSet = new Set<string>();
  byId.forEach((_item, id) => {
    adjacency.set(id, new Set<string>());
    indegree.set(id, 0);
  });

  const addEdge = (from: string, to: string) => {
    const src = normalizeKey(from);
    const dst = normalizeKey(to);
    if (!src || !dst || src === dst) return;
    if (!byId.has(src) || !byId.has(dst)) return;
    const edgeKey = `${src}->${dst}`;
    if (edgeSet.has(edgeKey)) return;
    edgeSet.add(edgeKey);
    adjacency.get(src)?.add(dst);
    indegree.set(dst, (indegree.get(dst) || 0) + 1);
  };

  byId.forEach(({ event }, id) => {
    toTemporalPredecessorIds(event).forEach((predecessorId) => addEdge(predecessorId, id));
    toTemporalSuccessorIds(event).forEach((successorId) => addEdge(id, successorId));
  });

  const queue = Array.from(byId.keys())
    .filter((id) => (indegree.get(id) || 0) === 0)
    .sort(compare);

  const orderedEventIds: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    orderedEventIds.push(current);
    const outgoing = Array.from(adjacency.get(current) || []).sort(compare);
    outgoing.forEach((nextId) => {
      const nextInDegree = (indegree.get(nextId) || 0) - 1;
      indegree.set(nextId, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(nextId);
        queue.sort(compare);
      }
    });
  }

  if (orderedEventIds.length < byId.size) {
    const remaining = Array.from(byId.keys())
      .filter((id) => !orderedEventIds.includes(id))
      .sort(compare);
    orderedEventIds.push(...remaining);
  }

  const orderedPrimaryIds = orderedEventIds.filter((id) => byId.get(id)?.event.level === 'PRIMARY');
  const eventOrderIndexMap = new Map<string, number>();
  orderedEventIds.forEach((id, index) => {
    eventOrderIndexMap.set(id, index);
  });
  const primaryOrderIndexMap = new Map<string, number>();
  orderedPrimaryIds.forEach((id, index) => {
    primaryOrderIndexMap.set(id, index);
  });

  return {
    orderedEventIds,
    orderedPrimaryIds,
    eventOrderIndexMap,
    primaryOrderIndexMap,
  };
}

export function toStartTimeEventOptionId(eventId: string): string {
  return `${START_TIME_EVENT_ID_PREFIX}${normalizeKey(eventId)}`;
}

export function parseStartTimeEventOptionId(optionId: string): string | null {
  const normalized = normalizeKey(optionId);
  if (!normalized.startsWith(START_TIME_EVENT_ID_PREFIX)) return null;
  const eventId = normalized.slice(START_TIME_EVENT_ID_PREFIX.length).trim();
  return eventId || null;
}

export function buildStartTimeOptionsFromEvents(events: EventBuckets): Phase1Option[] {
  const order = topologicalOrder(events);
  if (order.orderedPrimaryIds.length === 0) return [];
  const primaryById = new Map(events.primary.map((event) => [event.id, event]));
  return order.orderedPrimaryIds
    .map((eventId, index) => {
      const event = primaryById.get(eventId);
      if (!event) return null;
      const timeRef = normalizeKey(event.timeRef);
      const title = normalizeKey(event.title) || `Primary Event ${index + 1}`;
      const label = timeRef
        ? `${index + 1}. ${timeRef} · ${title}`
        : `${index + 1}. ${title}`;
      const description = normalizeKey(event.summary)
        || normalizeKey(event.process)
        || normalizeKey(event.result)
        || '';
      return {
        id: toStartTimeEventOptionId(event.id),
        label,
        description,
        weight: clamp01(event.temporalConfidence, clamp01(event.confidence, 0.5)),
      } satisfies Phase1Option;
    })
    .filter((item): item is Phase1Option => Boolean(item));
}

export function computeTemporalOrder(events: EventBuckets): TemporalOrderResult {
  return topologicalOrder(events);
}

