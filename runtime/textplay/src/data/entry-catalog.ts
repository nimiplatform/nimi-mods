import { TEXTPLAY_DATA_API_WORLD_EVENTS_LIST } from '../contracts.js';
import { TextplayWorldEventListResponseSchema, type TextplayWorldEventRow } from './schemas.js';
import type { TextplayEntryDetail, TextplayEntrySummary } from '../types.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoOrNow(value: unknown): string {
  return toText(value) || new Date().toISOString();
}

function toTimelineSeq(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new TypeError('TEXTPLAY_ENTRY_TIMELINE_SEQ_REQUIRED');
  }
  return numeric;
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function ensureSentence(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (/[。！？.!?]$/.test(normalized)) {
    return normalized;
  }
  const hasCjk = /[\u3400-\u9fff]/.test(normalized);
  return `${normalized}${hasCjk ? '。' : '.'}`;
}

function firstSentence(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  const parts = normalized.split(/[。！？.!?]/).map((item) => item.trim()).filter(Boolean);
  return ensureSentence(parts[0] || normalized);
}

function toEventHorizon(value: unknown): 'PAST' | 'ONGOING' | 'FUTURE' {
  const normalized = toText(value).toUpperCase();
  if (normalized === 'ONGOING') return 'ONGOING';
  if (normalized === 'FUTURE') return 'FUTURE';
  return 'PAST';
}

function buildEntrySummary(event: TextplayWorldEventRow): string {
  return unique([
    toText(event.title),
    toText(event.summary),
  ]).filter(Boolean).join('：') || '风暴将至，更多细节将在开场中展开……';
}

function buildEntryBackdrop(event: TextplayWorldEventRow): string {
  const title = toText(event.title);
  const location = toStringList(event.locationRefs)[0] || '';
  const cause = toText(event.cause);
  const summary = toText(event.summary);
  const process = toText(event.process);
  const timeRef = toText(event.timeRef);
  const lead = firstSentence(cause) || firstSentence(summary) || firstSentence(process);
  if (lead) {
    return lead;
  }
  if (location && timeRef) {
    return `${timeRef}前后，${location}的局势暗流涌动。`;
  }
  if (location) {
    return `${location}的局势暗流涌动。`;
  }
  if (timeRef) {
    return `${timeRef}前后，变局将起。`;
  }
  if (title) {
    return `${title}之前，风暴已近。`;
  }
  return '风暴将至。';
}

function buildEntryHook(horizon: TextplayEntrySummary['eventHorizon']): string {
  if (horizon === 'ONGOING') {
    return '你将从这场风暴尚未彻底定型的临界时刻切入，亲手决定它如何发展。';
  }
  if (horizon === 'FUTURE') {
    return '你将从传闻与预兆仍在酝酿的时刻切入，抢先介入尚未发生的变局。';
  }
  return '你将从目标事件真正发生前的临界时刻切入，亲手塑造之后的走向。';
}

function toEntrySummary(worldId: string, event: TextplayWorldEventRow): TextplayEntrySummary {
  const horizon = toEventHorizon(event.eventHorizon);
  return {
    entryEventId: toText(event.id),
    worldId: toText(worldId) || toText(event.worldId),
    timelineSeq: toTimelineSeq(event.timelineSeq),
    title: toText(event.title) || toText(event.id),
    summary: buildEntrySummary(event),
    entryBackdrop: buildEntryBackdrop(event),
    entryHook: buildEntryHook(horizon),
    participants: unique(toStringList(event.characterRefs)),
    characterRefs: unique(toStringList(event.characterRefs)),
    eventHorizon: horizon,
    entryMode: 'PRE_EVENT',
    updatedAt: toIsoOrNow(event.updatedAt || event.createdAt),
    playable: horizon !== 'FUTURE',
  };
}

function toEntryDetail(worldId: string, event: TextplayWorldEventRow): TextplayEntryDetail {
  const summary = toEntrySummary(worldId, event);
  return {
    ...summary,
    cause: toText(event.cause),
    process: toText(event.process),
    result: toText(event.result),
    timeRef: toText(event.timeRef),
    locationRefs: toStringList(event.locationRefs),
    recommendedSceneId: toStringList(event.locationRefs)[0] || null,
  };
}

async function queryWorldEvents(hookClient: HookClient, worldId: string): Promise<TextplayWorldEventRow[]> {
  const payload = await hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
    query: { worldId },
  });
  const parsed = TextplayWorldEventListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

function sortPrimaryEvents(rows: TextplayWorldEventRow[]): TextplayWorldEventRow[] {
  return rows
    .filter((row) => toText(row.level).toUpperCase() === 'PRIMARY')
    .sort((left, right) => (
      toTimelineSeq(left.timelineSeq) - toTimelineSeq(right.timelineSeq)
      || toText(left.id).localeCompare(toText(right.id))
    ));
}

export async function listPlayableEntries(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayEntrySummary[]> {
  const worldId = toText(input.worldId);
  if (!worldId) {
    return [];
  }
  return sortPrimaryEvents(await queryWorldEvents(input.hookClient, worldId))
    .map((event) => toEntrySummary(worldId, event))
    .filter((entry) => entry.playable);
}

export async function getPlayableEntryDetail(input: {
  hookClient: HookClient;
  worldId: string;
  entryEventId: string;
}): Promise<TextplayEntryDetail | null> {
  const worldId = toText(input.worldId);
  const entryEventId = toText(input.entryEventId);
  if (!worldId || !entryEventId) {
    return null;
  }
  const event = sortPrimaryEvents(await queryWorldEvents(input.hookClient, worldId))
    .find((row) => toText(row.id) === entryEventId);
  if (!event) {
    return null;
  }
  const detail = toEntryDetail(worldId, event);
  return detail.playable ? detail : null;
}
