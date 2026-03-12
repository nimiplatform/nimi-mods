import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { registerModTranslations } from "@nimiplatform/sdk/mod";
registerModTranslations('knowledge-base', 'en', enLocale as Record<string, unknown>);
registerModTranslations('knowledge-base', 'zh', zhLocale as Record<string, unknown>);
export { createKnowledgeBaseRuntimeMod } from './runtime-mod.js';
export { createKnowledgeBaseRuntimeMod as createRuntimeMod } from './runtime-mod.js';
export * from './contracts.js';
export type * from './types.js';
