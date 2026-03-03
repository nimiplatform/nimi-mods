import { z } from 'zod';

export const NarrativeTriggerSourceSchema = z.enum([
  'UserTurn',
  'AgentInitiative',
  'SystemEvent',
]);

export const NarrativeTurnLatestRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  triggerSource: NarrativeTriggerSourceSchema,
  playerId: z.string().min(1),
  traceId: z.string().min(1),
  runId: z.string().min(1),
  userMessage: z.string().min(1).optional(),
  systemPayload: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, context) => {
  if (!value.userMessage && !value.systemPayload) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userMessage_or_systemPayload_required',
      path: ['userMessage'],
    });
  }
});

export const NarrativeTurnLatestResponseSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  traceId: z.string().min(1),
  runId: z.string().min(1).optional(),
  triggerSource: NarrativeTriggerSourceSchema.optional(),
  status: z.string().min(1).optional(),
  reasonCode: z.string().min(1).optional(),
  actionHint: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
}).passthrough();

export const NarrativeTurnLatestLookupRequestSchema = z.strictObject({
  storyId: z.string().min(1),
});

export const NarrativeTurnLatestLookupResponseSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  createdAt: z.string().min(1).optional(),
}).passthrough();

export const NarrativeTurnByIdRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  traceId: z.string().min(1),
});

export const NarrativeTurnByIdResponseSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  triggerSource: z.union([NarrativeTriggerSourceSchema, z.null()]).optional().transform((value) => value ?? undefined),
  createdAt: z.union([z.string(), z.null()]).optional().transform((value) => value ?? undefined),
}).passthrough();

export const NarrativeProjectionRenderInputRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  traceId: z.string().min(1),
});

const ProjectionVisibilitySchema = z.enum(['public', 'internal', 'sensory']);

export const NarrativeProjectionEventSchema = z.strictObject({
  eventId: z.string().min(1),
  visibility: ProjectionVisibilitySchema,
  content: z.string().min(1),
  thinker: z.string().optional(),
  decider: z.string().optional(),
  experiencer: z.string().optional(),
  owner: z.string().optional(),
  sourceEventIds: z.array(z.string().min(1)).optional(),
}).passthrough();

export const NarrativeProjectionRenderInputResponseSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  triggerSource: NarrativeTriggerSourceSchema.optional(),
  player: z.strictObject({
    id: z.string().optional(),
    name: z.string().optional(),
  }).catch({}),
  userMessage: z.string().optional(),
  systemPayload: z.union([z.record(z.string(), z.unknown()), z.null()]).optional().transform((value) => value ?? undefined),
  scene: z.strictObject({
    summary: z.string().optional(),
  }).catch({}),
  agent: z.strictObject({
    id: z.string().optional(),
    summary: z.string().optional(),
  }).catch({}),
  worldStyle: z.strictObject({
    summary: z.string().optional(),
  }).catch({}),
  events: z.array(NarrativeProjectionEventSchema).catch([]),
  metrics: z.record(z.string(), z.unknown()).catch({}),
}).passthrough();

export const NarrativeContextScopesSchema = z.strictObject({
  CANON: z.record(z.string(), z.unknown()).default({}),
  STORY: z.record(z.string(), z.unknown()).default({}),
  SUBJECT: z.record(z.string(), z.unknown()).default({}),
  RELATION: z.record(z.string(), z.unknown()).default({}),
});

export const NarrativeContextResolveRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  action: z.enum(['resolve', 'upsert']).default('resolve'),
  scopes: NarrativeContextScopesSchema.optional(),
}).passthrough();

export const NarrativeContextResolveResponseSchema = z.strictObject({
  storyId: z.string().min(1),
  scopes: NarrativeContextScopesSchema,
}).passthrough();

export const NarrativeTurnResultUpsertRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  worldId: z.string().min(1),
  agentId: z.string().min(1),
  playerId: z.string().min(1),
  triggerSource: NarrativeTriggerSourceSchema,
  userMessage: z.string().optional(),
  systemContext: z.record(z.string(), z.unknown()).optional(),
  routeOverride: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (!value.userMessage && !value.systemContext) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userMessage_or_systemContext_required',
      path: ['userMessage'],
    });
  }
});

export const NarrativeTurnResultUpsertResponseSchema = z.strictObject({
  status: z.enum(['APPROVED', 'ADJUSTED', 'REJECTED', 'NOOP', 'CANCELED', 'FAILED']),
  reasonCode: z.string().min(1).nullable().optional(),
  actionHint: z.string().min(1),
  traceId: z.string().min(1),
  turnId: z.string().min(1),
  storyId: z.string().min(1),
}).passthrough();

export const TextplayWorldMineRowSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().optional(),
  status: z.string().optional(),
  description: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const TextplayWorldMineListResponseSchema = z.union([
  z.array(TextplayWorldMineRowSchema),
  z.strictObject({
    items: z.array(TextplayWorldMineRowSchema),
  }).passthrough(),
]);

