import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { NarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
} from '../contracts.js';
import {
  NarrativeTurnLatestLookupRequestSchema,
  NarrativeTurnLatestLookupResponseSchema,
  TextplayMemoryRecallResponseSchema,
  TextplayWorldEventListResponseSchema,
  TextplayWorldLorebookListResponseSchema,
  TextplayWorldNarrativeContextListResponseSchema,
  TextplayWorldSceneListResponseSchema,
  type TextplayMemoryRecallResponse,
  type TextplayWorldEventRow,
  type TextplayWorldLorebookRow,
  type TextplayWorldNarrativeContextRow,
  type TextplayWorldSceneRow,
} from './schemas.js';
import type {
  TextplayStoryDetail,
  TextplayStorySummary,
  TextplayStartupPackage,
  TextplayStartupPolicy,
} from '../types.js';
import { hashString } from '../utils/hash.js';

const STARTUP_SOURCE = 'textplay:events+scenes+contexts+lorebooks+memory+narrative.turn.latest';
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,}$/;

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoOrNow(value: unknown): string {
  const text = toText(value);
  if (!text) {
    return new Date().toISOString();
  }
  return text;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function toStoryId(worldId: string, eventId: string): string {
  return `story.${normalizeKey(worldId)}.${normalizeKey(eventId)}`;
}

function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
}

function toEventHorizon(value: unknown): 'PAST' | 'ONGOING' | 'FUTURE' {
  const upper = toText(value).toUpperCase();
  if (upper === 'ONGOING') {
    return 'ONGOING';
  }
  if (upper === 'FUTURE') {
    return 'FUTURE';
  }
  return 'PAST';
}

function pickPrimaryAgentId(input: {
  runtimeAgentId?: string;
  characterRefs: string[];
}): string {
  const runtimeAgentId = toText(input.runtimeAgentId);
  if (isEntityId(runtimeAgentId)) {
    return runtimeAgentId;
  }
  const candidate = input.characterRefs.find((item) => isEntityId(toText(item)));
  return candidate ? toText(candidate) : '';
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreLorebook(input: {
  lorebook: TextplayWorldLorebookRow;
  detail: TextplayStoryDetail;
}): number {
  const title = toText(input.detail.title);
  const summary = toText(input.detail.summary);
  const tokens = unique([...tokenize(title), ...tokenize(summary)]);

  const loreKey = toText(input.lorebook.key).toLowerCase();
  const loreName = toText(input.lorebook.name).toLowerCase();
  const loreContent = toText(input.lorebook.content).toLowerCase();
  const loreKeywords = toStringList(input.lorebook.keywords).map((item) => item.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (loreKey.includes(token)) score += 3;
    if (loreName.includes(token)) score += 2;
    if (loreContent.includes(token)) score += 1;
    if (loreKeywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
      score += 2;
    }
  }
  return score;
}

function scoreScene(input: {
  scene: TextplayWorldSceneRow;
  detail: TextplayStoryDetail;
}): number {
  const tokens = unique([
    ...tokenize(toText(input.detail.title)),
    ...tokenize(toText(input.detail.summary)),
    ...input.detail.locationRefs.map((item) => item.toLowerCase()),
  ]);
  const sceneId = toText(input.scene.id).toLowerCase();
  const sceneName = toText(input.scene.name).toLowerCase();
  const sceneDescription = toText(input.scene.description).toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (sceneId.includes(token)) score += 2;
    if (sceneName.includes(token)) score += 3;
    if (sceneDescription.includes(token)) score += 1;
  }
  return score;
}

function buildPreEventSummary(event: TextplayWorldEventRow): string {
  const title = toText(event.title) || toText(event.id) || '关键事件';
  const cause = toText(event.cause);
  const process = toText(event.process);
  const summary = toText(event.summary);
  const timeRef = toText(event.timeRef);

  const lines = [
    `目标事件：${title}（尚未发生）`,
    cause ? `导火索：${cause}` : '',
    process ? `已知态势：${process}` : '',
    timeRef ? `当前时点：${timeRef}` : '',
    (!cause && !process && summary) ? `背景线索：${summary}` : '',
  ].filter((item): item is string => Boolean(item));

  if (lines.length === 0) {
    return '目标事件即将发生，你正处于事件爆发前的关键窗口。';
  }
  return lines.join('；');
}

