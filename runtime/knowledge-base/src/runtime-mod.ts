// ---------------------------------------------------------------------------
// RuntimeModRegistration — sidebar + route + data-api
// ---------------------------------------------------------------------------
import React, { Suspense } from 'react';
import { KB_CAPABILITIES, KB_MOD_ID, KB_NAV_SLOT, KB_ROUTE_SLOT, KB_TAB_ID, } from './contracts.js';
import { createKBFlowId, emitKBLog } from './logging.js';
import { registerKBDataCapabilities } from './registrars/data.js';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { getPromptLocale, type RuntimeModRegistration, createHookClient } from "@nimiplatform/sdk/mod";
const LazyKnowledgeBasePage = React.lazy(async () => {
    const module = await import('./knowledge-base-page.js');
    return { default: module.KnowledgeBasePage };
});
export function createKnowledgeBaseRuntimeMod(): RuntimeModRegistration {
    return {
        modId: KB_MOD_ID,
        capabilities: [...KB_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(KB_MOD_ID, sdkRuntimeContext);
            const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
            const flowId = createKBFlowId('setup');
            const startedAt = performance.now();
            emitKBLog({
                level: 'info',
                message: 'phase:setup:start',
                flowId,
                source: 'createKnowledgeBaseRuntimeMod.setup',
            });
            // Register sidebar nav item
            await hookClient.ui.register({
                slot: KB_NAV_SLOT,
                priority: 160,
                extension: {
                    type: 'nav-item',
                    tabId: KB_TAB_ID,
                    label: locale.nav.label,
                    badge: 'MOD',
                    icon: 'knowledge-base',
                    strategy: 'append',
                },
            });
            // Register route page
            await hookClient.ui.register({
                slot: KB_ROUTE_SLOT,
                priority: 160,
                extension: {
                    type: 'tab-page',
                    tabId: KB_TAB_ID,
                    strategy: 'append',
                    component: () => React.createElement(Suspense, {
                        fallback: React.createElement('div', { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' }, locale.nav.loading),
                    }, React.createElement(LazyKnowledgeBasePage)),
                },
            });
            // Register data-api capabilities for cross-mod integration
            await registerKBDataCapabilities({ hookClient });
            emitKBLog({
                level: 'info',
                message: 'phase:setup:done',
                flowId,
                source: 'createKnowledgeBaseRuntimeMod.setup',
                costMs: Number((performance.now() - startedAt).toFixed(2)),
            });
        },
        teardown: async () => { },
    };
}
