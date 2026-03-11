import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_ROUTE_SLOT,
  TEXTPLAY_TAB_ID,
} from '../contracts.js';

const LazyTextplayPage = React.lazy(async () => {
  const module = await import('../textplay-page.js');
  return {
    default: module.TextplayPage,
  };
});

export async function registerTextplayUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;

  await hookClient.ui.register({
    slot: TEXTPLAY_NAV_SLOT,
    priority: 130,
    extension: {
      type: 'nav-item',
      tabId: TEXTPLAY_TAB_ID,
      label: 'TextPlay',
      badge: 'MOD',
      icon: 'textplay',
      strategy: 'append',
    },
  });

  await hookClient.ui.register({
    slot: TEXTPLAY_ROUTE_SLOT,
    priority: 130,
    extension: {
      type: 'tab-page',
      tabId: TEXTPLAY_TAB_ID,
      shellMode: 'immersive',
      strategy: 'append',
      modId: TEXTPLAY_MOD_ID,
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            {
              className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
            },
            'TextPlay is loading...',
          ),
        },
        React.createElement(LazyTextplayPage),
      ),
    },
  });
}
