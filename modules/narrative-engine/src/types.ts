import type { NARRATIVE_CONTEXT_SCOPES, NARRATIVE_SPINE_EVENT_TYPES, NARRATIVE_VISIBILITY_VALUES, NarrativeReasonCode, } from './contracts.js';
import { type RuntimeCanonicalCapability } from "@nimiplatform/sdk/mod";
export type NarrativeTriggerSource = 'UserTurn' | 'AgentInitiative' | 'SystemEvent';
export type NarrativeVisibility = (typeof NARRATIVE_VISIBILITY_VALUES)[number];
export type NarrativeSpineEventType = (typeof NARRATIVE_SPINE_EVENT_TYPES)[number];
export type NarrativeSpineEvent = {
    id: string;
    type: NarrativeSpineEventType;
    visibility: NarrativeVisibility;
    payload: Record<string, unknown>;
    sourceEventIds?: string[];
    thinker?: string;
    decider?: string;
    experiencer?: string;
    owner?: string;
};
export type NarrativeCoreOutput = {
    spineEvents: NarrativeSpineEvent[];
    stateChanges: Record<string, unknown>;
    metrics: Record<string, number>;
};
export type NarrativeContextScopes = Record<(typeof NARRATIVE_CONTEXT_SCOPES)[number], Record<string, unknown>>;
export type NarrativeContextSnapshot = {
    place: string;
    worldviewRules: string[];
    sceneMaterial: string[];
    availableActors: string[];
    narrativeStyle: Record<string, unknown>;
    characterRelations: Array<Record<string, unknown>>;
    phase: string;
    objective: string;
    tensionTarget: number;
    openThreads: string[];
    startupPolicy: Record<string, unknown>;
    futurePressure: string[];
    contextCoverage: {
        canon: boolean;
        story: boolean;
        subject: boolean;
        relation: boolean;
        scene: boolean;
        warnings: string[];
    };
    narrativeContextScopes: NarrativeContextScopes;
};
export type NarrativeTurnInput = {
    storyId: string;
    worldId: string;
    agentId: string;
    playerId: string;
    triggerSource: NarrativeTriggerSource;
    userMessage?: string;
    systemContext?: Record<string, unknown>;
    idempotencyKey?: string;
    capability?: RuntimeCanonicalCapability;
    binding?: Record<string, unknown>;
    turnId?: string;
    requestId?: string;
    traceId?: string;
    parentRunId?: string | null;
    runId?: string;
    taskId?: string;
    presence?: string;
    nowMs?: number;
    cancelRequested?: boolean;
    mockCoreOutput?: NarrativeCoreOutput;
};
export type NarrativeTurnInputNormalized = {
    storyId: string;
    worldId: string;
    agentId: string;
    playerId: string;
    triggerSource: NarrativeTriggerSource;
    userMessage: string;
    systemContext: Record<string, unknown>;
    idempotencyKey: string;
    capability: RuntimeCanonicalCapability;
    binding: Record<string, unknown>;
    turnId: string;
    requestId: string;
    traceId: string;
    parentRunId: string | null;
    runId: string;
    taskId: string;
    presence: string;
    nowMs: number;
    cancelRequested: boolean;
    mockCoreOutput: NarrativeCoreOutput | null;
    receivedAt: string;
};
export type NarrativeCheckStatus = 'APPROVED' | 'ADJUSTED' | 'REJECTED';
export type NarrativeGuardResult = {
    status: NarrativeCheckStatus;
    reasonCode: NarrativeReasonCode | null;
    actionHint: string;
    output: NarrativeCoreOutput | null;
    adjustmentReason: string | null;
};
export type NarrativeTurnStatus = NarrativeCheckStatus | 'NOOP' | 'CANCELED' | 'FAILED';
export type NarrativeRunState = 'RUNNING' | 'PAUSE_REQUESTED' | 'PAUSED' | 'CANCEL_REQUESTED' | 'CANCELED' | 'FAILED' | 'COMPLETED';
export type NarrativeRunEventType = 'run.start' | 'step.start' | 'step.chunk' | 'step.complete' | 'step.error' | 'run.complete' | 'run.error' | 'run.canceled';
export type NarrativeRunRetryClass = 'retryable' | 'non-retryable';
export type NarrativeRunEvent = {
    traceId: string;
    runId: string;
    parentRunId: string | null;
    stage: 'narrative-engine';
    step: string;
    eventType: NarrativeRunEventType;
    seq: number;
    attempt: number;
    timestamp: string;
    taskId?: string;
    idempotencyKey?: string;
    checkpointToken?: string;
    stepInputHash?: string;
    lastCompletedUnit?: string;
    reasonCode?: string;
    actionHint?: string;
    retryClass?: NarrativeRunRetryClass;
    details?: Record<string, unknown>;
};
export type NarrativeRunEnvelope = {
    traceId: string;
    runId: string;
    taskId: string;
    state: NarrativeRunState;
    eventType: NarrativeRunEventType;
    seq: number;
    attempt: number;
};
export type NarrativeProjectionEvent = {
    eventId: string;
    type: NarrativeSpineEventType;
    visibility: NarrativeVisibility;
    content: string;
    payload: Record<string, unknown>;
    sourceEventIds: string[];
    thinker?: string;
    decider?: string;
    experiencer?: string;
    owner?: string;
};
export type NarrativeAiTextRequest = {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    mode?: 'SCENE_TURN' | 'STORY';
    worldId?: string;
    agentId?: string;
    abortSignal?: AbortSignal;
    capability?: RuntimeCanonicalCapability;
    binding?: Record<string, unknown>;
};
export type NarrativeAiClient = {
    generateText: (payload: NarrativeAiTextRequest) => Promise<{
        text: string;
    }>;
};
export type NarrativeRenderInput = {
    turnId: string;
    storyId: string;
    triggerSource: NarrativeTriggerSource;
    userMessage: string;
    systemPayload?: Record<string, unknown>;
    systemContext: Record<string, unknown>;
    events: NarrativeProjectionEvent[];
    worldStyle: Record<string, unknown>;
    player: {
        id: string;
        name?: string;
    };
    scene: {
        place: string;
        summary: string;
    };
    agent: {
        id: string;
        summary: string;
    };
    playerAnchor: Record<string, unknown>;
    sceneAnchor: Record<string, unknown>;
    agentAnchor: Record<string, unknown>;
    metrics: Record<string, number>;
    sourceEventIds: string[];
};
export type NarrativeTurnRecord = {
    turnId: string;
    storyId: string;
    worldId: string;
    agentId: string;
    playerId: string;
    triggerSource: NarrativeTriggerSource;
    status: NarrativeTurnStatus;
    reasonCode: NarrativeReasonCode | null;
    actionHint: string;
    requestId: string;
    traceId: string;
    idempotencyKey: string;
    inputHash: string;
    runId: string;
    taskId: string;
    input: NarrativeTurnInputNormalized;
    contextSnapshot: NarrativeContextSnapshot | null;
    coreOutput: NarrativeCoreOutput | null;
    projection: NarrativeRenderInput | null;
    adjustmentReason: string | null;
    createdAt: string;
    updatedAt: string;
};
export type NarrativeTurnResponse = {
    status: NarrativeTurnStatus;
    reasonCode: NarrativeReasonCode | null;
    actionHint: string;
    traceId: string;
    turnId: string;
    storyId: string;
    runEnvelope: NarrativeRunEnvelope;
    coreOutput: NarrativeCoreOutput | null;
    projection: NarrativeRenderInput | null;
};
export type NarrativeReplayResult = {
    runId: string;
    afterSeq: number;
    gapRefillEvents: NarrativeRunEvent[];
    events: NarrativeRunEvent[];
    gapRefillApplied: boolean;
    nextAfterSeq: number;
};
export type NarrativeStoreState = {
    version: 1;
    contextsByStoryId: Record<string, NarrativeContextScopes>;
    turnsById: Record<string, NarrativeTurnRecord>;
    turnIdsByStoryId: Record<string, string[]>;
    latestTurnIdByStoryId: Record<string, string>;
    projectionsByTurnId: Record<string, NarrativeRenderInput>;
    spineByStoryId: Record<string, NarrativeSpineEvent[]>;
    auditEventsByRunId: Record<string, NarrativeRunEvent[]>;
    idempotencyByKey: Record<string, {
        turnId: string;
        inputHash: string;
        response: NarrativeTurnResponse;
    }>;
};
export type NarrativeStepResult<T> = {
    ok: boolean;
    reasonCode: NarrativeReasonCode | null;
    actionHint: string;
    value: T | null;
};
export type NarrativeRouteOptionsSnapshot = {
    capability?: RuntimeCanonicalCapability;
    selected: {
        source?: string;
        model?: string;
        connectorId?: string;
    };
};