function extractMemoryText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const row = value as Record<string, unknown>;
  return (
    toText(row.content)
    || toText(row.summary)
    || toText(row.text)
    || toText(row.value)
    || toText(row.title)
  );
}

function toMemoryTextList(payload: TextplayMemoryRecallResponse): string[] {
  const values: unknown[] = [];
  if (Array.isArray(payload.items)) {
    values.push(...payload.items);
  }
  if (Array.isArray(payload.core)) {
    values.push(...payload.core);
  }
  if (Array.isArray(payload.e2e)) {
    values.push(...payload.e2e);
  }
  return unique(values.map(extractMemoryText).filter(Boolean)).slice(0, 8);
}

function sortPrimaryEvents(rows: TextplayWorldEventRow[]): TextplayWorldEventRow[] {
  const picked = rows.filter((row) => toText(row.level).toUpperCase() === 'PRIMARY');
  return picked.sort((left, right) => {
    const leftTs = toText(left.updatedAt) || toText(left.createdAt);
    const rightTs = toText(right.updatedAt) || toText(right.createdAt);
    const dateOrder = rightTs.localeCompare(leftTs);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    return toText(left.id).localeCompare(toText(right.id));
  });
}

function toStorySummary(input: {
  worldId: string;
  event: TextplayWorldEventRow;
  runtimeAgentId?: string;
}): TextplayStorySummary {
  const worldId = toText(input.worldId) || toText(input.event.worldId);
  const eventId = toText(input.event.id);
  const participants = unique(toStringList(input.event.characterRefs));
  const primaryAgentId = pickPrimaryAgentId({
    runtimeAgentId: input.runtimeAgentId,
    characterRefs: participants,
  });

  const horizon = toEventHorizon(input.event.eventHorizon);
  const playableHorizon: TextplayStorySummary['eventHorizon'] = horizon === 'PAST' ? 'FUTURE' : horizon;

  return {
    storyId: toStoryId(worldId, eventId),
    worldId,
    entryEventId: eventId,
    title: toText(input.event.title) || eventId,
    summary: buildPreEventSummary(input.event),
    primaryAgentId,
    participants: unique(primaryAgentId ? [primaryAgentId, ...participants] : participants),
    eventHorizon: playableHorizon,
    updatedAt: toIsoOrNow(input.event.updatedAt || input.event.createdAt),
    playable: true,
    agentBindingMissing: !primaryAgentId,
  };
}

function toStoryDetail(input: {
  summary: TextplayStorySummary;
  event: TextplayWorldEventRow;
}): TextplayStoryDetail {
  return {
    ...input.summary,
    cause: toText(input.event.cause),
    process: toText(input.event.process),
    result: toText(input.event.result),
    timeRef: toText(input.event.timeRef),
    locationRefs: toStringList(input.event.locationRefs),
    characterRefs: toStringList(input.event.characterRefs),
    recommendedSceneId: toStringList(input.event.locationRefs)[0] || null,
  };
}

function buildBackgroundSummary(detail: TextplayStoryDetail, sceneDescription: string): string {
  const lines = [
    detail.title,
    detail.summary,
    detail.cause && `背景起因: ${detail.cause}`,
    detail.process && `已知局势: ${detail.process}`,
    detail.timeRef && `时间锚点: ${detail.timeRef}`,
    sceneDescription && `场景氛围: ${sceneDescription}`,
  ].filter((item): item is string => Boolean(item));
  return lines.join('\n');
}

function buildDefaultStartupPolicy(): TextplayStartupPolicy {
  return {
    initiative: {
      enabled: true,
      tickSeconds: 10,
      cooldownSeconds: 180,
      maxConsecutive: 3,
      blockedPresenceStates: ['composing', 'active'],
    },
    pacing: {
      targetTension: 0.6,
      tensionBand: [0.45, 0.75],
      beatDensity: 0.5,
      curve: 'steady-rise',
    },
  };
}

