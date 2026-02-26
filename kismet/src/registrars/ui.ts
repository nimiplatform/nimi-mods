import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
} from '../contracts.js';

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

  await hookClient.ui.register({
    slot: KISMET_NAV_SLOT,
    priority: 100,
    extension: {
      type: 'nav-item',
      tabId: 'mod:kismet',
      label: 'Kismet',
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
      strategy: 'append',
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            {
              className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
            },
            'Kismet loading...',
          ),
        },
        React.createElement(LazyKismetPage),
      ),
    },
  });
}
