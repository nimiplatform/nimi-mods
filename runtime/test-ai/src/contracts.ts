export const TEST_AI_MOD_ID = 'world.nimi.test-ai';
export const TEST_AI_TAB_ID = 'mod:test-ai';

export const TEST_AI_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const TEST_AI_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const TEST_AI_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.ai.text.embed',
  'runtime.media.image.generate',
  'runtime.media.jobs.submit',
  'runtime.media.jobs.get',
  'runtime.media.jobs.cancel',
  'runtime.media.jobs.subscribe',
  'runtime.media.jobs.get.artifacts',
  'runtime.media.video.generate',
  'runtime.media.tts.list.voices',
  'runtime.media.tts.synthesize',
  'runtime.media.stt.transcribe',
  'runtime.media.voice.clone',
  'runtime.media.voice.design',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.local.artifacts.list',
  'ui.register.ui-extension.app.sidebar.mods',
  'ui.register.ui-extension.app.content.routes',
] as const;
