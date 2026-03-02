import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import {
  VIDEOPLAY_CAPABILITIES,
  VIDEOPLAY_MOD_ID,
} from './contracts.js';
import { createVideoPlayFlowId, emitVideoPlayLog } from './logging.js';
import { registerVideoPlayDataCapabilities } from './registrars/data.js';
import { registerVideoPlayUiExtensions } from './registrars/ui.js';

let _aiClient: ReturnType<typeof createAiClient> | null = null;

export function getVideoPlayAiClient() {
  if (!_aiClient) {
    throw new Error('VIDEOPLAY_AI_CLIENT_NOT_INITIALIZED');
  }
  return _aiClient;
}

export function createVideoPlayRuntimeMod(): RuntimeModRegistration {
  return {
    modId: VIDEOPLAY_MOD_ID,
    capabilities: [...VIDEOPLAY_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(VIDEOPLAY_MOD_ID, sdkRuntimeContext);
      const aiClient = createAiClient(VIDEOPLAY_MOD_ID, sdkRuntimeContext);
      _aiClient = aiClient;

      const flowId = createVideoPlayFlowId('videoplay-setup');
      const startedAt = performance.now();
      emitVideoPlayLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createVideoPlayRuntimeMod.setup',
      });

      await registerVideoPlayDataCapabilities({ hookClient });
      await registerVideoPlayUiExtensions({ hookClient });

      emitVideoPlayLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createVideoPlayRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createVideoPlayRuntimeMod;
