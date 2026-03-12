import React, { Suspense } from 'react';
import { KISMET_NAV_SLOT, KISMET_ROUTE_SLOT, } from '../contracts.js';
import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';
import { getPromptLocale, type HookClient } from "@nimiplatform/sdk/mod";
const LazyKismetPage = React.lazy(async () => {
    const module = await import('../kismet-page.js');
    return {
        default: module.KismetPage,
    };
});
export async function registerKismetUiExtensions(input: {
    hookClient: HookClient;
}): Promise<void> {
    const { hookClient } = input;
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
    await hookClient.ui.register({
        slot: KISMET_NAV_SLOT,
        priority: 100,
        extension: {
            type: 'nav-item',
            tabId: 'mod:kismet',
            label: locale.nav.label,
            badge: 'MOD',
            icon: 'kismet',
            strategy: 'append',
        },
    });
    await hookClient.ui.register({
        slot: KISMET_ROUTE_SLOT,
        priority: 100,
        extension: {
            type: 'tab-page',
            tabId: 'mod:kismet',
            shellMode: 'immersive',
            strategy: 'append',
            component: () => React.createElement(Suspense, {
                fallback: React.createElement('div', {
                    className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                }, locale.nav.loading),
            }, React.createElement(LazyKismetPage)),
        },
    });
}
