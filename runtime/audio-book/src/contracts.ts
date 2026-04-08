export const AUDIO_BOOK_CONTRACT_VERSION = '2026-03-02';

export const AUDIO_BOOK_MOD_ID = 'world.nimi.audio-book';
export const AUDIO_BOOK_TAB_ID = 'mod:audio-book';

export const AUDIO_BOOK_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const AUDIO_BOOK_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const AUDIO_BOOK_CAPABILITIES = [
  'runtime.ai-config.get',
  'runtime.ai-config.update',
  'runtime.ai-config.subscribe',
  'runtime.ai-config.probe.scheduling.target',
  'runtime.ai-snapshot.record',
  'runtime.ai.text.generate',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.media.tts.list.voices',
  'runtime.media.tts.synthesize',
  'storage.sqlite.query',
  'storage.sqlite.execute',
  'storage.files.read',
  'storage.files.write',
  'storage.files.delete',
  'storage.files.list',
  `ui.register.${AUDIO_BOOK_NAV_SLOT}`,
  `ui.register.${AUDIO_BOOK_ROUTE_SLOT}`,
  'event.publish.ab:synthesis:progress',
  'event.subscribe.ab:synthesis:progress',
] as const;

export const AUDIO_BOOK_ERROR_CODES = {
  IMPORT_EMPTY_TEXT: 'AB_IMPORT_EMPTY_TEXT',
  IMPORT_TOO_LARGE: 'AB_IMPORT_TOO_LARGE',
  IMPORT_NO_CHAPTERS: 'AB_IMPORT_NO_CHAPTERS',
  ANALYSIS_CHAPTER_FAILED: 'AB_ANALYSIS_CHAPTER_FAILED',
  ANALYSIS_INVALID_OUTPUT: 'AB_ANALYSIS_INVALID_OUTPUT',
  ANALYSIS_CANCELLED: 'AB_ANALYSIS_CANCELLED',
  ANALYSIS_ALL_CHAPTERS_FAILED: 'AB_ANALYSIS_ALL_CHAPTERS_FAILED',
  ANALYSIS_NO_DIALOGUE: 'AB_ANALYSIS_NO_DIALOGUE',
  ANALYSIS_CHAPTER_TOO_LONG: 'AB_ANALYSIS_CHAPTER_TOO_LONG',
  CAST_VOICE_UNAVAILABLE: 'AB_CAST_VOICE_UNAVAILABLE',
  CAST_PREVIEW_FAILED: 'AB_CAST_PREVIEW_FAILED',
  CAST_MISSING: 'AB_CAST_MISSING',
  SYNTH_SEGMENT_FAILED: 'AB_SYNTH_SEGMENT_FAILED',
  SYNTH_PROVIDER_UNAVAILABLE: 'AB_SYNTH_PROVIDER_UNAVAILABLE',
  SYNTH_PROVIDER_RATE_LIMITED: 'AB_SYNTH_PROVIDER_RATE_LIMITED',
  SYNTH_TEXT_TOO_LONG: 'AB_SYNTH_TEXT_TOO_LONG',
  STORAGE_QUOTA_EXCEEDED: 'AB_STORAGE_QUOTA_EXCEEDED',
  STORAGE_WRITE_FAILED: 'AB_STORAGE_WRITE_FAILED',
  PLAY_AUDIO_LOAD_FAILED: 'AB_PLAY_AUDIO_LOAD_FAILED',
  PLAY_AUDIO_DECODE_FAILED: 'AB_PLAY_AUDIO_DECODE_FAILED',
} as const;

export type AudioBookErrorCode =
  typeof AUDIO_BOOK_ERROR_CODES[keyof typeof AUDIO_BOOK_ERROR_CODES];
