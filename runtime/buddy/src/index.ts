import { registerModTranslations } from '@nimiplatform/sdk/mod/i18n';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';

registerModTranslations('buddy', 'en', enLocale as Record<string, unknown>);
registerModTranslations('buddy', 'zh', zhLocale as Record<string, unknown>);

export { createBuddyRuntimeMod, createRuntimeMod } from './runtime-mod.js';
export { MOD_ID, MOD_CAPABILITIES } from './contracts.js';
