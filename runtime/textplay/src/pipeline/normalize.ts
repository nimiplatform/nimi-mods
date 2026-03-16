import { TEXTPLAY_REASON } from '../contracts.js';
import type {
  NarrativeProjectionRenderInputResponse,
  NarrativeTurnResultUpsertResponse,
  NarrativeTurnByIdResponse,
  TextplayRenderRequest,
} from '../data/schemas.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayNormalizedRenderInput, TextplayProjectionEvent } from '../types.js';
import { hashString } from '../utils/hash.js';

function normalizeActorField(value: string | undefined): string {
  return String(value || '').trim();
}

function normalizeId(value: string | undefined): string {
  return String(value || '').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeEvent(event: NarrativeProjectionRenderInputResponse['events'][number]): TextplayProjectionEvent {
  const sourceEventIds = Array.isArray(event.sourceEventIds) && event.sourceEventIds.length > 0
    ? event.sourceEventIds
    : [event.eventId];

  const rawPayload = (event as Record<string, unknown>).payload;
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? (rawPayload as Record<string, unknown>)
    : {};

  const rawType = String((event as Record<string, unknown>).type || '').trim();

  return {
    eventId: event.eventId,
    type: rawType || 'scene-beat',
    visibility: event.visibility,
    content: String(event.content || '').trim(),
    payload,
    thinker: normalizeActorField(event.thinker),
    decider: normalizeActorField(event.decider),
    experiencer: normalizeActorField(event.experiencer),
    owner: normalizeActorField(event.owner),
    sourceEventIds,
  };
}

function extractPacingContext(metrics: Record<string, unknown>): {
  currentTension: number;
  tensionBand: 'HIGH' | 'MODERATE' | 'LOW';
} {
  const raw = Number(metrics?.tension);
  const currentTension = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5;
  const tensionBand = currentTension >= 0.7 ? 'HIGH' : currentTension >= 0.4 ? 'MODERATE' : 'LOW';
  return { currentTension, tensionBand };
}

function resolveTurnConsistency(input: {
  request: TextplayRenderRequest;
  upsertedTurn: NarrativeTurnResultUpsertResponse;
  turnById: NarrativeTurnByIdResponse;
  projection: NarrativeProjectionRenderInputResponse;
}): {
  storyId: string;
  turnId: string;
  userId: string;
  playerName: string;
  playerIdentity: string;
  agentId: string;
  triggerSource: TextplayRenderRequest['triggerSource'];
} {
  const {
    upsertedTurn,
    turnById,
    projection,
  } = input;

  const upsertStoryId = normalizeId(upsertedTurn.storyId);
  const turnStoryId = normalizeId(turnById.storyId);
  const projectionStoryId = normalizeId(projection.storyId);
  const requestStoryId = normalizeId(input.request.storyId);

  if (!upsertStoryId || !turnStoryId || !projectionStoryId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_STORY_ID_EMPTY',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  if (upsertStoryId !== turnStoryId || upsertStoryId !== projectionStoryId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_STORY_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const upsertTurnId = normalizeId(upsertedTurn.turnId);
  const turnByIdTurnId = normalizeId(turnById.turnId);
  const projectionTurnId = normalizeId(projection.turnId);

  if (!upsertTurnId || !turnByIdTurnId || !projectionTurnId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_TURN_ID_EMPTY',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  if (upsertTurnId !== turnByIdTurnId || upsertTurnId !== projectionTurnId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_TURN_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const projectionUserId = normalizeId(projection.player.id);
  const requestUserId = normalizeId(input.request.userId);
  const canonicalUserId = projectionUserId || requestUserId;
  if (!canonicalUserId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_USER_ID_EMPTY',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const projectionAgentId = normalizeId(projection.agent.id);
  const requestAgentId = normalizeId(input.request.agentId);
  const canonicalAgentId = projectionAgentId || requestAgentId;
  if (!canonicalAgentId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_AGENT_ID_EMPTY',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const projectionTriggerSource = projection.triggerSource;
  const turnTriggerSource = turnById.triggerSource;
  if (projectionTriggerSource && turnTriggerSource && projectionTriggerSource !== turnTriggerSource) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_TRIGGER_SOURCE_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const canonicalTriggerSource = projectionTriggerSource
    || turnTriggerSource
    || input.request.triggerSource;
  if (!canonicalTriggerSource) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Repair narrative identity binding and retry.',
      message: 'TEXTPLAY_TRIGGER_SOURCE_EMPTY',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const openingPayload = asRecord(asRecord(input.request.systemPayload).opening);
  const canonicalPlayerName = firstNonEmpty([
    projection.player.name,
    input.request.playerName,
    openingPayload.playerName,
  ]);
  const canonicalPlayerIdentity = firstNonEmpty([
    projection.player.identity,
    input.request.playerIdentity,
    openingPayload.playerIdentity,
    openingPayload.playerRole,
  ]);

  return {
    storyId: upsertStoryId || requestStoryId,
    turnId: upsertTurnId,
    userId: canonicalUserId,
    playerName: canonicalPlayerName,
    playerIdentity: canonicalPlayerIdentity,
    agentId: canonicalAgentId,
    triggerSource: canonicalTriggerSource as TextplayRenderRequest['triggerSource'],
  };
}

function assertContextComplete(input: {
  request: TextplayRenderRequest;
  projection: NarrativeProjectionRenderInputResponse;
  agentId: string;
}): {
  sceneSummary: string;
  agentSummary: string;
  worldStyleSummary: string;
} {
  const systemPayload = input.request.systemPayload || input.projection.systemPayload || null;
  const opening = asRecord(asRecord(systemPayload).opening);
  const fallbackEventContent = String(input.projection.events[0]?.content || '').trim();

  const sceneSummary = firstNonEmpty([
    input.projection.scene.summary,
    opening.background,
    opening.entrySummary,
    fallbackEventContent,
    `Scene anchored for ${normalizeId(input.request.storyId) || 'current story'}.`,
  ]);

  const agentSummary = firstNonEmpty([
    input.projection.agent.summary,
    opening.objective && `Objective: ${opening.objective}`,
    `Primary agent ${input.agentId || normalizeId(input.request.agentId) || 'active agent'}.`,
  ]);

  const worldStyleSummary = firstNonEmpty([
    input.projection.worldStyle.summary,
    opening.phase && opening.objective
      ? `Phase ${opening.phase}, objective ${opening.objective}.`
      : '',
    opening.instruction,
    'Narrative style follows canonical world rules.',
  ]);

  return {
    sceneSummary,
    agentSummary,
    worldStyleSummary,
  };
}

export function normalizeTextplayRenderInput(input: {
  promptLanguage: TextplayNormalizedRenderInput['promptLanguage'];
  storyLanguage: TextplayNormalizedRenderInput['storyLanguage'];
  request: TextplayRenderRequest;
  upsertedTurn: NarrativeTurnResultUpsertResponse;
  turnById: NarrativeTurnByIdResponse;
  projection: NarrativeProjectionRenderInputResponse;
}): {
  normalized: TextplayNormalizedRenderInput;
  sourceEventIds: string[];
  stepInputHash: string;
} {
  const consistency = resolveTurnConsistency(input);
  const contextSummary = assertContextComplete({
    request: input.request,
    projection: input.projection,
    agentId: consistency.agentId,
  });
  const systemPayload = input.request.systemPayload || input.projection.systemPayload || null;

  const projectionMetrics = input.projection.metrics as Record<string, unknown>;
  const pacingContext = extractPacingContext(projectionMetrics);

  const normalized: TextplayNormalizedRenderInput = {
    storyId: consistency.storyId,
    worldId: normalizeId(input.request.worldId),
    agentId: consistency.agentId,
    promptLanguage: input.promptLanguage,
    storyLanguage: input.storyLanguage,
    turnId: consistency.turnId,
    runId: normalizeId(input.request.runId),
    traceId: normalizeId(input.request.traceId),
    triggerSource: consistency.triggerSource,
    userId: consistency.userId,
    playerName: consistency.playerName,
    playerIdentity: consistency.playerIdentity,
    userMessage: String(input.request.userMessage || input.projection.userMessage || ''),
    systemPayload,
    sceneSummary: contextSummary.sceneSummary,
    agentSummary: contextSummary.agentSummary,
    worldStyleSummary: contextSummary.worldStyleSummary,
    events: input.projection.events.map(normalizeEvent),
    metrics: input.projection.metrics,
    pacingContext,
  };

  const sourceEventIds = Array.from(new Set(
    normalized.events.flatMap((event) => event.sourceEventIds.length > 0 ? event.sourceEventIds : [event.eventId]),
  ));

  const stepInputHash = hashString(JSON.stringify({
    storyId: normalized.storyId,
    worldId: normalized.worldId,
    agentId: normalized.agentId,
    promptLanguage: normalized.promptLanguage,
    storyLanguage: normalized.storyLanguage,
    turnId: normalized.turnId,
    triggerSource: normalized.triggerSource,
    userId: normalized.userId,
    playerName: normalized.playerName,
    playerIdentity: normalized.playerIdentity,
    userMessage: normalized.userMessage,
    systemPayload: normalized.systemPayload,
    events: normalized.events,
    metrics: normalized.metrics,
  }));

  return {
    normalized,
    sourceEventIds,
    stepInputHash,
  };
}
