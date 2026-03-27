export const AGENT_CAPTURE_MOD_ID = 'world.nimi.agent-capture';
export const AGENT_CAPTURE_TAB_ID = 'mod:agent-capture';
export const AGENT_CAPTURE_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const AGENT_CAPTURE_ROUTE_SLOT = 'ui-extension.app.content.routes';
export const AGENT_CAPTURE_HANDOFF_CHANNEL = 'forge.agent-draft-handoff';
export const AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST = 'data-api.creator.agents.list';
export const AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET = 'data-api.creator.agents.get';

export const AGENT_CAPTURE_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.media.image.generate',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'storage.sqlite.query',
  'storage.sqlite.execute',
  'storage.files.read',
  'storage.files.write',
  `data.query.${AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST}`,
  `data.query.${AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET}`,
  `ui.register.${AGENT_CAPTURE_NAV_SLOT}`,
  `ui.register.${AGENT_CAPTURE_ROUTE_SLOT}`,
  `inter-mod.request.${AGENT_CAPTURE_HANDOFF_CHANNEL}`,
] as const;

export const AGENT_CAPTURE_STORAGE_NAMESPACE = 'agent-capture.snapshot';
export const AGENT_CAPTURE_STORAGE_KEY = 'current';
export const AGENT_CAPTURE_SESSION_STORAGE_NAMESPACE = 'agent-capture.session';
export const AGENT_CAPTURE_SESSION_STORAGE_KEY = 'current';
export const AGENT_CAPTURE_ROUTE_STORAGE_NAMESPACE = 'agent-capture.route-overrides';
export const AGENT_CAPTURE_ROUTE_STORAGE_KEY = 'current';
