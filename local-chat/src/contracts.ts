export const LOCAL_CHAT_MOD_ID = 'world.nimi.local-chat';

export const LOCAL_CHAT_UI_SLOT = 'ui-extension.runtime.devtools.panel';
export const LOCAL_CHAT_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const LOCAL_CHAT_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST = 'data-api.local-chat.chat-targets.list';
export const LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL = 'data-api.local-chat.chat-target.detail';
export const LOCAL_CHAT_DATA_API_SESSIONS_LIST = 'data-api.local-chat.sessions.list';
export const LOCAL_CHAT_DATA_API_SESSIONS_GET = 'data-api.local-chat.sessions.get';
export const LOCAL_CHAT_DATA_API_SESSIONS_UPSERT = 'data-api.local-chat.sessions.upsert';
export const LOCAL_CHAT_DATA_API_SESSIONS_DELETE = 'data-api.local-chat.sessions.delete';
export const LOCAL_CHAT_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';

export const LOCAL_CHAT_CAPABILITIES = [
  'llm.text.generate',
  'llm.text.stream',
  'llm.speech.providers.list',
  'llm.speech.voices.list',
  'llm.speech.synthesize',
  'llm.speech.stream.open',
  'llm.speech.stream.control',
  'llm.speech.stream.close',
  'llm.speech.transcribe',
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
  `data.query.${LOCAL_CHAT_DATA_API_RUNTIME_ROUTE_OPTIONS}`,
  `ui.register.${LOCAL_CHAT_NAV_SLOT}`,
  `ui.register.${LOCAL_CHAT_ROUTE_SLOT}`,
  `ui.register.${LOCAL_CHAT_UI_SLOT}`,
] as const;
