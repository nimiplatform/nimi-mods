import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { DAILY_OUTFIT_CAPABILITIES, DAILY_OUTFIT_MOD_ID } from './contracts.js';
import { createDailyOutfitFlowId, emitDailyOutfitLog } from './logging.js';
import { registerDailyOutfitDataCapabilities } from './registrars/data.js';
import { registerDailyOutfitUiExtensions } from './registrars/ui.js';

let runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;
let hookClient: ReturnType<typeof createHookClient> | null = null;

export function getDailyOutfitRuntimeClient() {
  if (!runtimeClient) {
    throw new Error('DAILY_OUTFIT_RUNTIME_CLIENT_NOT_INITIALIZED');
  }
  return runtimeClient;
}

export function getDailyOutfitHookClient() {
  if (!hookClient) {
    throw new Error('DAILY_OUTFIT_HOOK_CLIENT_NOT_INITIALIZED');
  }
  return hookClient;
}

export function createDailyOutfitRuntimeMod(): RuntimeModRegistration {
  return {
    modId: DAILY_OUTFIT_MOD_ID,
    capabilities: [...DAILY_OUTFIT_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const flowId = createDailyOutfitFlowId('daily-outfit-setup');
      const startedAt = performance.now();

      emitDailyOutfitLog({
        level: 'info',
        message: 'phase:setup:start',
        flowId,
        source: 'createDailyOutfitRuntimeMod.setup',
      });

      hookClient = createHookClient(DAILY_OUTFIT_MOD_ID, sdkRuntimeContext);
      runtimeClient = createModRuntimeClient(DAILY_OUTFIT_MOD_ID, sdkRuntimeContext);

      await registerDailyOutfitDataCapabilities({ hookClient });
      await registerDailyOutfitUiExtensions({ hookClient });

      emitDailyOutfitLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createDailyOutfitRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createDailyOutfitRuntimeMod;
