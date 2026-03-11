import { z } from 'zod';
import {
  NARRATIVE_CONTEXT_SCOPES,
} from './contracts.js';

function isRuntimeCanonicalCapability(value: unknown): boolean {
  const normalized = String(value || '').trim();
  return normalized === 'text.generate'
    || normalized === 'text.embed'
    || normalized === 'image.generate'
    || normalized === 'video.generate'
    || normalized === 'audio.synthesize'
    || normalized === 'audio.transcribe'
    || normalized === 'voice_workflow.tts_v2v'
    || normalized === 'voice_workflow.tts_t2v';
}

export const NarrativeTriggerSourceSchema = z.enum(['UserTurn', 'AgentInitiative', 'SystemEvent']);

export const NarrativeContextScopesSchema = z.object({
  CANON: z.record(z.string(), z.unknown()).default({}),
  STORY: z.record(z.string(), z.unknown()).default({}),
  SUBJECT: z.record(z.string(), z.unknown()).default({}),
  RELATION: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const NarrativeSpineEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  visibility: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  sourceEventIds: z.array(z.string().min(1)).optional(),
  thinker: z.string().optional(),
  decider: z.string().optional(),
  experiencer: z.string().optional(),
  owner: z.string().optional(),
}).strict();

export const NarrativeCoreOutputSchema = z.object({
  spineEvents: z.array(NarrativeSpineEventSchema),
  stateChanges: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.number().finite()),
}).strict();

export const NarrativeTurnInputSchema = z.object({
  storyId: z.string().min(1),
  worldId: z.string().min(1),
  agentId: z.string().min(1),
  playerId: z.string().min(1),
  triggerSource: NarrativeTriggerSourceSchema,
  userMessage: z.string().optional(),
  systemContext: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().min(1).optional(),
  capability: z.string().trim().optional().refine(
    (value) => !value || isRuntimeCanonicalCapability(value),
    'capability must be a runtime canonical capability',
  ),
  binding: z.record(z.string(), z.unknown()).optional(),
  turnId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  parentRunId: z.string().min(1).nullable().optional(),
  runId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  presence: z.string().optional(),
  nowMs: z.number().finite().optional(),
  cancelRequested: z.boolean().optional(),
  mockCoreOutput: NarrativeCoreOutputSchema.optional(),
}).strict();

export const NarrativeContextSnapshotSchema = z.object({
  place: z.string().min(1),
  worldviewRules: z.array(z.string()),
  sceneMaterial: z.array(z.string()),
  availableActors: z.array(z.string()),
  narrativeStyle: z.record(z.string(), z.unknown()),
  characterRelations: z.array(z.record(z.string(), z.unknown())),
  phase: z.string().min(1),
  objective: z.string().min(1),
  tensionTarget: z.number().finite(),
  openThreads: z.array(z.string()),
  startupPolicy: z.record(z.string(), z.unknown()),
  futurePressure: z.array(z.string()),
  contextCoverage: z.object({
    canon: z.boolean(),
    story: z.boolean(),
    subject: z.boolean(),
    relation: z.boolean(),
    scene: z.boolean(),
    warnings: z.array(z.string()),
  }),
  narrativeContextScopes: NarrativeContextScopesSchema,
}).strict();

export const NarrativeRunReplayQuerySchema = z.object({
  action: z.literal('replay'),
  runId: z.string().min(1),
  afterSeq: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(50),
}).passthrough();

export const NarrativeRunCancelQuerySchema = z.object({
  action: z.literal('cancel-run'),
  runId: z.string().min(1),
  traceId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
}).passthrough();

export const NarrativeAuditAppendQuerySchema = z.object({
  action: z.literal('append'),
  runId: z.string().min(1),
  event: z.record(z.string(), z.unknown()),
}).passthrough();

export const NarrativeContextResolveQuerySchema = z.object({
  storyId: z.string().min(1),
  action: z.enum(['resolve', 'upsert']).default('resolve'),
  scopes: NarrativeContextScopesSchema.optional(),
}).passthrough();

export const NarrativeTurnWindowQuerySchema = z.object({
  storyId: z.string().min(1),
  afterTurnId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).passthrough();

export const NarrativeTurnLatestQuerySchema = z.object({
  storyId: z.string().min(1),
}).passthrough();

export const NarrativeTurnByIdQuerySchema = z.object({
  turnId: z.string().min(1),
}).passthrough();

export const NarrativeProjectionQuerySchema = z.object({
  turnId: z.string().min(1).optional(),
  storyId: z.string().min(1).optional(),
}).passthrough().superRefine((value, ctx) => {
  if (!value.turnId && !value.storyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'turnId or storyId is required',
      path: ['turnId'],
    });
  }
});

export const NarrativeContextScopeNames = new Set<string>(NARRATIVE_CONTEXT_SCOPES);
