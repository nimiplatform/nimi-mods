import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { registerModTranslations } from "@nimiplatform/sdk/mod";
registerModTranslations('local-chat', 'en', enLocale as Record<string, unknown>);
registerModTranslations('local-chat', 'zh', zhLocale as Record<string, unknown>);
import { LOCAL_CHAT_MANIFEST } from './manifest.js';
import { LOCAL_CHAT_CAPABILITIES, LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL, LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST, LOCAL_CHAT_DATA_API_SESSIONS_DELETE, LOCAL_CHAT_DATA_API_SESSIONS_GET, LOCAL_CHAT_DATA_API_SESSIONS_LIST, LOCAL_CHAT_DATA_API_SESSIONS_UPSERT, LOCAL_CHAT_MOD_ID, LOCAL_CHAT_NAV_SLOT, LOCAL_CHAT_ROUTE_SLOT, LOCAL_CHAT_UI_SLOT, } from './contracts.js';
import { createLocalChatFlowId, emitLocalChatLog } from './logging.js';
import { createLocalChatRuntimeMod, createRuntimeMod } from './runtime-mod.js';
export * from './services/index.js';
export * from './data/index.js';
export { LOCAL_CHAT_CAPABILITIES, LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL, LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST, LOCAL_CHAT_DATA_API_SESSIONS_DELETE, LOCAL_CHAT_DATA_API_SESSIONS_GET, LOCAL_CHAT_DATA_API_SESSIONS_LIST, LOCAL_CHAT_DATA_API_SESSIONS_UPSERT, LOCAL_CHAT_MOD_ID, LOCAL_CHAT_NAV_SLOT, LOCAL_CHAT_ROUTE_SLOT, LOCAL_CHAT_UI_SLOT, createLocalChatRuntimeMod, createRuntimeMod, };
type ManifestValidationResult = {
    valid: boolean;
    issues: string[];
};
function validateLocalManifestShape(manifest: {
    id?: unknown;
    entry?: unknown;
    styles?: unknown;
    capabilities?: unknown;
}): ManifestValidationResult {
    const issues: string[] = [];
    if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
        issues.push('id-required');
    }
    if (typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
        issues.push('entry-required');
    }
    if (!Array.isArray(manifest.styles) || manifest.styles.length === 0) {
        issues.push('styles-required');
    }
    if (!Array.isArray(manifest.capabilities)) {
        issues.push('capabilities-array-required');
    }
    return {
        valid: issues.length === 0,
        issues,
    };
}
export function getManifest() {
    return LOCAL_CHAT_MANIFEST;
}
export function validateLocalChatManifest() {
    const flowId = createLocalChatFlowId('local-chat-manifest-validate');
    const startedAt = performance.now();
    emitLocalChatLog({
        level: 'debug',
        message: 'action:validate-local-chat-manifest:start',
        flowId,
        source: 'validateLocalChatManifest',
    });
    const result = validateLocalManifestShape(LOCAL_CHAT_MANIFEST);
    const issues = [...result.issues];
    emitLocalChatLog({
        level: result.valid ? 'info' : 'error',
        message: result.valid
            ? 'action:validate-local-chat-manifest:done'
            : 'action:validate-local-chat-manifest:failed',
        flowId,
        source: 'validateLocalChatManifest',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
        details: {
            valid: result.valid,
            issueCount: issues.length,
            issues,
        },
    });
    return result;
}