export const TextplayWorldEventRowSchema = z.strictObject({
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
  dependsOnEventIds: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.unknown()).optional(),
  confidence: z.number().optional(),
  needsEvidence: z.boolean().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const TextplayWorldEventListResponseSchema = z.union([
  z.array(TextplayWorldEventRowSchema),
  z.strictObject({
    worldId: z.string().optional(),
    items: z.array(TextplayWorldEventRowSchema),
  }).passthrough(),
]);

export const TextplayWorldLorebookRowSchema = z.strictObject({
  id: z.string().min(1),
  worldId: z.string().optional(),
  key: z.string(),
  name: z.string().optional(),
  content: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  value: z.record(z.string(), z.unknown()).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  updatedAt: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();

export const TextplayWorldLorebookListResponseSchema = z.union([
  z.array(TextplayWorldLorebookRowSchema),
  z.strictObject({
    worldId: z.string().optional(),
    items: z.array(TextplayWorldLorebookRowSchema),
  }).passthrough(),
]);

export const TextplayWorldSceneRowSchema = z.strictObject({
  id: z.string().min(1),
  worldId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  setting: z.record(z.string(), z.unknown()).optional(),
  activeEntities: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const TextplayWorldSceneListResponseSchema = z.union([
  z.array(TextplayWorldSceneRowSchema),
  z.strictObject({
    worldId: z.string().optional(),
    items: z.array(TextplayWorldSceneRowSchema),
  }).passthrough(),
]);

export const TextplayWorldNarrativeContextRowSchema = z.strictObject({
  id: z.string().min(1),
  worldId: z.string().optional(),
  scope: z.enum(['CANON', 'STORY', 'SUBJECT', 'RELATION']),
  scopeKey: z.string().min(1),
  storyId: z.string().nullable().optional(),
  subjectType: z.enum(['AGENT', 'PLAYER', 'FACTION']).nullable().optional(),
  subjectId: z.string().nullable().optional(),
  targetSubjectType: z.enum(['AGENT', 'PLAYER', 'FACTION']).nullable().optional(),
  targetSubjectId: z.string().nullable().optional(),
  narrativeSetting: z.record(z.string(), z.unknown()).default({}),
  narrativeState: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().optional(),
}).passthrough();

export const TextplayWorldNarrativeContextListResponseSchema = z.union([
  z.array(TextplayWorldNarrativeContextRowSchema),
  z.strictObject({
    worldId: z.string().optional(),
    items: z.array(TextplayWorldNarrativeContextRowSchema),
  }).passthrough(),
]);

export const TextplayMemoryRecallResponseSchema = z.strictObject({
  items: z.array(z.unknown()).default([]),
  core: z.array(z.unknown()).default([]),
  e2e: z.array(z.unknown()).default([]),
  recallSource: z.string().optional(),
}).passthrough();

const PersistRunEventSchema = z.strictObject({
  traceId: z.string().min(1),
  runId: z.string().min(1),
  stage: z.literal('textplay'),
  step: z.string().min(1),
  eventType: z.enum([
    'run.start',
    'step.start',
    'step.chunk',
    'step.complete',
    'step.error',
    'run.complete',
    'run.error',
    'run.canceled',
  ]),
  seq: z.number().int().min(1),
  attempt: z.number().int().min(1),
  timestamp: z.string().min(1),
  reasonCode: z.string().optional(),
  actionHint: z.string().optional(),
  retryClass: z.enum(['retryable', 'non-retryable']).optional(),
  idempotencyKey: z.string().optional(),
  checkpointToken: z.string().optional(),
  stepInputHash: z.string().optional(),
  lastCompletedUnit: z.string().optional(),
  parentRunId: z.string().nullable().optional(),
  taskId: z.string().optional(),
});

const PersistWarningSchema = z.strictObject({
  code: z.string().min(1),
  stage: z.string().min(1),
  actionHint: z.string().min(1),
  message: z.string().min(1),
  at: z.string().min(1),
});

const PersistPresenceReportSchema = z.strictObject({
  id: z.string().min(1),
  at: z.string().min(1),
  fromState: z.enum(['composing', 'paused', 'active', 'idle', 'away']),
  toState: z.enum(['composing', 'paused', 'active', 'idle', 'away']),
  event: z.string().min(1),
});

const PersistRunSnapshotSchema = z.strictObject({
  status: z.enum(['RUNNING', 'PAUSE_REQUESTED', 'PAUSED', 'CANCEL_REQUESTED', 'CANCELED', 'FAILED', 'COMPLETED']),
  lastSeq: z.number().int().min(0),
  lastCompletedStep: z.string().min(1),
  checkpointToken: z.string().min(1),
  stepInputHash: z.string().min(1),
  lastCompletedUnit: z.string().min(1),
  gapRefillApplied: z.boolean(),
  terminalEventType: z.enum([
    'run.start',
    'step.start',
    'step.chunk',
    'step.complete',
    'step.error',
    'run.complete',
    'run.error',
    'run.canceled',
  ]).optional(),
});

const PersistRouteSchema = z.strictObject({
  source: z.string().min(1),
  connectorId: z.string(),
  model: z.string().min(1),
  // token-api route metadata can omit concrete endpoint in some connectors.
  provider: z.string(),
  endpoint: z.string(),
});

const PersistMetaSchema = z.strictObject({
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  runId: z.string().min(1),
  traceId: z.string().min(1),
  promptTraceId: z.string().min(1),
  route: PersistRouteSchema,
  sourceEventIds: z.array(z.string().min(1)),
  warnings: z.array(PersistWarningSchema),
  presenceReports: z.array(PersistPresenceReportSchema),
  runSnapshot: PersistRunSnapshotSchema,
  chainReasonCode: z.string().optional(),
});

const PersistRecordInputSchema = z.strictObject({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  storyId: z.string().min(1),
  turnId: z.string().min(1),
  runId: z.string().min(1),
  traceId: z.string().min(1),
  triggerSource: NarrativeTriggerSourceSchema,
  playerId: z.string().min(1),
  userMessage: z.string(),
  systemPayload: z.record(z.string(), z.unknown()).nullable(),
  text: z.string(),
  meta: PersistMetaSchema,
  runEvents: z.array(PersistRunEventSchema),
  runSnapshot: PersistRunSnapshotSchema,
  warnings: z.array(PersistWarningSchema),
  presenceReports: z.array(PersistPresenceReportSchema),
});

export const TextplayPersistQuerySchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('upsert'),
    record: PersistRecordInputSchema,
  }),
  z.strictObject({
    op: z.literal('getByTurn'),
    storyId: z.string().min(1),
    turnId: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal('getRun'),
    runId: z.string().min(1),
    afterSeq: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  z.strictObject({
    op: z.literal('listByStory'),
    storyId: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
  }),
]);

export const TextplayRenderRequestSchema = z.strictObject({
  storyId: z.string().min(1),
  worldId: z.string().min(1),
  agentId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().optional(),
  triggerSource: NarrativeTriggerSourceSchema,
  userMessage: z.string().optional(),
  systemPayload: z.record(z.string(), z.unknown()).optional(),
  routeOverride: z.record(z.string(), z.unknown()).optional(),
  runId: z.string().min(1),
  traceId: z.string().min(1),
}).superRefine((value, context) => {
  if (!value.userMessage && !value.systemPayload) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userMessage_or_systemPayload_required',
      path: ['userMessage'],
    });
  }
});

