import type { EventNodeDraft } from '../../../contracts.js';
import {
  deriveNeedsEvidence,
  isEvidenceRequiredForEvent,
  normalizeEventHorizon,
} from '../../../services/event-horizon.js';

export function makeEventId(prefix: 'primary' | 'secondary'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => Boolean(item)))];
}

export function toValidation(event: EventNodeDraft) {
  return {
    titleComplete: event.title.trim().length > 0,
    timeRefComplete: event.timeRef.trim().length > 0,
    evidenceComplete: !isEvidenceRequiredForEvent(event) || event.evidenceRefs.length > 0,
  };
}

export function normalizeEvent(value: Partial<EventNodeDraft>, fallbackLevel: 'PRIMARY' | 'SECONDARY'): EventNodeDraft {
  const level = value.level === 'SECONDARY' ? 'SECONDARY' : fallbackLevel;
  const evidenceRefs = Array.isArray(value.evidenceRefs) ? value.evidenceRefs : [];
  const eventHorizon = normalizeEventHorizon(value.eventHorizon, 'PAST');
  const temporalBeforeEventIds = toStringList(value.temporalBeforeEventIds);
  const temporalAfterEventIds = toStringList(value.temporalAfterEventIds);
  const base: EventNodeDraft = {
    id: String(value.id || makeEventId(level === 'PRIMARY' ? 'primary' : 'secondary')),
    ...(Number.isFinite(Number(value.timelineSeq))
      ? { timelineSeq: Math.max(1, Math.trunc(Number(value.timelineSeq))) }
      : {}),
    level,
    eventHorizon,
    parentEventId: typeof value.parentEventId === 'string' && value.parentEventId.trim()
      ? value.parentEventId
      : null,
    title: String(value.title || ''),
    summary: String(value.summary || ''),
    cause: String(value.cause || ''),
    process: String(value.process || ''),
    result: String(value.result || ''),
    timeRef: String(value.timeRef || ''),
    locationRefs: toStringList(value.locationRefs),
    characterRefs: toStringList(value.characterRefs),
    dependsOnEventIds: toStringList(value.dependsOnEventIds),
    ...(temporalBeforeEventIds.length > 0 ? { temporalBeforeEventIds } : {}),
    ...(temporalAfterEventIds.length > 0 ? { temporalAfterEventIds } : {}),
    ...(Number.isFinite(Number(value.temporalConfidence))
      ? { temporalConfidence: Math.max(0, Math.min(1, Number(value.temporalConfidence))) }
      : {}),
    evidenceRefs: evidenceRefs.map((item) => ({
      segmentId: String(item.segmentId || ''),
      offsetStart: Number(item.offsetStart) || 0,
      offsetEnd: Number(item.offsetEnd) || 0,
      excerpt: String(item.excerpt || ''),
      confidence: Number.isFinite(Number(item.confidence))
        ? Math.max(0, Math.min(1, Number(item.confidence)))
        : 0.5,
      sourceType: item.sourceType === 'file' || item.sourceType === 'text' ? item.sourceType : 'chunk',
    })),
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : 0.5,
    needsEvidence: deriveNeedsEvidence({
      level,
      eventHorizon,
      evidenceRefs,
      needsEvidence: value.needsEvidence,
    }),
    editableCause: String(value.editableCause || value.cause || ''),
    editableProcess: String(value.editableProcess || value.process || ''),
    editableResult: String(value.editableResult || value.result || ''),
    validation: undefined,
  };
  return {
    ...base,
    validation: toValidation(base),
  };
}

export function normalizeGraph(input: {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
}): {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
} {
  return {
    primary: (input.primary || []).map((item) => normalizeEvent(item, 'PRIMARY')),
    secondary: (input.secondary || []).map((item) => normalizeEvent(item, 'SECONDARY')),
  };
}

export function moveItemByIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [picked] = next.splice(fromIndex, 1);
  if (picked === undefined) {
    return items;
  }
  next.splice(toIndex, 0, picked);
  return next;
}
