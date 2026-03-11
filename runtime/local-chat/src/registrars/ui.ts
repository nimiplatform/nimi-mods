import React, { Suspense } from 'react';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
  LOCAL_CHAT_MOD_ID,
  LOCAL_CHAT_NAV_SLOT,
  LOCAL_CHAT_ROUTE_SLOT,
  LOCAL_CHAT_UI_SLOT,
} from '../contracts.js';

const LazyLocalChatPage = React.lazy(async () => {
  const module = await import('../local-chat-page.js');
  return {
    default: module.LocalChatPage,
  };
});

export async function registerLocalChatUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;
  await hookClient.ui.register({
    slot: LOCAL_CHAT_UI_SLOT,
    priority: 100,
    extension: {
      type: 'query-panel',
      modId: LOCAL_CHAT_MOD_ID,
      title: 'Local Chat',
      description: 'Agent friend target picker for chat route driven local-chat',
      queries: [
        {
          id: 'chat-targets',
          label: 'Load Chat Targets',
          capability: LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
          query: {},
          autoload: true,
        },
      ],
      actions: [
        {
          id: 'select-chat-target',
          label: 'Use Selected Chat Target',
          type: 'set-fields-from-query-selection',
          queryId: 'chat-targets',
          defaults: {
            targetType: 'AGENT',
            mode: 'STORY',
          },
          bindings: {
            agentId: 'id',
            worldId: 'worldId',
          },
        },
      ],
    },
  });

  await hookClient.ui.register({
    slot: LOCAL_CHAT_NAV_SLOT,
    priority: 100,
    extension: {
      type: 'nav-item',
      tabId: 'mod:local-chat',
      label: 'Local Chat',
      badge: 'MOD',
      icon: 'local-chat',
      strategy: 'append',
    },
  });

  await hookClient.ui.register({
    slot: LOCAL_CHAT_ROUTE_SLOT,
    priority: 100,
    extension: {
      type: 'tab-page',
      tabId: 'mod:local-chat',
      shellMode: 'immersive',
      strategy: 'append',
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            {
              className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600',
            },
            'Local Chat loading...',
          ),
        },
        React.createElement(LazyLocalChatPage),
      ),
    },
  });
}
