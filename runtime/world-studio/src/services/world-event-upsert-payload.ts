import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type { EventNodeDraft } from '../contracts.js';
import {
  deriveNeedsEvidence,
  normalizeEventHorizon,
} from './event-horizon.js';

type WorldEventEvidenceRefPayload = {
  segmentId: string;
  offsetStart: number;
  offsetEnd: number;
  excerpt: string;
  confidence?: number;
  sourceType?: string;
};

export type WorldEventUpsertPayload = {
  id?: string;
  level: 'PRIMARY' | 'SECONDARY';
  eventHorizon?: 'PAST' | 'ONGOING' | 'FUTURE';
  parentEventId?: string;
  title: string;
  summary?: string;
  cause?: string;
  process?: string;
  result?: string;
  timeRef?: string;
  locationRefs?: string[];
  characterRefs?: string[];
  dependsOnEventIds?: string[];
  evidenceRefs?: WorldEventEvidenceRefPayload[];
  confidence?: number;
  needsEvidence?: boolean;
};

function toOptionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toUniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((item) => {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });
  return output;
}

function normalizeEventLevel(value: unknown): 'PRIMARY' | 'SECONDARY' {
  return String(value || '').trim().toUpperCase() === 'SECONDARY'
    ? 'SECONDARY'
    : 'PRIMARY';
}

function normalizeEvidenceRefs(value: unknown): WorldEventEvidenceRefPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const record = asRecord(item);
      const segmentId = toOptionalString(record.segmentId) || '';
      const excerpt = toOptionalString(record.excerpt) || '';
      if (!segmentId || !excerpt) return null;
      const normalized: WorldEventEvidenceRefPayload = {
        segmentId,
        offsetStart: Number.isFinite(Number(record.offsetStart)) ? Number(record.offsetStart) : 0,
        offsetEnd: Number.isFinite(Number(record.offsetEnd)) ? Number(record.offsetEnd) : 0,
        excerpt,
      };
      if (Number.isFinite(Number(record.confidence))) {
        normalized.confidence = clamp01(Number(record.confidence));
      }
      const sourceType = toOptionalString(record.sourceType);
      if (sourceType) normalized.sourceType = sourceType;
      return normalized;
    })
    .filter((item): item is WorldEventEvidenceRefPayload => Boolean(item));
}

export function toWorldEventUpsertPayload(event: EventNodeDraft): WorldEventUpsertPayload {
  const record = asRecord(event);
  const id = toOptionalString(record.id);
  const level = normalizeEventLevel(record.level);
  const eventHorizon = normalizeEventHorizon(record.eventHorizon, 'PAST');
  const title = toOptionalString(record.title) || 'Untitled Event';
  const parentEventId = level === 'SECONDARY'
    ? toOptionalString(record.parentEventId)
    : null;

  const summary = toOptionalString(record.summary);
  const cause = toOptionalString(record.cause);
  const process = toOptionalString(record.process);
  const result = toOptionalString(record.result);
  const timeRef = toOptionalString(record.timeRef);
  const locationRefs = toUniqueStringArray(record.locationRefs);
  const characterRefs = toUniqueStringArray(record.characterRefs);
  const temporalBeforeEventIds = toUniqueStringArray(record.temporalBeforeEventIds);
  const dependsOnEventIds = Array.from(new Set([
    ...toUniqueStringArray(record.dependsOnEventIds),
    ...temporalBeforeEventIds,
  ]))
    .filter((depId) => depId !== id);
  const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs);
  const confidence = Number(record.confidence);

  return {
    ...(id ? { id } : {}),
    level,
    eventHorizon,
    ...(parentEventId ? { parentEventId } : {}),
    title,
    ...(summary ? { summary } : {}),
    ...(cause ? { cause } : {}),
    ...(process ? { process } : {}),
    ...(result ? { result } : {}),
    ...(timeRef ? { timeRef } : {}),
    ...(locationRefs.length > 0 ? { locationRefs } : {}),
    ...(characterRefs.length > 0 ? { characterRefs } : {}),
    ...(dependsOnEventIds.length > 0 ? { dependsOnEventIds } : {}),
    ...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
    ...(Number.isFinite(confidence) ? { confidence: clamp01(confidence) } : {}),
    needsEvidence: deriveNeedsEvidence({
      level,
      eventHorizon,
      evidenceRefs,
      needsEvidence: record.needsEvidence,
    }),
  };
}

export function toWorldEventUpsertPayloadList(events: EventNodeDraft[]): WorldEventUpsertPayload[] {
  return (events || []).map((item) => toWorldEventUpsertPayload(item));
}
