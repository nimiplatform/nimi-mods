import {
  TEXTPLAY_REASON,
} from '../contracts.js';
import type { NarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  NarrativeContextResolveRequestSchema,
  NarrativeContextResolveResponseSchema,
  NarrativeProjectionRenderInputRequestSchema,
  NarrativeProjectionRenderInputResponseSchema,
  NarrativeTurnResultUpsertRequestSchema,
  NarrativeTurnResultUpsertResponseSchema,
  NarrativeTurnByIdRequestSchema,
  NarrativeTurnByIdResponseSchema,
  type NarrativeContextResolveRequest,
  type NarrativeContextResolveResponse,
  type NarrativeProjectionRenderInputRequest,
  type NarrativeProjectionRenderInputResponse,
  type NarrativeTurnResultUpsertRequest,
  type NarrativeTurnResultUpsertResponse,
  type NarrativeTurnByIdRequest,
  type NarrativeTurnByIdResponse,
} from './schemas.js';
import { TextplayPipelineError } from '../pipeline/error.js';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function toContextMissingError(error: unknown, capability: string): TextplayPipelineError {
  return new TextplayPipelineError({
    reasonCode: TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL,
    actionHint: 'Complete scene, agent, and worldStyle summary.',
    message: `${capability}:${toErrorMessage(error)}`,
    stage: 'context',
    retryClass: 'non-retryable',
  });
}

function hasContextPayload(scopes: NarrativeContextResolveResponse['scopes']): boolean {
  return Object.keys(scopes.CANON).length > 0
    || Object.keys(scopes.STORY).length > 0
    || Object.keys(scopes.SUBJECT).length > 0
    || Object.keys(scopes.RELATION).length > 0;
}

function buildDefaultContextScopes(input: {
  storyId: string;
  worldId: string;
  agentId: string;
  playerId: string;
  systemPayload?: Record<string, unknown>;
}): NarrativeContextResolveRequest['scopes'] {
  return {
    CANON: {
      pacingPolicy: 'steady',
      initiativePolicy: 'player-led',
    },
    STORY: {
      storyId: input.storyId,
      worldId: input.worldId,
      phase: 'opening',
    },
    SUBJECT: {
      agentId: input.agentId,
      playerId: input.playerId,
      activeObjective: String(input.systemPayload?.activeObjective || 'respond to player action'),
    },
    RELATION: {
      pairKey: `${input.agentId}:${input.playerId}`,
      trust: 0.5,
    },
  };
}

export async function queryNarrativeContextResolve(input: {
  narrativeEngine: NarrativeEngineModule;
  request: NarrativeContextResolveRequest;
}): Promise<NarrativeContextResolveResponse> {
  const parsedRequest = NarrativeContextResolveRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedRequest.error.issues[0]?.message || 'TEXTPLAY_CONTEXT_RESOLVE_REQUEST_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const payload = await input.narrativeEngine.contextResolve(parsedRequest.data).catch((error) => {
    throw toContextMissingError(error, 'narrative.context.resolve');
  });

  const parsedResponse = NarrativeContextResolveResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedResponse.error.issues[0]?.message || 'TEXTPLAY_CONTEXT_RESOLVE_RESPONSE_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  return parsedResponse.data;
}

export async function ensureNarrativeContext(input: {
  narrativeEngine: NarrativeEngineModule;
  storyId: string;
  worldId: string;
  agentId: string;
  playerId: string;
  systemPayload?: Record<string, unknown>;
}): Promise<NarrativeContextResolveResponse> {
  const current = await queryNarrativeContextResolve({
    narrativeEngine: input.narrativeEngine,
    request: {
      storyId: input.storyId,
      action: 'resolve',
    },
  });
  if (hasContextPayload(current.scopes)) {
    return current;
  }

  return queryNarrativeContextResolve({
    narrativeEngine: input.narrativeEngine,
    request: {
      storyId: input.storyId,
      action: 'upsert',
      scopes: buildDefaultContextScopes({
        storyId: input.storyId,
        worldId: input.worldId,
        agentId: input.agentId,
        playerId: input.playerId,
        systemPayload: input.systemPayload,
      }),
    },
  });
}

export async function queryNarrativeTurnResultUpsert(input: {
  narrativeEngine: NarrativeEngineModule;
  request: NarrativeTurnResultUpsertRequest;
}): Promise<NarrativeTurnResultUpsertResponse> {
  const parsedRequest = NarrativeTurnResultUpsertRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedRequest.error.issues[0]?.message || 'TEXTPLAY_TURN_RESULT_UPSERT_REQUEST_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const payload = await input.narrativeEngine.turnResultUpsert(parsedRequest.data).catch((error) => {
    throw toContextMissingError(error, 'narrative.turn-result.upsert');
  });

  const parsedResponse = NarrativeTurnResultUpsertResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedResponse.error.issues[0]?.message || 'TEXTPLAY_TURN_RESULT_UPSERT_RESPONSE_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  return parsedResponse.data;
}

export async function queryNarrativeTurnById(input: {
  narrativeEngine: NarrativeEngineModule;
  request: NarrativeTurnByIdRequest;
}): Promise<NarrativeTurnByIdResponse> {
  const parsedRequest = NarrativeTurnByIdRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedRequest.error.issues[0]?.message || 'TEXTPLAY_TURN_BY_ID_REQUEST_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const payload = await input.narrativeEngine.turnById(parsedRequest.data).catch((error) => {
    throw toContextMissingError(error, 'narrative.turn.by-id');
  });

  const parsedResponse = NarrativeTurnByIdResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedResponse.error.issues[0]?.message || 'TEXTPLAY_TURN_BY_ID_RESPONSE_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  return parsedResponse.data;
}

export async function queryNarrativeProjectionRenderInput(input: {
  narrativeEngine: NarrativeEngineModule;
  request: NarrativeProjectionRenderInputRequest;
}): Promise<NarrativeProjectionRenderInputResponse> {
  const parsedRequest = NarrativeProjectionRenderInputRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsedRequest.error.issues[0]?.message || 'TEXTPLAY_PROJECTION_REQUEST_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  const payload = await input.narrativeEngine.projectionRenderInput(parsedRequest.data).catch((error) => {
    throw toContextMissingError(error, 'narrative.projection.render-input');
  });

  const parsed = NarrativeProjectionRenderInputResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
      actionHint: 'Complete player, userMessage, and events, then retry.',
      message: parsed.error.issues[0]?.message || 'TEXTPLAY_PROJECTION_RESPONSE_INVALID',
      stage: 'input',
      retryClass: 'non-retryable',
    });
  }

  return parsed.data;
}
