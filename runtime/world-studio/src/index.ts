import React, { Suspense } from 'react';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { WORLD_STUDIO_CAPABILITIES, WORLD_STUDIO_MOD_ID, WORLD_STUDIO_NAV_SLOT, WORLD_STUDIO_ROUTE_SLOT, WORLD_STUDIO_TAB_ID, } from './contracts.js';
import { WORLD_STUDIO_MANIFEST } from './manifest.js';
import { createWorldStudioFlowId, emitWorldStudioLog } from './logging.js';
import { worldStudioMessage } from './i18n/messages.js';
import { getWorldStudioRuntimeClient, initializeWorldStudioRuntimeClient, resetWorldStudioRuntimeClient, } from './runtime-mod.js';
import { registerModTranslations, type RuntimeModRegistration, createHookClient, createModRuntimeClient } from "@nimiplatform/sdk/mod";
registerModTranslations('world-studio', 'en', enLocale as Record<string, unknown>);
registerModTranslations('world-studio', 'zh', zhLocale as Record<string, unknown>);
const LazyWorldStudioPage = React.lazy(async () => {
    const module = await import('./world-studio-page.js');
    return {
        default: module.WorldStudioPage,
    };
});
export * from './contracts.js';
export * from './data.js';
export { getWorldStudioRuntimeClient } from './runtime-mod.js';
export { runPhase1Extraction, runPhase1ExtractionFromChunks, runPhase2DraftGeneration, } from './generation/pipeline.js';
export function createWorldStudioRuntimeMod(): RuntimeModRegistration {
    return {
        modId: WORLD_STUDIO_MOD_ID,
        capabilities: [...WORLD_STUDIO_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(WORLD_STUDIO_MOD_ID, sdkRuntimeContext);
            const runtimeClient = createModRuntimeClient(WORLD_STUDIO_MOD_ID, sdkRuntimeContext);
            initializeWorldStudioRuntimeClient(runtimeClient);
            const flowId = createWorldStudioFlowId('world-studio-setup');
            const startedAt = performance.now();
            emitWorldStudioLog({
                level: 'info',
                message: 'phase:setup:start',
                flowId,
                source: 'createWorldStudioRuntimeMod.setup',
            });
            await hookClient.ui.register({
                slot: WORLD_STUDIO_NAV_SLOT,
                priority: 140,
                extension: {
                    type: 'nav-item',
                    tabId: WORLD_STUDIO_TAB_ID,
                    label: worldStudioMessage('page.title', 'World Studio'),
                    badge: 'MOD',
                    icon: 'globe',
                    strategy: 'append',
                },
            });
            await hookClient.ui.register({
                slot: WORLD_STUDIO_ROUTE_SLOT,
                priority: 140,
                extension: {
                    type: 'tab-page',
                    tabId: WORLD_STUDIO_TAB_ID,
                    shellMode: 'immersive',
                    strategy: 'append',
                    modId: WORLD_STUDIO_MOD_ID,
                    component: () => React.createElement(Suspense, {
                        fallback: React.createElement('div', {
                            className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                        }, worldStudioMessage('page.loading', 'World Studio is loading...')),
                    }, React.createElement(LazyWorldStudioPage)),
                },
            });
            emitWorldStudioLog({
                level: 'info',
                message: 'phase:setup:done',
                flowId,
                source: 'createWorldStudioRuntimeMod.setup',
                costMs: Number((performance.now() - startedAt).toFixed(2)),
            });
        },
        teardown: async () => {
            resetWorldStudioRuntimeClient();
        },
    };
}
export const createRuntimeMod = createWorldStudioRuntimeMod;
type ManifestValidationResult = {
    valid: boolean;
    issues: string[];
};
function validateWorldStudioManifestShape(manifest: {
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
    return WORLD_STUDIO_MANIFEST;
}
export function validateWorldStudioManifest() {
    const flowId = createWorldStudioFlowId('world-studio-manifest-validate');
    const startedAt = performance.now();
    const result = validateWorldStudioManifestShape(WORLD_STUDIO_MANIFEST);
    const issues = [...result.issues];
    emitWorldStudioLog({
        level: result.valid ? 'info' : 'error',
        message: result.valid
            ? 'action:validate-world-studio-manifest:done'
            : 'action:validate-world-studio-manifest:failed',
        flowId,
        source: 'validateWorldStudioManifest',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
        details: {
            valid: result.valid,
            issueCount: issues.length,
            issues,
        },
    });
    return result;
}
