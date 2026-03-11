import { z } from 'zod';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { NarrativeEngineModule } from '../../../../modules/narrative-engine/src/index.js';
import {
  VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST,
  VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  VIDEOPLAY_DATA_API_WORLD_SCENES_LIST,
  VIDEOPLAY_REASON,
  VIDEOPLAY_STORY_SOURCE_MODE,
  type VideoStorySourceMode,
} from '../contracts.js';
import { VideoPlayError } from '../errors.js';
import { createHash } from '../id.js';
import {
  NarrativeProjectionRenderInputSchema,
  NarrativeTurnWindowSchema,
  VideoStoryDetailSchema,
  VideoStoryPackageSchema,
  VideoStorySummarySchema,
} from '../schemas.js';
import type {
  NarrativeProjectionRenderInput,
  NarrativeTurnWindow,
  VideoStoryDetail,
  VideoStoryPackage,
  VideoStorySummary,
} from '../types.js';

const STORY_PACKAGE_SOURCE = 'videoplay:events+scenes+contexts+lorebooks+memory+narrative.turn.window+projection';

const DEFAULT_WINDOW_POLICY = {
  maxTurns: 40,
  readLimit: 100,
  enrichedRequiredTriggerSources: ['UserTurn', 'AgentInitiative'] as const,
};

const WorldEventRowSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().optional(),
  level: z.string().optional(),
  eventHorizon: z.enum(['PAST', 'ONGOING', 'FUTURE']).optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  cause: z.string().optional(),
  process: z.string().optional(),
  result: z.string().optional(),
  timeRef: z.string().optional(),
  locationRefs: z.array(z.string()).optional(),
  characterRefs: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const WorldEventListResponseSchema = z.union([
  z.array(WorldEventRowSchema),
  z.object({
    worldId: z.string().optional(),
    items: z.array(WorldEventRowSchema),
  }).passthrough(),
]);

const WorldLorebookRowSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  content: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

const WorldLorebookListResponseSchema = z.union([
  z.array(WorldLorebookRowSchema),
  z.object({
    worldId: z.string().optional(),
    items: z.array(WorldLorebookRowSchema),
  }).passthrough(),
]);

const WorldSceneRowSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  setting: z.record(z.string(), z.unknown()).optional(),
  activeEntities: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const WorldSceneListResponseSchema = z.union([
  z.array(WorldSceneRowSchema),
  z.object({
    worldId: z.string().optional(),
    items: z.array(WorldSceneRowSchema),
  }).passthrough(),
]);

const WorldNarrativeContextRowSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['CANON', 'STORY', 'SUBJECT', 'RELATION']),
  scopeKey: z.string().min(1),
  storyId: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  narrativeSetting: z.record(z.string(), z.unknown()).default({}),
  narrativeState: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().optional(),
}).passthrough();

const WorldNarrativeContextListResponseSchema = z.union([
  z.array(WorldNarrativeContextRowSchema),
  z.object({
    worldId: z.string().optional(),
    items: z.array(WorldNarrativeContextRowSchema),
  }).passthrough(),
]);

const MemoryRecallResponseSchema = z.object({
  items: z.array(z.unknown()).default([]),
  core: z.array(z.unknown()).default([]),
  e2e: z.array(z.unknown()).default([]),
  recallSource: z.string().optional(),
}).passthrough();

