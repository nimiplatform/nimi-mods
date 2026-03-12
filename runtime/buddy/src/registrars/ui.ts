import React, { Suspense } from 'react';
import { MOD_ID, NAV_SLOT, ROUTE_SLOT, TAB_ID } from '../contracts.js';
import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';
import { getPromptLocale, type HookClient } from "@nimiplatform/sdk/mod";
const LazyBuddyPage = React.lazy(async () => {
    const module = await import('../buddy-page.js');
    return { default: module.BuddyPage };
});
export async function registerBuddyUiExtensions(input: {
    hookClient: HookClient;
}): Promise<void> {
    const { hookClient } = input;
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
    await hookClient.ui.register({
        slot: NAV_SLOT,
        priority: 120,
        extension: {
            type: 'nav-item',
            tabId: TAB_ID,
            label: locale.nav.label,
            badge: 'BUDDY',
            icon: 'buddy',
            strategy: 'append',
        },
    });
    await hookClient.ui.register({
        slot: ROUTE_SLOT,
        priority: 120,
        extension: {
            type: 'tab-page',
            tabId: TAB_ID,
            strategy: 'append',
            modId: MOD_ID,
            component: () => React.createElement(Suspense, {
                fallback: React.createElement('div', {
                    className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                }, locale.nav.loading),
            }, React.createElement(LazyBuddyPage)),
        },
    });
}
