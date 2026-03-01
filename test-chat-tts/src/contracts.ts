export const TEST_CHAT_TTS_MOD_ID = 'world.nimi.test-chat-tts';
export const TEST_CHAT_TTS_TAB_ID = 'mod:test-chat-tts';
export const TEST_CHAT_TTS_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';

export const TEST_CHAT_TTS_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const TEST_CHAT_TTS_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const TEST_CHAT_TTS_CAPABILITIES = [
  'llm.text.generate',
  'llm.speech.providers.list',
  'llm.speech.voices.list',
  'llm.speech.synthesize',
  'data.query.data-api.runtime.route.options',
  'ui.register.ui-extension.app.sidebar.mods',
  'ui.register.ui-extension.app.content.routes',
] as const;

export const TEST_CHAT_TTS_PERMISSIONS = [...TEST_CHAT_TTS_CAPABILITIES];