export type NarrativeTurnLatestRequest = z.infer<typeof NarrativeTurnLatestRequestSchema>;
export type NarrativeTurnLatestResponse = z.infer<typeof NarrativeTurnLatestResponseSchema>;
export type NarrativeTurnLatestLookupRequest = z.infer<typeof NarrativeTurnLatestLookupRequestSchema>;
export type NarrativeTurnLatestLookupResponse = z.infer<typeof NarrativeTurnLatestLookupResponseSchema>;
export type NarrativeTurnByIdRequest = z.infer<typeof NarrativeTurnByIdRequestSchema>;
export type NarrativeTurnByIdResponse = z.infer<typeof NarrativeTurnByIdResponseSchema>;
export type NarrativeProjectionRenderInputRequest = z.infer<typeof NarrativeProjectionRenderInputRequestSchema>;
export type NarrativeProjectionRenderInputResponse = z.infer<typeof NarrativeProjectionRenderInputResponseSchema>;
export type NarrativeContextScopes = z.infer<typeof NarrativeContextScopesSchema>;
export type NarrativeContextResolveRequest = z.infer<typeof NarrativeContextResolveRequestSchema>;
export type NarrativeContextResolveResponse = z.infer<typeof NarrativeContextResolveResponseSchema>;
export type NarrativeTurnResultUpsertRequest = z.infer<typeof NarrativeTurnResultUpsertRequestSchema>;
export type NarrativeTurnResultUpsertResponse = z.infer<typeof NarrativeTurnResultUpsertResponseSchema>;
export type TextplayWorldMineRow = z.infer<typeof TextplayWorldMineRowSchema>;
export type TextplayWorldMineListResponse = z.infer<typeof TextplayWorldMineListResponseSchema>;
export type TextplayWorldEventRow = z.infer<typeof TextplayWorldEventRowSchema>;
export type TextplayWorldEventListResponse = z.infer<typeof TextplayWorldEventListResponseSchema>;
export type TextplayWorldLorebookRow = z.infer<typeof TextplayWorldLorebookRowSchema>;
export type TextplayWorldLorebookListResponse = z.infer<typeof TextplayWorldLorebookListResponseSchema>;
export type TextplayWorldSceneRow = z.infer<typeof TextplayWorldSceneRowSchema>;
export type TextplayWorldSceneListResponse = z.infer<typeof TextplayWorldSceneListResponseSchema>;
export type TextplayWorldNarrativeContextRow = z.infer<typeof TextplayWorldNarrativeContextRowSchema>;
export type TextplayWorldNarrativeContextListResponse = z.infer<typeof TextplayWorldNarrativeContextListResponseSchema>;
export type TextplayMemoryRecallResponse = z.infer<typeof TextplayMemoryRecallResponseSchema>;
export type TextplayPersistQuery = z.infer<typeof TextplayPersistQuerySchema>;
export type TextplayRenderRequest = z.infer<typeof TextplayRenderRequestSchema>;
