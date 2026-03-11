import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { DAILY_OUTFIT_NAV_SLOT, DAILY_OUTFIT_ROUTE_SLOT } from '../contracts.js';

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

  await hookClient.ui.register({
    slot: DAILY_OUTFIT_NAV_SLOT,
    priority: 120,
    extension: {
      type: 'nav-item',
      tabId: 'mod:daily-outfit',
      label: 'Daily Outfit',
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
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            {
              className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
            },
            'Daily Outfit loading...',
          ),
        },
        React.createElement(LazyDailyOutfitPage),
      ),
    },
  });
}
