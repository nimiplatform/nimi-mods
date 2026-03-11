import type { RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { MOD_CAPABILITIES, MOD_ID } from './contracts.js';
import { registerBuddyUiExtensions } from './registrars/ui.js';
import { clearSdkRuntimeContext, setSdkRuntimeContext } from './sdk-context.js';
import { ensureCubismCore, resetCubismCoreLoader } from './cubism-core-loader.js';

export function createBuddyRuntimeMod(): RuntimeModRegistration {
  return {
    modId: MOD_ID,
    capabilities: [...MOD_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      // Make SDK context available to React components
      setSdkRuntimeContext(sdkRuntimeContext);

      // Load Cubism 4 Core runtime before any pixi-live2d-display code runs.
      // The cubism4 bundle has a module-level guard that throws if
      // window.Live2DCubismCore is missing, so this must happen first.
      await ensureCubismCore();

      const hookClient = createHookClient(MOD_ID, sdkRuntimeContext);
      await registerBuddyUiExtensions({ hookClient });
    },
    teardown: async () => {
      clearSdkRuntimeContext();
      resetCubismCoreLoader();
    },
  };
}

export const createRuntimeMod = createBuddyRuntimeMod;
