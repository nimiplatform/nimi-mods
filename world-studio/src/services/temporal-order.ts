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

type TemporalHint = {
  score: number;
  confidence: number;
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

const ZH_NUM_MAP: Record<string, number> = {
  '零': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
  '十': 10,
};

function parseSimpleZhNumber(text: string): number | null {
  const token = normalizeKey(text);
  if (!token) return null;
  if (token === '半') return 0.5;
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (token === '十') return 10;
  if (token.startsWith('十')) {
    const tail = token.slice(1);
    return 10 + (ZH_NUM_MAP[tail] ?? 0);
  }
  const tenIndex = token.indexOf('十');
  if (tenIndex > 0) {
    const head = token.slice(0, tenIndex);
    const tail = token.slice(tenIndex + 1);
    const headValue = ZH_NUM_MAP[head] ?? NaN;
    const tailValue = tail ? (ZH_NUM_MAP[tail] ?? NaN) : 0;
    if (Number.isFinite(headValue) && Number.isFinite(tailValue)) {
      return (headValue * 10) + tailValue;
    }
  }
  if (token.length === 1 && Number.isFinite(ZH_NUM_MAP[token])) {
    return ZH_NUM_MAP[token] ?? null;
  }
  return null;
}

function toDurationDays(text: string): number | null {
  const source = normalizeKey(text);
  if (!source) return null;
  const patterns: Array<{ regex: RegExp; unitDays: number }> = [
    { regex: /([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*年/g, unitDays: 365 },
    { regex: /([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*(?:个)?月/g, unitDays: 30 },
    { regex: /([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*周/g, unitDays: 7 },
    { regex: /([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*(?:天|日)/g, unitDays: 1 },
  ];
  for (const pattern of patterns) {
    const match = pattern.regex.exec(source);
    pattern.regex.lastIndex = 0;
    if (!match) continue;
    const amount = parseSimpleZhNumber(match[1] || '');
    if (amount == null) continue;
    return amount * pattern.unitDays;
  }
  if (source.includes('大半年')) return 240;
  if (source.includes('半年')) return 182.5;
  if (source.includes('次日') || source.includes('翌日') || source.includes('隔日')) return 1;
  if (source.includes('当日') || source.includes('当天')) return 0;
  return null;
}

function toTimeOfDayBias(text: string): number {
  const source = normalizeKey(text);
  if (!source) return 0;
  if (source.includes('凌晨')) return -0.35;
  if (source.includes('清晨') || source.includes('黎明')) return -0.25;
  if (source.includes('早晨') || source.includes('上午')) return -0.15;
  if (source.includes('正午') || source.includes('中午')) return 0;
  if (source.includes('下午')) return 0.15;
  if (source.includes('傍晚') || source.includes('黄昏')) return 0.35;
  if (source.includes('夜') || source.includes('晚上')) return 0.55;
  if (source.includes('深夜')) return 0.75;
  return 0;
}

function toAgeDays(text: string): number | null {
  const source = normalizeKey(text);
  if (!source) return null;
  const matched = source.match(/([0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十半]+)\s*岁/);
  if (!matched) return null;
  const age = parseSimpleZhNumber(matched[1] || '');
  if (age == null) return null;
  return age * 365;
}

function inferTemporalHint(event: EventNodeDraft): TemporalHint | null {
  const timeRef = normalizeKey(event.timeRef);
  if (!timeRef) return null;
  const durationDays = toDurationDays(timeRef);
  const ageDays = toAgeDays(timeRef);
  const direction = (() => {
    if (/前/.test(timeRef) && !/后/.test(timeRef)) return -1;
    if (/后|之后|以后|后来|次日|翌日|隔日/.test(timeRef)) return 1;
    return 0;
  })();
  const coarseBias = direction === -1
    ? -100000
    : direction === 1
      ? 100000
      : 0;
  if (durationDays == null && ageDays == null && coarseBias === 0 && !/[晨午晚夜日天月年岁]/.test(timeRef)) {
    return null;
  }
  const score = coarseBias
    + (durationDays ?? 0)
    + (ageDays ?? 0)
    + toTimeOfDayBias(timeRef);
  const confidence = durationDays != null || ageDays != null
    ? 1
    : (coarseBias !== 0 ? 0.7 : 0.4);
  return {
    score,
    confidence,
  };
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
  const temporalHintById = new Map<string, TemporalHint | null>();
  byId.forEach((item, id) => {
    temporalHintById.set(id, inferTemporalHint(item.event));
  });
  return (leftId, rightId) => {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left && !right) return leftId.localeCompare(rightId);
    if (!left) return 1;
    if (!right) return -1;
    if (left.event.level !== right.event.level) {
      return left.event.level === 'PRIMARY' ? -1 : 1;
    }
    const leftHint = temporalHintById.get(leftId) || null;
    const rightHint = temporalHintById.get(rightId) || null;
    if (leftHint && rightHint) {
      if (leftHint.score !== rightHint.score) {
        return leftHint.score - rightHint.score;
      }
      if (leftHint.confidence !== rightHint.confidence) {
        return rightHint.confidence - leftHint.confidence;
      }
    } else if (leftHint && !rightHint) {
      return -1;
    } else if (!leftHint && rightHint) {
      return 1;
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