const NarrativeTurnLatestResponseSchema = z.object({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  triggerSource: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoOrNow(value: unknown): string {
  const text = toText(value);
  return text || new Date().toISOString();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toStoryId(worldId: string, eventId: string): string {
  return `story.${normalizeKey(worldId)}.${normalizeKey(eventId)}`;
}

function toEventHorizon(value: unknown): 'PAST' | 'ONGOING' | 'FUTURE' {
  const upper = toText(value).toUpperCase();
  if (upper === 'ONGOING') return 'ONGOING';
  if (upper === 'FUTURE') return 'FUTURE';
  return 'PAST';
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function failStoryPackage(message: string, details?: Record<string, unknown>): never {
  throw new VideoPlayError({
    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
    actionHint: 'Repair story package schema/coverage and retry.',
    stage: 'story-package',
    message,
    details,
  });
}

function failStorySource(message: string, details?: Record<string, unknown>): never {
  throw new VideoPlayError({
    reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
    actionHint: 'Select an available story source mode and retry.',
    stage: 'story-source',
    message,
    details,
  });
}

function asItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}

function toMemoryText(value: unknown): string {
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

function toMemoryTextList(payload: z.infer<typeof MemoryRecallResponseSchema>): string[] {
  const values: unknown[] = [];
  if (Array.isArray(payload.items)) values.push(...payload.items);
  if (Array.isArray(payload.core)) values.push(...payload.core);
  if (Array.isArray(payload.e2e)) values.push(...payload.e2e);
  return unique(values.map(toMemoryText).filter(Boolean)).slice(0, 12);
}

function pickPrimaryAgentId(runtimeAgentId: string | undefined, participants: string[]): string {
  const runtime = toText(runtimeAgentId);
  if (runtime) return runtime;
  return participants[0] || '';
}

function scoreLorebook(input: { detail: VideoStoryDetail; row: z.infer<typeof WorldLorebookRowSchema> }): number {
  const tokens = unique([
    ...tokenize(input.detail.title),
    ...tokenize(input.detail.summary),
    ...input.detail.locationRefs.map((item) => item.toLowerCase()),
    ...input.detail.characterRefs.map((item) => item.toLowerCase()),
  ]);
  const key = toText(input.row.key).toLowerCase();
  const name = toText(input.row.name).toLowerCase();
  const content = toText(input.row.content).toLowerCase();
  const keywords = toStringList(input.row.keywords).map((item) => item.toLowerCase());
  let score = 0;
  for (const token of tokens) {
    if (key.includes(token)) score += 3;
    if (name.includes(token)) score += 2;
    if (content.includes(token)) score += 1;
    if (keywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) score += 2;
  }
  return score;
}

function scoreScene(input: { detail: VideoStoryDetail; row: z.infer<typeof WorldSceneRowSchema> }): number {
  const tokens = unique([
    ...tokenize(input.detail.title),
    ...tokenize(input.detail.summary),
    ...input.detail.locationRefs.map((item) => item.toLowerCase()),
  ]);
  const sceneId = toText(input.row.id).toLowerCase();
  const name = toText(input.row.name).toLowerCase();
  const description = toText(input.row.description).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (sceneId.includes(token)) score += 2;
    if (name.includes(token)) score += 3;
    if (description.includes(token)) score += 1;
  }
  return score;
}

function parseSourceMode(value: unknown): VideoStorySourceMode {
  const mode = String(value || '').trim();
  if (mode === VIDEOPLAY_STORY_SOURCE_MODE.ENRICHED) {
    return VIDEOPLAY_STORY_SOURCE_MODE.ENRICHED;
  }
  return VIDEOPLAY_STORY_SOURCE_MODE.CANONICAL;
}

function normalizeWindowPolicy(input?: {
  maxTurns?: number;
  readLimit?: number;
  enrichedRequiredTriggerSources?: string[];
}): VideoStoryPackage['windowPolicy'] {
  const maxTurns = Number.isFinite(Number(input?.maxTurns))
    ? Math.max(1, Math.floor(Number(input?.maxTurns)))
    : DEFAULT_WINDOW_POLICY.maxTurns;
  const readLimitFromInput = Number.isFinite(Number(input?.readLimit))
    ? Math.max(1, Math.floor(Number(input?.readLimit)))
    : DEFAULT_WINDOW_POLICY.readLimit;
  const readLimit = Math.max(readLimitFromInput, maxTurns);
  const enrichedRequiredTriggerSources = Array.isArray(input?.enrichedRequiredTriggerSources)
    ? unique(input.enrichedRequiredTriggerSources.map((item) => String(item || '').trim()))
      .filter((item): item is 'UserTurn' | 'AgentInitiative' => item === 'UserTurn' || item === 'AgentInitiative')
    : [...DEFAULT_WINDOW_POLICY.enrichedRequiredTriggerSources];
  return {
    maxTurns,
    readLimit,
    enrichedRequiredTriggerSources: enrichedRequiredTriggerSources.length > 0
      ? enrichedRequiredTriggerSources
      : [...DEFAULT_WINDOW_POLICY.enrichedRequiredTriggerSources],
  };
}

function sortPrimaryEvents(rows: z.infer<typeof WorldEventRowSchema>[], worldId: string): z.infer<typeof WorldEventRowSchema>[] {
  const filtered = rows.filter((row) => {
    const rowWorldId = toText(row.worldId);
    if (rowWorldId && rowWorldId !== worldId) return false;
    return toText(row.level).toUpperCase() === 'PRIMARY';
  });
  return filtered.sort((left, right) => {
    const leftTs = toText(left.updatedAt) || toText(left.createdAt);
    const rightTs = toText(right.updatedAt) || toText(right.createdAt);
    const dateOrder = rightTs.localeCompare(leftTs);
    if (dateOrder !== 0) return dateOrder;
    return toText(left.id).localeCompare(toText(right.id));
  });
}

function toVideoStorySummary(input: {
  worldId: string;
  runtimeAgentId?: string;
  event: z.infer<typeof WorldEventRowSchema>;
}): VideoStorySummary {
  const eventId = toText(input.event.id);
  const participants = unique(toStringList(input.event.characterRefs));
  const primaryAgentId = pickPrimaryAgentId(input.runtimeAgentId, participants);
  const summary: VideoStorySummary = {
    storyId: toStoryId(input.worldId, eventId),
    worldId: input.worldId,
    entryEventId: eventId,
    title: toText(input.event.title) || eventId,
    summary: toText(input.event.summary) || toText(input.event.process) || toText(input.event.result) || 'No summary yet.',
    primaryAgentId,
    participants: unique(primaryAgentId ? [primaryAgentId, ...participants] : participants),
    eventHorizon: toEventHorizon(input.event.eventHorizon),
    updatedAt: toIsoOrNow(input.event.updatedAt || input.event.createdAt),
    playable: true,
    agentBindingMissing: !primaryAgentId,
  };
  const parsed = VideoStorySummarySchema.safeParse(summary);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_STORY_SUMMARY_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return parsed.data;
}

function toVideoStoryDetail(input: {
  summary: VideoStorySummary;
  event: z.infer<typeof WorldEventRowSchema>;
}): VideoStoryDetail {
  const detail: VideoStoryDetail = {
    ...input.summary,
    cause: toText(input.event.cause),
    process: toText(input.event.process),
    result: toText(input.event.result),
    timeRef: toText(input.event.timeRef),
    locationRefs: toStringList(input.event.locationRefs),
    characterRefs: toStringList(input.event.characterRefs),
    recommendedSceneId: toStringList(input.event.locationRefs)[0] || null,
  };
  const parsed = VideoStoryDetailSchema.safeParse(detail);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_STORY_DETAIL_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return parsed.data;
}

async function queryWorldEvents(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<z.infer<typeof WorldEventRowSchema>[]> {
  const raw = await input.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST,
    query: { worldId: input.worldId },
  });
  const parsed = WorldEventListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_WORLD_EVENTS_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return asItems<z.infer<typeof WorldEventRowSchema>>(parsed.data);
}

async function queryWorldScenes(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<z.infer<typeof WorldSceneRowSchema>[]> {
  const raw = await input.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_WORLD_SCENES_LIST,
    query: { worldId: input.worldId, take: 200 },
  });
  const parsed = WorldSceneListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_WORLD_SCENES_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return asItems<z.infer<typeof WorldSceneRowSchema>>(parsed.data);
}

async function queryWorldLorebooks(input: {
  hookClient: HookClient;
  worldId: string;
}): Promise<z.infer<typeof WorldLorebookRowSchema>[]> {
  const raw = await input.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
    query: { worldId: input.worldId, take: 200 },
  });
  const parsed = WorldLorebookListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_WORLD_LOREBOOK_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return asItems<z.infer<typeof WorldLorebookRowSchema>>(parsed.data);
}

