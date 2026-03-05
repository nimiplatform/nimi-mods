import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  TEST_CHAT_TTS_NAV_SLOT,
  TEST_CHAT_TTS_ROUTE_SLOT,
  TEST_CHAT_TTS_TAB_ID,
} from '../contracts.js';

const LazyTestChatTtsPage = React.lazy(async () => {
  const module = await import('../test-chat-tts-page.js');
  return { default: module.TestChatTtsPage };
});

export async function registerTestChatTtsUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;

  await hookClient.ui.register({
    slot: TEST_CHAT_TTS_NAV_SLOT,
    priority: 10,
    extension: {
      type: 'nav-item',
      tabId: TEST_CHAT_TTS_TAB_ID,
      label: 'Test Chat+Image+TTS',
      badge: 'TEST',
      icon: 'local-chat',
      strategy: 'append',
    },
  });

  await hookClient.ui.register({
    slot: TEST_CHAT_TTS_ROUTE_SLOT,
    priority: 10,
    extension: {
      type: 'tab-page',
      tabId: TEST_CHAT_TTS_TAB_ID,
      strategy: 'append',
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' },
            'Test Chat+Image+TTS loading...',
          ),
        },
        React.createElement(LazyTestChatTtsPage),
      ),
    },
  });
}
