import React, { Suspense } from 'react';
import { MINTYOU_NAV_SLOT, MINTYOU_ROUTE_SLOT, } from '../contracts.js';
import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';
import { getPromptLocale, type HookClient } from "@nimiplatform/sdk/mod";
const LazyMintYouPage = React.lazy(async () => {
    const module = await import('../ui/mint-you-page.js');
    return {
        default: module.MintYouPage,
    };
});
export async function registerMintYouUiExtensions(input: {
    hookClient: HookClient;
}): Promise<void> {
    const { hookClient } = input;
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
    await hookClient.ui.register({
        slot: MINTYOU_NAV_SLOT,
        priority: 110,
        extension: {
            type: 'nav-item',
            tabId: 'mod:mint-you',
            label: locale.nav.label,
            badge: 'MOD',
            icon: 'mint-you',
            strategy: 'append',
        },
    });
    await hookClient.ui.register({
        slot: MINTYOU_ROUTE_SLOT,
        priority: 110,
        extension: {
            type: 'tab-page',
            tabId: 'mod:mint-you',
            shellMode: 'immersive',
            strategy: 'append',
            component: () => React.createElement(Suspense, {
                fallback: React.createElement('div', {
                    className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                }, locale.nav.loading),
            }, React.createElement(LazyMintYouPage)),
        },
    });
}
