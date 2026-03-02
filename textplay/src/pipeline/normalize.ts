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

function normalizeEvent(event: NarrativeProjectionRenderInputResponse['events'][number]): TextplayProjectionEvent {
  const sourceEventIds = Array.isArray(event.sourceEventIds) && event.sourceEventIds.length > 0
    ? event.sourceEventIds
    : [event.eventId];

  return {
    eventId: event.eventId,
    visibility: event.visibility,
    content: String(event.content || '').trim(),
    thinker: normalizeActorField(event.thinker),
    decider: normalizeActorField(event.decider),
    experiencer: normalizeActorField(event.experiencer),
    owner: normalizeActorField(event.owner),
    sourceEventIds,
  };
}

function assertTurnConsistency(input: {
  request: TextplayRenderRequest;
  upsertedTurn: NarrativeTurnResultUpsertResponse;
  turnById: NarrativeTurnByIdResponse;
  projection: NarrativeProjectionRenderInputResponse;
}): void {
  const {
    request,
    upsertedTurn,
    turnById,
    projection,
  } = input;

  if (upsertedTurn.storyId !== request.storyId || turnById.storyId !== request.storyId || projection.storyId !== request.storyId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: 'TEXTPLAY_STORY_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  if (upsertedTurn.turnId !== turnById.turnId || upsertedTurn.turnId !== projection.turnId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: 'TEXTPLAY_TURN_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  if (projection.player.id !== request.playerId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: 'TEXTPLAY_PLAYER_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const projectionAgentId = String(projection.agent.id || '').trim();
  if (projectionAgentId && projectionAgentId !== request.agentId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: 'TEXTPLAY_AGENT_ID_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  if (projection.triggerSource !== request.triggerSource) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: 'TEXTPLAY_TRIGGER_SOURCE_MISMATCH',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }
}

function assertContextComplete(input: {
  projection: NarrativeProjectionRenderInputResponse;
}): void {
  const sceneSummary = String(input.projection.scene.summary || '').trim();
  const agentSummary = String(input.projection.agent.summary || '').trim();
  const worldStyleSummary = String(input.projection.worldStyle.summary || '').trim();

  if (!sceneSummary || !agentSummary || !worldStyleSummary) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL,
      actionHint: 'Complete scene, agent, and worldStyle summary.',
      message: 'TEXTPLAY_CONTEXT_SUMMARY_INCOMPLETE',
      stage: 'context',
      retryClass: 'non-retryable',
    });
  }
}

export function normalizeTextplayRenderInput(input: {
  request: TextplayRenderRequest;
  upsertedTurn: NarrativeTurnResultUpsertResponse;
  turnById: NarrativeTurnByIdResponse;
  projection: NarrativeProjectionRenderInputResponse;
}): {
  normalized: TextplayNormalizedRenderInput;
  sourceEventIds: string[];
  stepInputHash: string;
} {
  assertTurnConsistency(input);
  assertContextComplete({ projection: input.projection });

  const normalized: TextplayNormalizedRenderInput = {
    storyId: input.request.storyId,
    worldId: input.request.worldId,
    agentId: input.request.agentId,
    turnId: input.upsertedTurn.turnId,
    runId: input.request.runId,
    traceId: input.request.traceId,
    triggerSource: input.projection.triggerSource,
    playerId: input.projection.player.id,
    userMessage: String(input.request.userMessage || input.projection.userMessage || ''),
    systemPayload: input.request.systemPayload || input.projection.systemPayload || null,
    sceneSummary: String(input.projection.scene.summary || '').trim(),
    agentSummary: String(input.projection.agent.summary || '').trim(),
    worldStyleSummary: String(input.projection.worldStyle.summary || '').trim(),
    events: input.projection.events.map(normalizeEvent),
    metrics: input.projection.metrics,
  };

  const sourceEventIds = Array.from(new Set(
    normalized.events.flatMap((event) => event.sourceEventIds.length > 0 ? event.sourceEventIds : [event.eventId]),
  ));

  const stepInputHash = hashString(JSON.stringify({
    storyId: normalized.storyId,
    worldId: normalized.worldId,
    agentId: normalized.agentId,
    turnId: normalized.turnId,
    triggerSource: normalized.triggerSource,
    playerId: normalized.playerId,
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
