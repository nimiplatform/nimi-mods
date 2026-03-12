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

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function toEventHorizon(value: unknown): 'PAST' | 'ONGOING' | 'FUTURE' {
  const normalized = toText(value).toUpperCase();
  if (normalized === 'ONGOING') return 'ONGOING';
  if (normalized === 'FUTURE') return 'FUTURE';
  return 'PAST';
}

function buildEntrySummary(event: TextplayWorldEventRow): string {
  const teaser = unique([
    toText(event.cause),
    toText(event.process),
    toText(event.summary),
  ]).filter(Boolean).slice(0, 2).join('；');
  return teaser || '风暴将至，更多细节将在开场中展开……';
}

function buildMaterialSummary(event: TextplayWorldEventRow, horizon: TextplayEntrySummary['eventHorizon']): string {
  const title = toText(event.title) || toText(event.id) || '关键事件';
  const cause = toText(event.cause);
  const process = toText(event.process);
  const summary = toText(event.summary);
  const timeRef = toText(event.timeRef);
  return [
    `目标事件：${title}`,
    cause ? `导火索：${cause}` : '',
    process ? `关键局势：${process}` : '',
    summary ? `原剧情素材：${summary}` : '',
    timeRef ? `时间锚点：${timeRef}` : '',
    `玩家入口：从该事件发生前的临界阶段切入（canonical horizon=${horizon} 仅作素材参考）。`,
  ].filter(Boolean).join('；');
}

function toEntrySummary(worldId: string, event: TextplayWorldEventRow): TextplayEntrySummary {
  const horizon = toEventHorizon(event.eventHorizon);
  return {
    entryEventId: toText(event.id),
    worldId: toText(worldId) || toText(event.worldId),
    title: toText(event.title) || toText(event.id),
    summary: buildEntrySummary(event),
    materialSummary: buildMaterialSummary(event, horizon),
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
      toIsoOrNow(right.updatedAt || right.createdAt).localeCompare(toIsoOrNow(left.updatedAt || left.createdAt))
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
