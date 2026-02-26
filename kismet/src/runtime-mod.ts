import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createKismetFlowId, emitKismetLog } from './logging.js';
import {
  KISMET_CAPABILITIES,
  KISMET_MOD_ID,
  KISMET_PERMISSIONS,
} from './contracts.js';
import { registerKismetDataCapabilities } from './registrars/data.js';
import { registerKismetUiExtensions } from './registrars/ui.js';

let _aiClient: ReturnType<typeof createAiClient> | null = null;
let _hookClient: ReturnType<typeof createHookClient> | null = null;

export function getKismetAiClient() {
  if (!_aiClient) {
    throw new Error('KISMET_AI_CLIENT_NOT_INITIALIZED');
  }
  return _aiClient;
}

export function getKismetHookClient() {
  if (!_hookClient) {
    throw new Error('KISMET_HOOK_CLIENT_NOT_INITIALIZED');
  }
  return _hookClient;
}

export function createKismetRuntimeMod(): RuntimeModRegistration {
  return {
    modId: KISMET_MOD_ID,
    capabilities: [...KISMET_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async () => {
      const hookClient = createHookClient(KISMET_MOD_ID);
      const aiClient = createAiClient(KISMET_MOD_ID);
      _aiClient = aiClient;
      _hookClient = hookClient;
      const flowId = createKismetFlowId('kismet-setup');
      const startedAt = performance.now();

      emitKismetLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createKismetRuntimeMod.setup',
      });

      await registerKismetDataCapabilities({ hookClient });
      await registerKismetUiExtensions({ hookClient });

      emitKismetLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createKismetRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createKismetRuntimeMod;

export {
  KISMET_CAPABILITIES,
  KISMET_MOD_ID,
  KISMET_PERMISSIONS,
};
