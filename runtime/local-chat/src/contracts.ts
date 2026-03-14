export const LOCAL_CHAT_MOD_ID = 'world.nimi.local-chat';
export const LOCAL_CHAT_TAB_ID = 'mod:local-chat';

export const LOCAL_CHAT_UI_SLOT = 'ui-extension.runtime.devtools.panel';
export const LOCAL_CHAT_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const LOCAL_CHAT_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST = 'data-api.local-chat.chat-targets.list';
export const LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL = 'data-api.local-chat.chat-target.detail';
export const LOCAL_CHAT_DATA_API_SESSIONS_LIST = 'data-api.local-chat.sessions.list';
export const LOCAL_CHAT_DATA_API_SESSIONS_GET = 'data-api.local-chat.sessions.get';
export const LOCAL_CHAT_DATA_API_SESSIONS_UPSERT = 'data-api.local-chat.sessions.upsert';
export const LOCAL_CHAT_DATA_API_SESSIONS_DELETE = 'data-api.local-chat.sessions.delete';
export const LOCAL_CHAT_CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST = 'data-api.core.social.friends-with-details.list';
export const LOCAL_CHAT_CORE_DATA_API_USER_BY_ID_GET = 'data-api.core.user.by-id.get';
export const LOCAL_CHAT_CORE_DATA_API_USER_BY_HANDLE_GET = 'data-api.core.user.by-handle.get';
export const LOCAL_CHAT_CORE_DATA_API_WORLD_BY_ID_GET = 'data-api.core.world.by-id.get';
export const LOCAL_CHAT_CORE_DATA_API_WORLDVIEW_BY_ID_GET = 'data-api.core.worldview.by-id.get';
export const LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY = 'data-api.core.agent.memory.recall.for-entity';
export const LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_CORE_LIST = 'data-api.core.agent.memory.core.list';
export const LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_E2E_LIST = 'data-api.core.agent.memory.e2e.list';
export const LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_STATS_GET = 'data-api.core.agent.memory.stats.get';

export const LOCAL_CHAT_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.ai.text.stream',
  'runtime.media.image.generate',
  'runtime.media.video.generate',
  'runtime.media.tts.list.voices',
  'runtime.media.tts.stream',
  'runtime.media.tts.synthesize',
  'runtime.media.stt.transcribe',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.route.check.health',
  'storage.sqlite.query',
  'storage.sqlite.execute',
  `data.register.${LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST}`,
  `data.query.${LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST}`,
  `data.register.${LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL}`,
  `data.query.${LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL}`,
  `data.register.${LOCAL_CHAT_DATA_API_SESSIONS_LIST}`,
  `data.query.${LOCAL_CHAT_DATA_API_SESSIONS_LIST}`,
  `data.register.${LOCAL_CHAT_DATA_API_SESSIONS_GET}`,
  `data.query.${LOCAL_CHAT_DATA_API_SESSIONS_GET}`,
  `data.register.${LOCAL_CHAT_DATA_API_SESSIONS_UPSERT}`,
  `data.query.${LOCAL_CHAT_DATA_API_SESSIONS_UPSERT}`,
  `data.register.${LOCAL_CHAT_DATA_API_SESSIONS_DELETE}`,
  `data.query.${LOCAL_CHAT_DATA_API_SESSIONS_DELETE}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_USER_BY_ID_GET}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_USER_BY_HANDLE_GET}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_WORLD_BY_ID_GET}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_WORLDVIEW_BY_ID_GET}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_CORE_LIST}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_E2E_LIST}`,
  `data.query.${LOCAL_CHAT_CORE_DATA_API_AGENT_MEMORY_STATS_GET}`,
  `ui.register.${LOCAL_CHAT_NAV_SLOT}`,
  `ui.register.${LOCAL_CHAT_ROUTE_SLOT}`,
  `ui.register.${LOCAL_CHAT_UI_SLOT}`,
] as const;
