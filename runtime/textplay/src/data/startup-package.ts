import {
  pickNarrativeRelationContextRow,
  pickNarrativeStoryContextRow,
  pickNarrativeSubjectContextRow,
  resolveNarrativeContextStoryAnchor,
} from '../../../../modules/narrative-engine/src/index.js';
import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
} from '../contracts.js';
import {
  TextplayMemoryRecallResponseSchema,
  TextplayWorldLorebookListResponseSchema,
  TextplayWorldNarrativeContextListResponseSchema,
  TextplayWorldSceneListResponseSchema,
  type TextplayMemoryRecallResponse,
  type TextplayWorldLorebookRow,
  type TextplayWorldNarrativeContextRow,
  type TextplayWorldSceneRow,
} from './schemas.js';
import type { TextplayEntryDetail, TextplayStartupPackage, TextplayStartupPolicy } from '../types.js';
import { hashString } from '../utils/hash.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

const STARTUP_SOURCE = 'textplay:entry+scenes+contexts+lorebooks+memory';
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,}$/;

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toTemplateStoryId(worldId: string, entryEventId: string): string {
  return `story.${normalizeKey(worldId)}.${normalizeKey(entryEventId)}`;
}

function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
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
  detail: TextplayEntryDetail;
}): number {
  const titleTokens = tokenize(input.detail.title);
  const summaryTokens = tokenize(input.detail.materialSummary || input.detail.summary);
  const tokens = unique([...titleTokens, ...summaryTokens]);
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
  detail: TextplayEntryDetail;
}): number {
  const tokens = unique([
    ...tokenize(input.detail.title),
    ...tokenize(input.detail.materialSummary || input.detail.summary),
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

function buildBackgroundSummary(detail: TextplayEntryDetail, sceneDescription: string): string {
  return [
    detail.title,
    detail.materialSummary,
    detail.cause ? `背景起因: ${detail.cause}` : '',
    detail.process ? `已知局势: ${detail.process}` : '',
    detail.timeRef ? `时间锚点: ${detail.timeRef}` : '',
    sceneDescription ? `场景氛围: ${sceneDescription}` : '',
  ].filter(Boolean).join('\n');
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
  const startupPolicy = (input.contextStoryScope.startupPolicy || {}) as Record<string, unknown>;
  const initiative = (input.contextStoryScope.initiativePolicy || startupPolicy.initiative || {}) as Record<string, unknown>;
  const pacing = (input.contextStoryScope.pacingPolicy || startupPolicy.pacing || {}) as Record<string, unknown>;
  return {
    initiative: {
      enabled: typeof initiative.enabled === 'boolean' ? initiative.enabled : defaults.initiative.enabled,
      tickSeconds: Number.isFinite(Number(initiative.tickSeconds))
        ? Number(initiative.tickSeconds)
        : defaults.initiative.tickSeconds,
      cooldownSeconds: Number.isFinite(Number(initiative.cooldownSeconds))
        ? Number(initiative.cooldownSeconds)
        : defaults.initiative.cooldownSeconds,
      maxConsecutive: Number.isFinite(Number(initiative.maxConsecutive))
        ? Number(initiative.maxConsecutive)
        : defaults.initiative.maxConsecutive,
      blockedPresenceStates: Array.isArray(initiative.blockedPresenceStates)
        ? (initiative.blockedPresenceStates
          .map((item) => String(item || '').trim())
          .filter(Boolean) as TextplayStartupPolicy['initiative']['blockedPresenceStates'])
        : defaults.initiative.blockedPresenceStates,
    },
    pacing: {
      targetTension: Number.isFinite(Number(pacing.targetTension))
        ? Number(pacing.targetTension)
        : defaults.pacing.targetTension,
      tensionBand: Array.isArray(pacing.tensionBand) && pacing.tensionBand.length >= 2
        ? [Number(pacing.tensionBand[0]), Number(pacing.tensionBand[1])]
        : defaults.pacing.tensionBand,
      beatDensity: Number.isFinite(Number(pacing.beatDensity))
        ? Number(pacing.beatDensity)
        : defaults.pacing.beatDensity,
      curve: toText(pacing.curve) || defaults.pacing.curve,
    },
  };
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
  if (Array.isArray(payload.items)) values.push(...payload.items);
  if (Array.isArray(payload.core)) values.push(...payload.core);
  if (Array.isArray(payload.e2e)) values.push(...payload.e2e);
  return unique(values.map(extractMemoryText).filter(Boolean)).slice(0, 8);
}

async function queryWorldLorebooks(hookClient: HookClient, worldId: string): Promise<TextplayWorldLorebookRow[]> {
  const payload = await hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
    query: { worldId },
  });
  const parsed = TextplayWorldLorebookListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryWorldScenes(hookClient: HookClient, worldId: string): Promise<TextplayWorldSceneRow[]> {
  const payload = await hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
    query: { worldId },
  });
  const parsed = TextplayWorldSceneListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

async function queryNarrativeContexts(hookClient: HookClient, worldId: string): Promise<TextplayWorldNarrativeContextRow[]> {
  const payload = await hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
    query: { worldId },
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
  userId: string;
}): Promise<TextplayMemoryRecallResponse> {
  if (!isEntityId(input.agentId) || !input.userId) {
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
        entityId: input.userId,
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

export async function loadEntryStartupPackage(input: {
  hookClient: HookClient;
  detail: TextplayEntryDetail;
  storyId: string;
  agentId: string;
  userId: string;
}): Promise<TextplayStartupPackage> {
  const [lorebooks, scenes, contexts] = await Promise.all([
    queryWorldLorebooks(input.hookClient, input.detail.worldId),
    queryWorldScenes(input.hookClient, input.detail.worldId),
    queryNarrativeContexts(input.hookClient, input.detail.worldId),
  ]);

  const requestedTemplateStoryId = toTemplateStoryId(input.detail.worldId, input.detail.entryEventId);
  const contextStoryAnchor = resolveNarrativeContextStoryAnchor({
    rows: contexts,
    requestedStoryId: requestedTemplateStoryId,
    primaryAgentId: input.agentId,
    participantIds: unique([
      input.agentId,
      ...input.detail.participants,
      ...input.detail.characterRefs,
    ]),
    locationRefs: input.detail.locationRefs,
    entryEventId: input.detail.entryEventId,
  });

  const canonRow = contexts.find((row) => row.scope === 'CANON') || null;
  const storyRow = pickNarrativeStoryContextRow({
    rows: contexts,
    resolvedStoryId: contextStoryAnchor.resolvedStoryId,
  }) as TextplayWorldNarrativeContextRow | null;
  const subjectRow = pickNarrativeSubjectContextRow({
    rows: contexts,
    resolvedStoryId: contextStoryAnchor.resolvedStoryId,
    primaryAgentId: input.agentId,
  }) as TextplayWorldNarrativeContextRow | null;
  const relationRow = pickNarrativeRelationContextRow({
    rows: contexts,
    resolvedStoryId: contextStoryAnchor.resolvedStoryId,
    primaryAgentId: input.agentId,
    userId: input.userId,
    candidateAgentIds: input.detail.characterRefs.filter((item) => item !== input.agentId),
  }) as TextplayWorldNarrativeContextRow | null;

  if (!canonRow || !storyRow) {
    throw new Error('TEXTPLAY_CONTEXT_MISSING_CRITICAL');
  }

  const storyScope = {
    ...storyRow.narrativeSetting,
    ...storyRow.narrativeState,
  } as Record<string, unknown>;
  const memoryRecall = await queryMemoryRecall({
    hookClient: input.hookClient,
    agentId: input.agentId,
    userId: input.userId,
  });

  const selectedScene = (
    scenes.find((scene) => toText(scene.id) === input.detail.recommendedSceneId)
    || scenes.find((scene) => input.detail.locationRefs.includes(toText(scene.id)))
    || scenes[0]
    || null
  );

  const scoredLorebooks = lorebooks
    .map((row) => ({
      id: toText(row.id),
      key: toText(row.key),
      content: toText(row.content),
      score: scoreLorebook({ lorebook: row, detail: input.detail }),
    }))
    .filter((row) => row.id && row.content)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 8);

  const scoredScenes = scenes
    .map((scene) => ({
      id: toText(scene.id),
      name: toText(scene.name),
      description: toText(scene.description),
      score: scoreScene({ scene, detail: input.detail }),
    }))
    .filter((scene) => scene.id)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 5);

  const startupContextRows = unique([
    toText(canonRow.id),
    toText(storyRow.id),
    toText(subjectRow?.id),
    toText(relationRow?.id),
  ])
    .map((id) => contexts.find((row) => toText(row.id) === id))
    .filter((row): row is TextplayWorldNarrativeContextRow => Boolean(row));

  const gapWarnings: string[] = [];
  if (!subjectRow) gapWarnings.push('TEXTPLAY_CONTEXT_SUBJECT_MISSING_WARN');
  if (!relationRow) gapWarnings.push('TEXTPLAY_CONTEXT_RELATION_MISSING_WARN');
  if (!selectedScene) gapWarnings.push('TEXTPLAY_CONTEXT_SCENE_MISSING_WARN');
  if (toText(memoryRecall.recallSource) === 'error') {
    gapWarnings.push('TEXTPLAY_MEMORY_RECALL_FAILED_WARN');
  }

  const memories = toMemoryTextList(memoryRecall);
  const startupPolicy = mergeStartupPolicyFromContext({
    contextStoryScope: storyScope,
  });
  const snapshotVersionSeed = JSON.stringify({
    storyId: input.storyId,
    entryEventId: input.detail.entryEventId,
    agentId: input.agentId,
    lorebookIds: scoredLorebooks.map((item) => item.id),
    sceneIds: scoredScenes.map((item) => item.id),
    contextIds: startupContextRows.map((item) => item.id),
    recallSource: toText(memoryRecall.recallSource),
  });

  return {
    storyId: input.storyId,
    worldId: input.detail.worldId,
    entryEventId: input.detail.entryEventId,
    entry: {
      title: input.detail.title,
      summary: input.detail.materialSummary || input.detail.summary,
      eventHorizon: input.detail.eventHorizon,
      entryMode: input.detail.entryMode,
      cause: input.detail.cause,
      process: input.detail.process,
      result: input.detail.result,
      timeRef: input.detail.timeRef,
      locationRefs: input.detail.locationRefs,
      characterRefs: input.detail.characterRefs,
      recommendedSceneId: input.detail.recommendedSceneId || toText(selectedScene?.id) || null,
    },
    cast: {
      primaryAgentId: input.agentId,
      participants: unique([input.agentId, ...input.detail.participants]),
    },
    background: {
      summary: buildBackgroundSummary(input.detail, toText(selectedScene?.description)),
    },
    materials: {
      lorebooks: scoredLorebooks,
      memories,
      scenes: scoredScenes,
      contexts: startupContextRows.map((row) => ({
        id: toText(row.id),
        scope: row.scope,
        scopeKey: toText(row.scopeKey),
        storyId: row.storyId ? toText(row.storyId) : null,
        narrativeSetting: row.narrativeSetting || {},
        narrativeState: row.narrativeState || {},
      })),
      recallSource: toText(memoryRecall.recallSource) || 'unknown',
    },
    narrativeScopes: {
      CANON: {
        ...canonRow.narrativeSetting,
        ...canonRow.narrativeState,
      },
      STORY: {
        ...storyRow.narrativeSetting,
        ...storyRow.narrativeState,
      },
      SUBJECT: subjectRow ? { ...subjectRow.narrativeSetting, ...subjectRow.narrativeState } : {},
      RELATION: relationRow ? { ...relationRow.narrativeSetting, ...relationRow.narrativeState } : {},
    },
    recommendedEntryTurn: null,
    startupPolicy,
    snapshot: {
      storyId: input.storyId,
      entryEventId: input.detail.entryEventId,
      primaryAgentId: input.agentId,
      version: hashString(snapshotVersionSeed),
      source: STARTUP_SOURCE,
      loadedAt: new Date().toISOString(),
      contextCoverage: {
        canon: Boolean(canonRow),
        story: Boolean(storyRow),
        subject: Boolean(subjectRow),
        relation: Boolean(relationRow),
        scene: Boolean(selectedScene),
      },
      gapWarnings,
    },
  };
}
