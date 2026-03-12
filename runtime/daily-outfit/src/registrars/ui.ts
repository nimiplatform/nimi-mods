import React, { Suspense } from 'react';
import { DAILY_OUTFIT_NAV_SLOT, DAILY_OUTFIT_ROUTE_SLOT } from '../contracts.js';
import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';
import { getPromptLocale, type HookClient } from "@nimiplatform/sdk/mod";
const LazyDailyOutfitPage = React.lazy(async () => {
    const module = await import('../ui/daily-outfit-page.js');
    return {
        default: module.DailyOutfitPage,
    };
});
export async function registerDailyOutfitUiExtensions(input: {
    hookClient: HookClient;
}): Promise<void> {
    const { hookClient } = input;
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
    await hookClient.ui.register({
        slot: DAILY_OUTFIT_NAV_SLOT,
        priority: 120,
        extension: {
            type: 'nav-item',
            tabId: 'mod:daily-outfit',
            label: locale.nav.label,
            badge: 'MOD',
            icon: 'daily-outfit',
            strategy: 'append',
        },
    });
    await hookClient.ui.register({
        slot: DAILY_OUTFIT_ROUTE_SLOT,
        priority: 120,
        extension: {
            type: 'tab-page',
            tabId: 'mod:daily-outfit',
            strategy: 'append',
            component: () => React.createElement(Suspense, {
                fallback: React.createElement('div', {
                    className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                }, locale.nav.loading),
            }, React.createElement(LazyDailyOutfitPage)),
        },
    });
}
