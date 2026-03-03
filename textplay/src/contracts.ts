export const TEXTPLAY_MOD_ID = 'world.nimi.textplay';
export const TEXTPLAY_TAB_ID = 'mod:textplay';

export const TEXTPLAY_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const TEXTPLAY_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';
export const TEXTPLAY_DATA_API_WORLD_ACCESS_ME = 'data-api.world.access.me';
export const TEXTPLAY_DATA_API_WORLD_WORLDS_MINE = 'data-api.world.worlds.mine';
export const TEXTPLAY_DATA_API_WORLD_EVENTS_LIST = 'data-api.world.events.list';
export const TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST = 'data-api.world.lorebooks.list';
export const TEXTPLAY_DATA_API_WORLD_SCENES_LIST = 'data-api.world.scenes.list';
export const TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST = 'data-api.world.narrative-contexts.list';
export const TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY = 'data-api.core.agent.memory.recall.for-entity';
export const TEXTPLAY_DATA_API_RENDER_PERSIST = 'data-api.textplay.render.persist';

export const TEXTPLAY_CAPABILITIES = [
  'llm.text.generate',
  `data.query.${TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_ACCESS_ME}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_WORLDS_MINE}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_EVENTS_LIST}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_SCENES_LIST}`,
  `data.query.${TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST}`,
  `data.query.${TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY}`,
  `data.register.${TEXTPLAY_DATA_API_RENDER_PERSIST}`,
  `data.query.${TEXTPLAY_DATA_API_RENDER_PERSIST}`,
  `ui.register.${TEXTPLAY_NAV_SLOT}`,
  `ui.register.${TEXTPLAY_ROUTE_SLOT}`,
] as const;

export const TEXTPLAY_PERMISSIONS = [...TEXTPLAY_CAPABILITIES] as const;

export const TEXTPLAY_REASON = {
  INPUT_INVALID: 'TEXTPLAY_INPUT_INVALID',
  ROUTE_UNAVAILABLE: 'TEXTPLAY_ROUTE_UNAVAILABLE',
  PROMPT_BUILD_FAILED: 'TEXTPLAY_PROMPT_BUILD_FAILED',
  RENDER_EMPTY_RESPONSE: 'TEXTPLAY_RENDER_EMPTY_RESPONSE',
  POV_VIOLATION_DETECTED: 'TEXTPLAY_POV_VIOLATION_DETECTED',
  CONTEXT_MISSING_CRITICAL: 'TEXTPLAY_CONTEXT_MISSING_CRITICAL',
  PERSISTENCE_FAILED_WARN: 'TEXTPLAY_PERSISTENCE_FAILED_WARN',
  RUN_CANCELED: 'TEXTPLAY_RUN_CANCELED',
} as const;

export const TEXTPLAY_CHAIN_REASON = {
  NARRATIVE_REJECTED: 'CHAIN_NARRATIVE_REJECTED',
  RENDER_INPUT_INVALID: 'CHAIN_RENDER_INPUT_INVALID',
  ROUTE_UNAVAILABLE: 'CHAIN_RENDER_ROUTE_UNAVAILABLE',
  RENDER_FAILED: 'CHAIN_RENDER_FAILED',
} as const;

export const TEXTPLAY_STAGE = {
  RENDERER: 'renderer',
  TEXTPLAY: 'textplay',
} as const;

export type TextplayReasonCode = (typeof TEXTPLAY_REASON)[keyof typeof TEXTPLAY_REASON];
export type TextplayChainReasonCode = (typeof TEXTPLAY_CHAIN_REASON)[keyof typeof TEXTPLAY_CHAIN_REASON];
