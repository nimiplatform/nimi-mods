import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  TEST_AI_NAV_SLOT,
  TEST_AI_ROUTE_SLOT,
  TEST_AI_TAB_ID,
} from '../contracts.js';

const LazyTestAiPage = React.lazy(async () => {
  const module = await import('../test-ai-page.js');
  return { default: module.TestAiPage };
});

export async function registerTestAiUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;

  await hookClient.ui.register({
    slot: TEST_AI_NAV_SLOT,
    priority: 10,
    extension: {
      type: 'nav-item',
      tabId: TEST_AI_TAB_ID,
      label: 'Test AI',
      badge: 'TEST',
      icon: 'local-chat',
      strategy: 'append',
    },
  });

  await hookClient.ui.register({
    slot: TEST_AI_ROUTE_SLOT,
    priority: 10,
    extension: {
      type: 'tab-page',
      tabId: TEST_AI_TAB_ID,
      strategy: 'append',
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' },
            'Test AI loading...',
          ),
        },
        React.createElement(LazyTestAiPage),
      ),
    },
  });
}
