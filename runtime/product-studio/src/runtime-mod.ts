import { createHookClient, createModRuntimeClient, type RuntimeModRegistration } from '@nimiplatform/sdk/mod';
import { PRODUCT_STUDIO_CAPABILITIES, PRODUCT_STUDIO_MOD_ID } from './contracts.js';
import { registerProductStudioDataCapabilities } from './registrars/data.js';
import { registerProductStudioUiExtensions } from './registrars/ui.js';

let runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;
let hookClient: ReturnType<typeof createHookClient> | null = null;

export function getProductStudioRuntimeClient() {
  if (!runtimeClient) {
    throw new Error('PRODUCT_STUDIO_RUNTIME_CLIENT_NOT_INITIALIZED');
  }
  return runtimeClient;
}

export function getProductStudioHookClient() {
  if (!hookClient) {
    throw new Error('PRODUCT_STUDIO_HOOK_CLIENT_NOT_INITIALIZED');
  }
  return hookClient;
}

export function createProductStudioRuntimeMod(): RuntimeModRegistration {
  return {
    modId: PRODUCT_STUDIO_MOD_ID,
    capabilities: [...PRODUCT_STUDIO_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      hookClient = createHookClient(PRODUCT_STUDIO_MOD_ID, sdkRuntimeContext);
      runtimeClient = createModRuntimeClient(PRODUCT_STUDIO_MOD_ID, sdkRuntimeContext);
      await registerProductStudioDataCapabilities({ hookClient });
      await registerProductStudioUiExtensions({ hookClient });
    },
  };
}

export const createRuntimeMod = createProductStudioRuntimeMod;
