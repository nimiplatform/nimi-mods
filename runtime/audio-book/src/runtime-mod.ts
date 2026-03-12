import React, { Suspense } from 'react';
import { AUDIO_BOOK_CAPABILITIES, AUDIO_BOOK_MOD_ID, AUDIO_BOOK_NAV_SLOT, AUDIO_BOOK_ROUTE_SLOT, AUDIO_BOOK_TAB_ID, } from './contracts.js';
import { createAudioBookFlowId, emitAudioBookLog } from './logging.js';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { getPromptLocale, type RuntimeModRegistration, createHookClient } from "@nimiplatform/sdk/mod";
const LazyAudioBookPage = React.lazy(async () => {
    const module = await import('./audio-book-page.js');
    return { default: module.AudioBookPage };
});
export function createAudioBookRuntimeMod(): RuntimeModRegistration {
    return {
        modId: AUDIO_BOOK_MOD_ID,
        capabilities: [...AUDIO_BOOK_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(AUDIO_BOOK_MOD_ID, sdkRuntimeContext);
            const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
            const flowId = createAudioBookFlowId('audio-book-setup');
            const startedAt = performance.now();
            emitAudioBookLog({
                level: 'info',
                message: 'phase:setup:start',
                flowId,
                source: 'createAudioBookRuntimeMod.setup',
            });
            await hookClient.ui.register({
                slot: AUDIO_BOOK_NAV_SLOT,
                priority: 150,
                extension: {
                    type: 'nav-item',
                    tabId: AUDIO_BOOK_TAB_ID,
                    label: locale.nav.label,
                    badge: 'MOD',
                    icon: 'microphone',
                    strategy: 'append',
                },
            });
            await hookClient.ui.register({
                slot: AUDIO_BOOK_ROUTE_SLOT,
                priority: 150,
                extension: {
                    type: 'tab-page',
                    tabId: AUDIO_BOOK_TAB_ID,
                    strategy: 'append',
                    component: () => React.createElement(Suspense, {
                        fallback: React.createElement('div', { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' }, locale.nav.loading),
                    }, React.createElement(LazyAudioBookPage)),
                },
            });
            emitAudioBookLog({
                level: 'info',
                message: 'phase:setup:done',
                flowId,
                source: 'createAudioBookRuntimeMod.setup',
                costMs: Number((performance.now() - startedAt).toFixed(2)),
            });
        },
        teardown: async () => { },
    };
}