async function queryNarrativeContexts(input: {
  hookClient: HookClient;
  worldId: string;
  storyId: string;
}): Promise<z.infer<typeof WorldNarrativeContextRowSchema>[]> {
  const raw = await input.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
    query: {
      worldId: input.worldId,
      storyId: input.storyId,
      take: 200,
    },
  });
  const parsed = WorldNarrativeContextListResponseSchema.safeParse(raw);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_WORLD_CONTEXT_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return asItems<z.infer<typeof WorldNarrativeContextRowSchema>>(parsed.data);
}

async function queryMemoryRecall(input: {
  hookClient: HookClient;
  worldId: string;
  storyId: string;
  agentId: string;
}): Promise<z.infer<typeof MemoryRecallResponseSchema>> {
  const raw = await input.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
    query: {
      worldId: input.worldId,
      storyId: input.storyId,
      entityType: 'AGENT',
      entityId: input.agentId,
      topK: 12,
    },
  });
  const parsed = MemoryRecallResponseSchema.safeParse(raw);
  if (!parsed.success) {
    failStoryPackage('VIDEOPLAY_MEMORY_RECALL_SCHEMA_INVALID', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return parsed.data;
}

function mergeNarrativeScope(row: z.infer<typeof WorldNarrativeContextRowSchema> | null): Record<string, unknown> {
  if (!row) return {};
  return {
    ...row.narrativeSetting,
    ...row.narrativeState,
  };
}

function buildGapWarnings(input: {
  hasCanon: boolean;
  hasStory: boolean;
  hasSubject: boolean;
  hasRelation: boolean;
  hasScene: boolean;
}): string[] {
  const warnings: string[] = [];
  if (!input.hasCanon) warnings.push('missing-canon-context');
  if (!input.hasStory) warnings.push('missing-story-context');
  if (!input.hasSubject) warnings.push('missing-subject-context');
  if (!input.hasRelation) warnings.push('missing-relation-context');
  if (!input.hasScene) warnings.push('missing-scene-context');
  return warnings;
}

export async function listPlayableVideoStories(input: {
  hookClient: HookClient;
  worldId: string;
  runtimeAgentId?: string;
}): Promise<VideoStorySummary[]> {
  const worldId = toText(input.worldId);
  if (!worldId) {
    failStoryPackage('VIDEOPLAY_WORLD_ID_REQUIRED');
  }
  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });
  const primaryEvents = sortPrimaryEvents(events, worldId);
  return primaryEvents.map((event) => toVideoStorySummary({
    worldId,
    runtimeAgentId: input.runtimeAgentId,
    event,
  }));
}

