import { registerModTranslations } from '@nimiplatform/sdk/mod';
import { enLocale } from './src/locales/en.js';
import { zhLocale } from './src/locales/zh.js';

registerModTranslations('music-score', 'en', enLocale as Record<string, unknown>);
registerModTranslations('music-score', 'zh', zhLocale as Record<string, unknown>);

export { createMusicScoreRuntimeMod as createRuntimeMod } from './src/runtime-mod.js';
export { MUSIC_SCORE_CAPABILITIES, MUSIC_SCORE_MOD_ID } from './src/contracts.js';
