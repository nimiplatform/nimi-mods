import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { registerModTranslations } from "@nimiplatform/sdk/mod";
registerModTranslations('audio-book', 'en', enLocale as Record<string, unknown>);
registerModTranslations('audio-book', 'zh', zhLocale as Record<string, unknown>);
export { createAudioBookRuntimeMod } from './runtime-mod.js';
export { createAudioBookRuntimeMod as createRuntimeMod } from './runtime-mod.js';
export * from './contracts.js';
export type * from './types.js';