function mergeStartupPolicyFromContext(input: {
  contextStoryScope: Record<string, unknown>;
}): TextplayStartupPolicy {
  const defaults = buildDefaultStartupPolicy();
  const initiativePolicy = (input.contextStoryScope.initiativePolicy
    || (input.contextStoryScope.startupPolicy as Record<string, unknown> | undefined)?.initiative
    || {}) as Record<string, unknown>;
  const pacingPolicy = (input.contextStoryScope.pacingPolicy
    || (input.contextStoryScope.startupPolicy as Record<string, unknown> | undefined)?.pacing
    || {}) as Record<string, unknown>;

  return {
    initiative: {
      enabled: typeof initiativePolicy.enabled === 'boolean'
        ? initiativePolicy.enabled
        : defaults.initiative.enabled,
      tickSeconds: Number.isFinite(Number(initiativePolicy.tickSeconds))
        ? Number(initiativePolicy.tickSeconds)
        : defaults.initiative.tickSeconds,
      cooldownSeconds: Number.isFinite(Number(initiativePolicy.cooldownSeconds))
        ? Number(initiativePolicy.cooldownSeconds)
        : defaults.initiative.cooldownSeconds,
      maxConsecutive: Number.isFinite(Number(initiativePolicy.maxConsecutive))
        ? Number(initiativePolicy.maxConsecutive)
        : defaults.initiative.maxConsecutive,
      blockedPresenceStates: Array.isArray(initiativePolicy.blockedPresenceStates)
        ? (initiativePolicy.blockedPresenceStates
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0) as TextplayStartupPolicy['initiative']['blockedPresenceStates'])
        : defaults.initiative.blockedPresenceStates,
    },
    pacing: {
      targetTension: Number.isFinite(Number(pacingPolicy.targetTension))
        ? Number(pacingPolicy.targetTension)
        : defaults.pacing.targetTension,
      tensionBand: Array.isArray(pacingPolicy.tensionBand) && pacingPolicy.tensionBand.length >= 2
        ? [Number(pacingPolicy.tensionBand[0]), Number(pacingPolicy.tensionBand[1])]
        : defaults.pacing.tensionBand,
      beatDensity: Number.isFinite(Number(pacingPolicy.beatDensity))
        ? Number(pacingPolicy.beatDensity)
        : defaults.pacing.beatDensity,
      curve: toText(pacingPolicy.curve) || defaults.pacing.curve,
    },
  };
}

async function queryWorldEvents(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldEventRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
    query: {
      worldId: input.worldId,
    },
  });
  const parsed = TextplayWorldEventListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryWorldLorebooks(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldLorebookRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
    query: {
      worldId: input.worldId,
    },
  });
  const parsed = TextplayWorldLorebookListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryWorldScenes(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldSceneRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
    query: {
      worldId: input.worldId,
    },
  });
  const parsed = TextplayWorldSceneListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryNarrativeContexts(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<TextplayWorldNarrativeContextRow[]> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
    query: {
      worldId: input.worldId,
    },
  });
  const parsed = TextplayWorldNarrativeContextListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryMemoryRecall(input: {
  hookClient: HookClient;
  agentId: string;
  playerId: string;
}): Promise<TextplayMemoryRecallResponse> {
  if (!isEntityId(toText(input.agentId)) || !input.playerId) {
    return {
      items: [],
      core: [],
      e2e: [],
      recallSource: 'none',
    };
  }
  try {
    const payload = await input.hookClient.data.query({
      capability: TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
      query: {
        agentId: input.agentId,
        entityId: input.playerId,
        topK: 8,
      },
    });
    const parsed = TextplayMemoryRecallResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        items: [],
        core: [],
        e2e: [],
        recallSource: 'invalid',
      };
    }
    return parsed.data;
  } catch {
    return {
      items: [],
      core: [],
      e2e: [],
      recallSource: 'error',
    };
  }
}

