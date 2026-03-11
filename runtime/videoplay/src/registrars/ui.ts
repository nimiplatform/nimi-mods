import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_NAV_SLOT,
  VIDEOPLAY_ROUTE_SLOT,
  VIDEOPLAY_TAB_ID,
} from '../contracts.js';

const LazyVideoPlayPage = React.lazy(async () => {
  const module = await import('../videoplay-page.js');
  return {
    default: module.VideoPlayPage,
  };
});

export async function registerVideoPlayUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  await input.hookClient.ui.register({
    slot: VIDEOPLAY_NAV_SLOT,
    priority: 130,
    extension: {
      type: 'nav-item',
      tabId: VIDEOPLAY_TAB_ID,
      label: 'VideoPlay',
      badge: 'MOD',
      icon: 'video',
      strategy: 'append',
    },
  });

  await input.hookClient.ui.register({
    slot: VIDEOPLAY_ROUTE_SLOT,
    priority: 130,
    extension: {
      type: 'tab-page',
      tabId: VIDEOPLAY_TAB_ID,
      strategy: 'append',
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            {
              className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
            },
            'VideoPlay loading...',
          ),
        },
        React.createElement(LazyVideoPlayPage),
      ),
    },
  });

  // Ensure registrations are scoped to this mod for host inspection tooling.
  void VIDEOPLAY_MOD_ID;
}
