import React, { Suspense } from 'react';
import { getPromptLocale, type HookClient } from '@nimiplatform/sdk/mod';
import {
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_NAV_SLOT,
  AGENT_CAPTURE_ROUTE_SLOT,
  AGENT_CAPTURE_TAB_ID,
} from '../contracts.js';
import enLocale from '../locales/en.js';
import zhLocale from '../locales/zh.js';

const LazyAgentCapturePage = React.lazy(async () => {
  const module = await import('../ui/agent-capture-page.js');
  return {
    default: module.AgentCapturePage,
  };
});

export async function registerAgentCaptureUiExtensions(input: {
  hookClient: HookClient;
}): Promise<void> {
  const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;
  await input.hookClient.ui.register({
    slot: AGENT_CAPTURE_NAV_SLOT,
    priority: 125,
    extension: {
      type: 'nav-item',
      tabId: AGENT_CAPTURE_TAB_ID,
      label: locale.nav.label,
      badge: 'MOD',
      icon: 'agent-capture',
      strategy: 'append',
    },
  });
  await input.hookClient.ui.register({
    slot: AGENT_CAPTURE_ROUTE_SLOT,
    priority: 125,
    extension: {
      type: 'tab-page',
      tabId: AGENT_CAPTURE_TAB_ID,
      shellMode: 'immersive',
      strategy: 'append',
      modId: AGENT_CAPTURE_MOD_ID,
      component: () => React.createElement(
        Suspense,
        {
          fallback: React.createElement(
            'div',
            { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' },
            locale.nav.loading,
          ),
        },
        React.createElement(LazyAgentCapturePage),
      ),
    },
  });
}
