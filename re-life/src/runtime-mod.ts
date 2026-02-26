import React, { Suspense } from 'react';
import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createReLifeFlowId, emitReLifeLog } from './logging.js';
import {
  RELIFE_CAPABILITIES,
  RELIFE_MOD_ID,
  RELIFE_NAV_SLOT,
  RELIFE_ROUTE_SLOT,
  RELIFE_TAB_ID,
} from './contracts.js';
import { reLifeMessage } from './i18n/messages.js';

const LazyReLifePage = React.lazy(async () => {
  const module = await import('./re-life-page.js');
  return { default: module.ReLifePage };
});

export function createReLifeRuntimeMod(): RuntimeModRegistration {
  return {
    modId: RELIFE_MOD_ID,
    capabilities: [...RELIFE_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async () => {
      const hookClient = createHookClient(RELIFE_MOD_ID);
      const flowId = createReLifeFlowId('re-life-setup');
      const startedAt = performance.now();

      emitReLifeLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createReLifeRuntimeMod.setup',
      });

      await hookClient.ui.register({
        slot: RELIFE_NAV_SLOT,
        priority: 100,
        extension: {
          type: 'nav-item',
          tabId: RELIFE_TAB_ID,
          label: reLifeMessage('Navigation.label', 'Re:Life'),
          badge: 'MOD',
          icon: 're-life',
          strategy: 'append',
        },
      });

      await hookClient.ui.register({
        slot: RELIFE_ROUTE_SLOT,
        priority: 100,
        extension: {
          type: 'tab-page',
          tabId: RELIFE_TAB_ID,
          strategy: 'append',
          component: () => React.createElement(
            Suspense,
            {
              fallback: React.createElement(
                'div',
                { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' },
                reLifeMessage('Timeline.title', 'Re:Life loading...'),
              ),
            },
            React.createElement(LazyReLifePage),
          ),
        },
      });

      emitReLifeLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createReLifeRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createReLifeRuntimeMod;

export {
  RELIFE_CAPABILITIES,
  RELIFE_MOD_ID,
  RELIFE_PERMISSIONS,
} from './contracts.js';