async function queryNarrativeLatestTurn(input: {
  narrativeEngine: NarrativeEngineModule;
  storyId: string;
}): Promise<{ turnId: string; createdAt?: string } | null> {
  const requestParsed = NarrativeTurnLatestLookupRequestSchema.safeParse({ storyId: input.storyId });
  if (!requestParsed.success) {
    return null;
  }
  try {
    const payload = await input.narrativeEngine.turnLatest(requestParsed.data);
    const parsed = NarrativeTurnLatestLookupResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    return {
      turnId: parsed.data.turnId,
      createdAt: parsed.data.createdAt,
    };
  } catch {
    return null;
  }
}

function pickContextRow(input: {
  rows: TextplayWorldNarrativeContextRow[];
  scope: 'CANON' | 'STORY' | 'SUBJECT' | 'RELATION';
  storyId: string;
  primaryAgentId: string;
  playerId: string;
}): TextplayWorldNarrativeContextRow | null {
  const candidates = input.rows.filter((row) => row.scope === input.scope);
  if (candidates.length === 0) {
    return null;
  }
  if (input.scope === 'STORY') {
    return candidates.find((row) => toText(row.storyId) === input.storyId) || candidates[0] || null;
  }
  if (input.scope === 'SUBJECT') {
    return candidates.find((row) => toText(row.subjectId) === input.primaryAgentId) || candidates[0] || null;
  }
  if (input.scope === 'RELATION') {
    return candidates.find((row) => {
      const subjectId = toText(row.subjectId);
      const targetSubjectId = toText(row.targetSubjectId);
      return (
        (subjectId === input.primaryAgentId && targetSubjectId === input.playerId)
        || (subjectId === input.playerId && targetSubjectId === input.primaryAgentId)
      );
    }) || candidates[0] || null;
  }
  return candidates[0] || null;
}

function resolvePrimaryAgentId(input: {
  detail: TextplayStoryDetail;
  storyRow: TextplayWorldNarrativeContextRow | null;
  contexts: TextplayWorldNarrativeContextRow[];
  playerId: string;
}): string {
  const detailAgentId = toText(input.detail.primaryAgentId);
  if (isEntityId(detailAgentId)) {
    return detailAgentId;
  }

  const storySetting = {
    ...(input.storyRow?.narrativeSetting || {}),
    ...(input.storyRow?.narrativeState || {}),
  } as Record<string, unknown>;
  const castPolicy = (storySetting.castPolicy || {}) as Record<string, unknown>;
  const mandatorySubjectIds = toStringList(castPolicy.mandatorySubjectIds);
  const optionalSubjectIds = toStringList(castPolicy.optionalSubjectIds);

  const subjectAgentIds = input.contexts
    .filter((row) => row.scope === 'SUBJECT' && toText(row.subjectType).toUpperCase() === 'AGENT')
    .map((row) => toText(row.subjectId));

  const relationAgentIds = input.contexts
    .filter((row) => row.scope === 'RELATION')
    .flatMap((row) => [
      toText(row.subjectType).toUpperCase() === 'AGENT' ? toText(row.subjectId) : '',
      toText(row.targetSubjectType).toUpperCase() === 'AGENT' ? toText(row.targetSubjectId) : '',
    ]);

  const fallback = unique([
    ...mandatorySubjectIds,
    ...optionalSubjectIds,
    ...subjectAgentIds,
    ...relationAgentIds,
  ]).find((candidate) => isEntityId(candidate) && candidate !== input.playerId);

  return fallback || '';
}

export async function listPlayableStories(input: {
  hookClient: HookClient;
  worldId: string;
  runtimeAgentId?: string;
}): Promise<TextplayStorySummary[]> {
  const worldId = toText(input.worldId);
  if (!worldId) {
    return [];
  }
  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });
  return sortPrimaryEvents(events).map((event) => toStorySummary({
    worldId,
    event,
    runtimeAgentId: input.runtimeAgentId,
  }));
}

