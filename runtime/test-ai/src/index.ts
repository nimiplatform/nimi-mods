import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { registerModTranslations } from "@nimiplatform/sdk/mod";
registerModTranslations('test-ai', 'en', enLocale as Record<string, unknown>);
registerModTranslations('test-ai', 'zh', zhLocale as Record<string, unknown>);
import { TEST_AI_CAPABILITIES, TEST_AI_MOD_ID, } from './contracts.js';
import { createRuntimeMod, createTestAiRuntimeMod, getTestAiRuntimeClient, } from './runtime-mod.js';
export { TEST_AI_CAPABILITIES, TEST_AI_MOD_ID, createRuntimeMod, createTestAiRuntimeMod, getTestAiRuntimeClient, };
