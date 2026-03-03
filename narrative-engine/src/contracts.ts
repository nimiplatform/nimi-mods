export const NARRATIVE_ENGINE_MOD_ID = 'world.nimi.narrative-engine';

export const NARRATIVE_ENGINE_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';
export const NARRATIVE_ENGINE_DATA_API_WORLD_ACCESS_ME = 'data-api.world.access.me';
export const NARRATIVE_ENGINE_DATA_API_WORLD_EVENTS_LIST = 'data-api.world.events.list';
export const NARRATIVE_ENGINE_DATA_API_WORLD_LOREBOOKS_LIST = 'data-api.world.lorebooks.list';
export const NARRATIVE_ENGINE_DATA_API_WORLD_SCENES_LIST = 'data-api.world.scenes.list';
export const NARRATIVE_ENGINE_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST = 'data-api.world.narrative-contexts.list';
export const NARRATIVE_ENGINE_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY = 'data-api.core.agent.memory.recall.for-entity';

export const NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE = 'data-api.narrative.context.resolve';
export const NARRATIVE_ENGINE_DATA_API_TURN_WINDOW = 'data-api.narrative.turn.window';
export const NARRATIVE_ENGINE_DATA_API_TURN_LATEST = 'data-api.narrative.turn.latest';
export const NARRATIVE_ENGINE_DATA_API_TURN_BY_ID = 'data-api.narrative.turn.by-id';
export const NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT = 'data-api.narrative.projection.render-input';
export const NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT = 'data-api.narrative.turn-result.upsert';
export const NARRATIVE_ENGINE_DATA_API_SPINE_APPEND = 'data-api.narrative.spine.append';
export const NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND = 'data-api.narrative.audit.append';

export const NARRATIVE_CONTEXT_SCOPES = ['CANON', 'STORY', 'SUBJECT', 'RELATION'] as const;

export const NARRATIVE_VISIBILITY_VALUES = ['public', 'internal', 'sensory'] as const;

export const NARRATIVE_SPINE_EVENT_TYPES = ['scene-beat', 'dialogue', 'action', 'state-change'] as const;

export const NARRATIVE_REASON_CODES = {
  NARRATIVE_INPUT_INVALID: 'NARRATIVE_INPUT_INVALID',
  NARRATIVE_CONTEXT_INSUFFICIENT: 'NARRATIVE_CONTEXT_INSUFFICIENT',
  NARRATIVE_GENERATION_SCHEMA_INVALID: 'NARRATIVE_GENERATION_SCHEMA_INVALID',
  NARRATIVE_VISIBILITY_INVALID: 'NARRATIVE_VISIBILITY_INVALID',
  NARRATIVE_EVENT_COUNT_UNDERFLOW: 'NARRATIVE_EVENT_COUNT_UNDERFLOW',
  NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED: 'NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED',
  NARRATIVE_TENSION_JUMP_ADJUSTED: 'NARRATIVE_TENSION_JUMP_ADJUSTED',
  NARRATIVE_SEMANTIC_CONTRADICTION: 'NARRATIVE_SEMANTIC_CONTRADICTION',
  NARRATIVE_SPINE_WRITE_CONFLICT: 'NARRATIVE_SPINE_WRITE_CONFLICT',
  NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE: 'NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE',
  NARRATIVE_RUN_CANCELED: 'NARRATIVE_RUN_CANCELED',
} as const;

export type NarrativeReasonCode = typeof NARRATIVE_REASON_CODES[keyof typeof NARRATIVE_REASON_CODES];

export const NARRATIVE_ACTION_HINT_BY_REASON_CODE: Record<NarrativeReasonCode, string> = {
  NARRATIVE_INPUT_INVALID: 'Fix turn input fields and retry.',
  NARRATIVE_CONTEXT_INSUFFICIENT: 'Complete required context scopes and retry.',
  NARRATIVE_GENERATION_SCHEMA_INVALID: 'Repair CoreOutput schema contract and retry.',
  NARRATIVE_VISIBILITY_INVALID: 'Enforce visibility enum and retry.',
  NARRATIVE_EVENT_COUNT_UNDERFLOW: 'Raise minimum event output and retry.',
  NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED: 'Output is truncated and adjusted before commit.',
  NARRATIVE_TENSION_JUMP_ADJUSTED: 'Tension delta is too large and has been adjusted.',
  NARRATIVE_SEMANTIC_CONTRADICTION: 'Detected semantic contradiction against established spine; rewrite with additive progression.',
  NARRATIVE_SPINE_WRITE_CONFLICT: 'Resolve append conflict and retry.',
  NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE: 'Wait for cooldown window before next initiative tick.',
  NARRATIVE_RUN_CANCELED: 'Run is canceled. Resume from checkpoint or start a new run.',
};

export const NARRATIVE_GUARD_DEFAULTS = {
  minEvents: 1,
  maxEvents: 8,
  minMetric: 0,
  maxMetric: 1,
  maxTensionDelta: 0.45,
} as const;

export const NARRATIVE_INITIATIVE_DEFAULTS = {
  cooldownWindowSeconds: 180,
  maxConsecutive: 3,
  requireOpenThreadForInitiative: true,
  blockedPresenceStates: ['composing', 'active'] as const,
} as const;

export const NARRATIVE_STORE_KEY = 'nimi.narrative-engine.store.v1';