export async function getPlayableStoryDetail(input: {
  hookClient: HookClient;
  worldId: string;
  storyId: string;
  runtimeAgentId?: string;
}): Promise<TextplayStoryDetail | null> {
  const worldId = toText(input.worldId);
  const storyId = toText(input.storyId);
  if (!worldId || !storyId) {
    return null;
  }
  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });
  const primaryEvents = sortPrimaryEvents(events);
  const event = primaryEvents.find((row) => toStoryId(worldId, toText(row.id)) === storyId);
  if (!event) {
    return null;
  }
  const summary = toStorySummary({
    worldId,
    event,
    runtimeAgentId: input.runtimeAgentId,
  });
  return toStoryDetail({
    summary,
    event,
  });
}

export async function loadStoryStartupPackage(input: {
  hookClient: HookClient;
  narrativeEngine: NarrativeEngineModule;
  detail: TextplayStoryDetail;
  playerId: string;
}): Promise<TextplayStartupPackage> {
  const detail = input.detail;

  const [lorebooks, scenes, contexts, latestTurn] = await Promise.all([
    queryWorldLorebooks({
      hookClient: input.hookClient,
      worldId: detail.worldId,
    }),
    queryWorldScenes({
      hookClient: input.hookClient,
      worldId: detail.worldId,
    }),
    queryNarrativeContexts({
      hookClient: input.hookClient,
      worldId: detail.worldId,
    }),
    queryNarrativeLatestTurn({
      narrativeEngine: input.narrativeEngine,
      storyId: detail.storyId,
    }),
  ]);

  const canonRow = pickContextRow({
    rows: contexts,
    scope: 'CANON',
    storyId: detail.storyId,
    primaryAgentId: detail.primaryAgentId,
    playerId: input.playerId,
  });
  const storyRow = pickContextRow({
    rows: contexts,
    scope: 'STORY',
    storyId: detail.storyId,
    primaryAgentId: detail.primaryAgentId,
    playerId: input.playerId,
  });

  if (!canonRow || !storyRow) {
    throw new Error('TEXTPLAY_CONTEXT_MISSING_CRITICAL');
  }

  const resolvedPrimaryAgentId = resolvePrimaryAgentId({
    detail,
    storyRow,
    contexts,
    playerId: input.playerId,
  });

  const storySetting = {
    ...storyRow.narrativeSetting,
    ...storyRow.narrativeState,
  } as Record<string, unknown>;
  const subjectRow = pickContextRow({
    rows: contexts,
    scope: 'SUBJECT',
    storyId: detail.storyId,
    primaryAgentId: resolvedPrimaryAgentId,
    playerId: input.playerId,
  });
  const relationRow = pickContextRow({
    rows: contexts,
    scope: 'RELATION',
    storyId: detail.storyId,
    primaryAgentId: resolvedPrimaryAgentId,
    playerId: input.playerId,
  });

  const memoryRecall = await queryMemoryRecall({
    hookClient: input.hookClient,
    agentId: resolvedPrimaryAgentId,
    playerId: input.playerId,
  });

  const gapWarnings: string[] = [];
  if (!resolvedPrimaryAgentId) {
    gapWarnings.push('TEXTPLAY_AGENT_BINDING_MISSING_WARN');
  }
  if (!subjectRow) {
    gapWarnings.push('TEXTPLAY_CONTEXT_SUBJECT_MISSING_WARN');
  }
  if (!relationRow) {
    gapWarnings.push('TEXTPLAY_CONTEXT_RELATION_MISSING_WARN');
  }
  if (toText(memoryRecall.recallSource) === 'error') {
    gapWarnings.push('TEXTPLAY_MEMORY_RECALL_FAILED_WARN');
  }

  const sceneIdFromContext = toText((storyRow.narrativeSetting as Record<string, unknown>).recommendedSceneId);
  const recommendedSceneId = sceneIdFromContext || detail.recommendedSceneId || null;
  const selectedScene = (
    scenes.find((scene) => toText(scene.id) === recommendedSceneId)
    || scenes.find((scene) => detail.locationRefs.includes(toText(scene.id)))
    || scenes[0]
    || null
  );
  if (!selectedScene) {
    gapWarnings.push('TEXTPLAY_CONTEXT_SCENE_MISSING_WARN');
  }

  const scoredLorebooks = lorebooks
    .map((row) => ({
      id: toText(row.id),
      key: toText(row.key),
      content: toText(row.content),
      score: scoreLorebook({
        lorebook: row,
        detail,
      }),
    }))
    .filter((row) => row.id && row.content)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 8);

  const scoredScenes = scenes
    .map((scene) => ({
      id: toText(scene.id),
      name: toText(scene.name),
      description: toText(scene.description),
      score: scoreScene({
        scene,
        detail,
      }),
    }))
    .filter((scene) => scene.id)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);

  const memories = toMemoryTextList(memoryRecall).slice(0, 8);
  const startupPolicy = mergeStartupPolicyFromContext({
    contextStoryScope: storySetting,
  });

  const contextCoverage = {
    canon: Boolean(canonRow),
    story: Boolean(storyRow),
    subject: Boolean(subjectRow),
    relation: Boolean(relationRow),
    scene: Boolean(selectedScene),
  };

  const snapshotVersionSeed = JSON.stringify({
    entryEventId: detail.entryEventId,
    lorebookIds: scoredLorebooks.map((item) => item.id),
    sceneIds: scoredScenes.map((item) => item.id),
    contextIds: contexts.map((item) => item.id),
    recallSource: toText(memoryRecall.recallSource),
    primaryAgentId: resolvedPrimaryAgentId,
  });

  const narrativeScopes = {
    CANON: {
      ...canonRow.narrativeSetting,
      ...canonRow.narrativeState,
    },
    STORY: {
      ...storyRow.narrativeSetting,
      ...storyRow.narrativeState,
    },
    SUBJECT: subjectRow
      ? { ...subjectRow.narrativeSetting, ...subjectRow.narrativeState }
      : {},
    RELATION: relationRow
      ? { ...relationRow.narrativeSetting, ...relationRow.narrativeState }
      : {},
  };

  return {
    storyId: detail.storyId,
    worldId: detail.worldId,
    entryEventId: detail.entryEventId,
    entry: {
      title: detail.title,
      summary: detail.summary,
      cause: detail.cause,
      process: detail.process,
      result: detail.result,
      timeRef: detail.timeRef,
      locationRefs: detail.locationRefs,
      characterRefs: detail.characterRefs,
      recommendedSceneId: recommendedSceneId || (selectedScene ? toText(selectedScene.id) : null),
    },
    cast: {
      primaryAgentId: resolvedPrimaryAgentId,
      participants: unique(
        resolvedPrimaryAgentId
          ? [resolvedPrimaryAgentId, ...detail.participants]
          : detail.participants,
      ),
    },
    background: {
      summary: buildBackgroundSummary(detail, toText(selectedScene?.description)),
    },
    materials: {
      lorebooks: scoredLorebooks,
      memories,
      scenes: scoredScenes,
      contexts: contexts.map((row) => ({
        id: toText(row.id),
        scope: row.scope,
        scopeKey: toText(row.scopeKey),
        storyId: row.storyId ? toText(row.storyId) : null,
        narrativeSetting: row.narrativeSetting || {},
        narrativeState: row.narrativeState || {},
      })),
      recallSource: toText(memoryRecall.recallSource) || 'unknown',
    },
    narrativeScopes,
    recommendedEntryTurn: latestTurn,
    startupPolicy,
    snapshot: {
      storyId: detail.storyId,
      entryEventId: detail.entryEventId,
      primaryAgentId: resolvedPrimaryAgentId,
      version: hashString(snapshotVersionSeed),
      source: STARTUP_SOURCE,
      loadedAt: new Date().toISOString(),
      contextCoverage,
      gapWarnings,
    },
  };
}
