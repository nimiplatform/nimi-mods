import React, { Suspense } from 'react';
import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import {
  VOICE_STUDIO_CAPABILITIES,
  VOICE_STUDIO_MOD_ID,
  VOICE_STUDIO_NAV_SLOT,
  VOICE_STUDIO_ROUTE_SLOT,
  VOICE_STUDIO_TAB_ID,
} from './contracts.js';
import { createVoiceStudioFlowId, emitVoiceStudioLog } from './logging.js';

const LazyVoiceStudioPage = React.lazy(async () => {
  const module = await import('./voice-studio-page.js');
  return { default: module.VoiceStudioPage };
});

export function createVoiceStudioRuntimeMod(): RuntimeModRegistration {
  return {
    modId: VOICE_STUDIO_MOD_ID,
    capabilities: [...VOICE_STUDIO_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(VOICE_STUDIO_MOD_ID, sdkRuntimeContext);
      const flowId = createVoiceStudioFlowId('voice-studio-setup');
      const startedAt = performance.now();

      emitVoiceStudioLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createVoiceStudioRuntimeMod.setup',
      });

      await hookClient.ui.register({
        slot: VOICE_STUDIO_NAV_SLOT,
        priority: 150,
        extension: {
          type: 'nav-item',
          tabId: VOICE_STUDIO_TAB_ID,
          label: 'Voice Studio',
          badge: 'MOD',
          icon: 'microphone',
          strategy: 'append',
        },
      });

      await hookClient.ui.register({
        slot: VOICE_STUDIO_ROUTE_SLOT,
        priority: 150,
        extension: {
          type: 'tab-page',
          tabId: VOICE_STUDIO_TAB_ID,
          strategy: 'append',
          component: () => React.createElement(
            Suspense,
            {
              fallback: React.createElement(
                'div',
                { className: 'm-4 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600' },
                'Voice Studio is loading...',
              ),
            },
            React.createElement(LazyVoiceStudioPage),
          ),
        },
      });

      emitVoiceStudioLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createVoiceStudioRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}