export async function getPlayableVideoStoryDetail(input: {
  hookClient: HookClient;
  worldId: string;
  storyId: string;
  runtimeAgentId?: string;
}): Promise<VideoStoryDetail | null> {
  const worldId = toText(input.worldId);
  const storyId = toText(input.storyId);
  if (!worldId || !storyId) {
    failStoryPackage('VIDEOPLAY_WORLD_OR_STORY_REQUIRED');
  }
  const events = await queryWorldEvents({
    hookClient: input.hookClient,
    worldId,
  });
  const primaryEvents = sortPrimaryEvents(events, worldId);
  const event = primaryEvents.find((row) => toStoryId(worldId, toText(row.id)) === storyId);
  if (!event) return null;
  const summary = toVideoStorySummary({
    worldId,
    runtimeAgentId: input.runtimeAgentId,
    event,
  });
  return toVideoStoryDetail({
    summary,
    event,
  });
}

export async function loadVideoStoryPackage(input: {
  hookClient: HookClient;
  narrativeEngine: NarrativeEngineModule;
  worldId: string;
  storyId: string;
  projectId: string;
  ingestCursorStart: string;
  sourceMode?: VideoStorySourceMode;
  windowPolicy?: {
    maxTurns?: number;
    readLimit?: number;
    enrichedRequiredTriggerSources?: string[];
  };
  runtimeAgentId?: string;
}): Promise<VideoStoryPackage> {
  const worldId = toText(input.worldId);
  const storyId = toText(input.storyId);
  const projectId = toText(input.projectId) || worldId;
  const ingestCursorStart = toText(input.ingestCursorStart) || 'turn-0000';
  if (!worldId || !storyId) {
    failStoryPackage('VIDEOPLAY_WORLD_OR_STORY_REQUIRED');
  }

  const sourceMode = parseSourceMode(input.sourceMode);
  const windowPolicy = normalizeWindowPolicy(input.windowPolicy);
  const detail = await getPlayableVideoStoryDetail({
    hookClient: input.hookClient,
    worldId,
    storyId,
    runtimeAgentId: input.runtimeAgentId,
  });
  if (!detail) {
    failStorySource('VIDEOPLAY_STORY_NOT_FOUND', { worldId, storyId });
  }
  if (!detail.primaryAgentId) {
    failStorySource('VIDEOPLAY_STORY_PRIMARY_AGENT_MISSING', { storyId: detail.storyId });
  }

  const [scenes, lorebooks, contexts, memoryRecall] = await Promise.all([
    queryWorldScenes({ hookClient: input.hookClient, worldId }),
    queryWorldLorebooks({ hookClient: input.hookClient, worldId }),
    queryNarrativeContexts({
      hookClient: input.hookClient,
      worldId,
      storyId: detail.storyId,
    }),
    queryMemoryRecall({
      hookClient: input.hookClient,
      worldId,
      storyId: detail.storyId,
      agentId: detail.primaryAgentId,
    }),
  ]);

  let latestTurn: z.infer<typeof NarrativeTurnLatestResponseSchema> | null = null;
  try {
    const latestRaw = await input.narrativeEngine.turnLatest({
      storyId: detail.storyId,
    });
    const latestParsed = NarrativeTurnLatestResponseSchema.safeParse(latestRaw);
    if (latestParsed.success) {
      latestTurn = latestParsed.data;
    }
  } catch {
    latestTurn = null;
  }
  if (!latestTurn) {
    failStorySource('VIDEOPLAY_STORY_LATEST_TURN_NOT_FOUND', { storyId: detail.storyId });
  }

  const turnWindowRaw = await input.narrativeEngine.turnWindow({
    projectId,
    storyId: detail.storyId,
    ingestCursorStart,
    limit: windowPolicy.readLimit,
  });
  const turnWindowParsed = NarrativeTurnWindowSchema.safeParse(turnWindowRaw);
  if (!turnWindowParsed.success) {
    failStoryPackage('VIDEOPLAY_STORY_TURN_WINDOW_SCHEMA_INVALID', {
      issues: turnWindowParsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }

  const trimmedTurns = turnWindowParsed.data.turns.slice(-windowPolicy.maxTurns);
  if (trimmedTurns.length === 0) {
    failStorySource('VIDEOPLAY_STORY_WINDOW_EMPTY', { storyId: detail.storyId });
  }
  const turnWindow: NarrativeTurnWindow = {
    ...turnWindowParsed.data,
    ingestCursorStart: trimmedTurns[0]!.turnId,
    turns: trimmedTurns,
  };

  if (sourceMode === VIDEOPLAY_STORY_SOURCE_MODE.ENRICHED) {
    const triggerSourceSet = new Set<string>(windowPolicy.enrichedRequiredTriggerSources);
    const hasEnrichedTurn = turnWindow.turns.some((turn) => triggerSourceSet.has(String(turn.triggerSource || '').trim()));
    if (!hasEnrichedTurn) {
      failStorySource('VIDEOPLAY_ENRICHED_SOURCE_TRIGGER_MISSING', {
        storyId: detail.storyId,
        requiredTriggerSources: windowPolicy.enrichedRequiredTriggerSources,
      });
    }
  }

  const projectionTurnId = turnWindow.turns[turnWindow.turns.length - 1]!.turnId;
  const projectionRaw = await input.narrativeEngine.projectionRenderInput({
    storyId: detail.storyId,
    turnId: projectionTurnId,
  });
  const projectionParsed = NarrativeProjectionRenderInputSchema.safeParse(projectionRaw);
  if (!projectionParsed.success) {
    failStoryPackage('VIDEOPLAY_STORY_PROJECTION_SCHEMA_INVALID', {
      issues: projectionParsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  const projection: NarrativeProjectionRenderInput = projectionParsed.data;

  const canonContext = contexts.find((row) => row.scope === 'CANON') || null;
  const storyContext = contexts.find((row) => row.scope === 'STORY' && (!row.storyId || row.storyId === detail.storyId))
    || contexts.find((row) => row.scope === 'STORY')
    || null;
  const subjectContext = contexts.find((row) => row.scope === 'SUBJECT' && (
    toText(row.subjectId) === detail.primaryAgentId || toText(row.scopeKey) === detail.primaryAgentId
  )) || contexts.find((row) => row.scope === 'SUBJECT') || null;
  const relationContext = contexts.find((row) => row.scope === 'RELATION') || null;

  const hasScene = scenes.length > 0;
  const gapWarnings = buildGapWarnings({
    hasCanon: Boolean(canonContext),
    hasStory: Boolean(storyContext),
    hasSubject: Boolean(subjectContext),
    hasRelation: Boolean(relationContext),
    hasScene,
  });
  if (!canonContext || !storyContext) {
    failStoryPackage('VIDEOPLAY_STORY_CONTEXT_CRITICAL_MISSING', {
      storyId: detail.storyId,
      gapWarnings,
    });
  }

  const scoredLorebooks = lorebooks
    .map((row) => ({
      id: toText(row.id),
      key: toText(row.key) || toText(row.id),
      content: toText(row.content),
      score: scoreLorebook({ detail, row }),
    }))
    .filter((row) => row.id && row.key)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const scoredScenes = scenes
    .map((row) => ({
      id: toText(row.id),
      name: toText(row.name) || toText(row.id),
      description: toText(row.description),
      score: scoreScene({ detail, row }),
    }))
    .filter((row) => row.id)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const materialsContexts = contexts.map((row) => ({
    id: toText(row.id),
    scope: row.scope,
    scopeKey: toText(row.scopeKey),
    storyId: row.storyId ? toText(row.storyId) : null,
    narrativeSetting: row.narrativeSetting || {},
    narrativeState: row.narrativeState || {},
  }));

  const packagePayload: VideoStoryPackage = {
    storyId: detail.storyId,
    worldId,
    entryEventId: detail.entryEventId,
    sourceMode,
    entry: {
      title: detail.title,
      summary: detail.summary,
      cause: detail.cause,
      process: detail.process,
      result: detail.result,
      timeRef: detail.timeRef,
      locationRefs: [...detail.locationRefs],
      characterRefs: [...detail.characterRefs],
      recommendedSceneId: detail.recommendedSceneId,
    },
    cast: {
      primaryAgentId: detail.primaryAgentId,
      participants: [...detail.participants],
    },
    materials: {
      lorebooks: scoredLorebooks,
      memories: toMemoryTextList(memoryRecall),
      scenes: scoredScenes,
      contexts: materialsContexts,
      recallSource: toText(memoryRecall.recallSource) || 'memory-recall',
    },
    narrativeScopes: {
      CANON: mergeNarrativeScope(canonContext),
      STORY: mergeNarrativeScope(storyContext),
      SUBJECT: mergeNarrativeScope(subjectContext),
      RELATION: mergeNarrativeScope(relationContext),
    },
    turnWindow,
    projection,
    recommendedEntryTurn: latestTurn
      ? {
          turnId: latestTurn.turnId,
          ...(latestTurn.createdAt ? { createdAt: latestTurn.createdAt } : {}),
          ...(latestTurn.triggerSource ? { triggerSource: latestTurn.triggerSource } : {}),
        }
      : null,
    windowPolicy,
    snapshot: {
      storyId: detail.storyId,
      entryEventId: detail.entryEventId,
      primaryAgentId: detail.primaryAgentId,
      version: `vstory-${createHash(`${detail.storyId}:${projectionTurnId}:${turnWindow.turns.length}`)}`,
      source: STORY_PACKAGE_SOURCE,
      loadedAt: new Date().toISOString(),
      contextCoverage: {
        canon: Boolean(canonContext),
        story: Boolean(storyContext),
        subject: Boolean(subjectContext),
        relation: Boolean(relationContext),
        scene: hasScene,
      },
      gapWarnings,
    },
  };

  const packageParsed = VideoStoryPackageSchema.safeParse(packagePayload);
  if (!packageParsed.success) {
    failStoryPackage('VIDEOPLAY_STORY_PACKAGE_SCHEMA_INVALID', {
      issues: packageParsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    });
  }
  return packageParsed.data;
}
