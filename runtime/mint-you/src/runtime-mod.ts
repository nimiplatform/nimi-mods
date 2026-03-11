import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import { createMintYouFlowId, emitMintYouLog } from './logging.js';
import {
  MINTYOU_CAPABILITIES,
  MINTYOU_MOD_ID,
} from './contracts.js';
import { registerMintYouDataCapabilities } from './registrars/data.js';
import { registerMintYouUiExtensions } from './registrars/ui.js';

let _runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;
let _hookClient: ReturnType<typeof createHookClient> | null = null;

export function getMintYouRuntimeClient() {
  if (!_runtimeClient) {
    throw new Error('MINTYOU_RUNTIME_CLIENT_NOT_INITIALIZED');
  }
  return _runtimeClient;
}

export function getMintYouHookClient() {
  if (!_hookClient) {
    throw new Error('MINTYOU_HOOK_CLIENT_NOT_INITIALIZED');
  }
  return _hookClient;
}

export function createMintYouRuntimeMod(): RuntimeModRegistration {
  return {
    modId: MINTYOU_MOD_ID,
    capabilities: [...MINTYOU_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(MINTYOU_MOD_ID, sdkRuntimeContext);
      const runtimeClient = createModRuntimeClient(MINTYOU_MOD_ID, sdkRuntimeContext);
      _runtimeClient = runtimeClient;
      _hookClient = hookClient;
      const flowId = createMintYouFlowId('mint-you-setup');
      const startedAt = performance.now();

      emitMintYouLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createMintYouRuntimeMod.setup',
      });

      await registerMintYouDataCapabilities({ hookClient });
      await registerMintYouUiExtensions({ hookClient });

      emitMintYouLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createMintYouRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
    teardown: async () => {
      _runtimeClient = null;
      _hookClient = null;
    },
  };
}

export const createRuntimeMod = createMintYouRuntimeMod;
