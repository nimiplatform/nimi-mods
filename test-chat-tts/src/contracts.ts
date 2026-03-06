export const TEST_CHAT_TTS_MOD_ID = 'world.nimi.test-chat-tts';
export const TEST_CHAT_TTS_TAB_ID = 'mod:test-chat-tts';

export const TEST_CHAT_TTS_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const TEST_CHAT_TTS_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const TEST_CHAT_TTS_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.media.image.generate',
  'runtime.media.tts.list.voices',
  'runtime.media.tts.synthesize',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'ui.register.ui-extension.app.sidebar.mods',
  'ui.register.ui-extension.app.content.routes',
] as const;

export const TEST_CHAT_TTS_PERMISSIONS = [...TEST_CHAT_TTS_CAPABILITIES];
