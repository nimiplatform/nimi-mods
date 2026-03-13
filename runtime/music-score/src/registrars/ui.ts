import React, { Suspense } from 'react';
import { getPromptLocale, type HookClient } from '@nimiplatform/sdk/mod';
import { MUSIC_SCORE_NAV_SLOT, MUSIC_SCORE_ROUTE_SLOT, MUSIC_SCORE_TAB_ID } from '../contracts.js';
import { enLocale } from '../locales/en.js';
import { zhLocale } from '../locales/zh.js';

const LazyMusicScorePage = React.lazy(async () => {
    const module = await import('../music-score-page.js');
    return { default: module.MusicScorePage };
});

export async function registerMusicScoreUiExtensions(input: { hookClient: HookClient }): Promise<void> {
    const { hookClient } = input;
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;

    await hookClient.ui.register({
        slot: MUSIC_SCORE_NAV_SLOT,
        priority: 100,
        extension: {
            type: 'nav-item',
            tabId: MUSIC_SCORE_TAB_ID,
            label: locale.nav.label,
            badge: 'MOD',
            icon: 'music-score',
            strategy: 'append',
        },
    });

    await hookClient.ui.register({
        slot: MUSIC_SCORE_ROUTE_SLOT,
        priority: 100,
        extension: {
            type: 'tab-page',
            tabId: MUSIC_SCORE_TAB_ID,
            shellMode: 'immersive',
            strategy: 'append',
            component: () =>
                React.createElement(
                    Suspense,
                    {
                        fallback: React.createElement(
                            'div',
                            {
                                className:
                                    'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
                            },
                            locale.nav.loading,
                        ),
                    },
                    React.createElement(LazyMusicScorePage),
                ),
        },
    });
}
