import { MOD_CAPABILITIES, MOD_ID } from './contracts.js';
import { registerBuddyUiExtensions } from './registrars/ui.js';
import { clearSdkRuntimeContext, setSdkRuntimeContext } from './sdk-context.js';
import { resetCubismCoreLoader } from './cubism-core-loader.js';
import { type RuntimeModRegistration, createHookClient } from "@nimiplatform/sdk/mod";
export function createBuddyRuntimeMod(): RuntimeModRegistration {
    return {
        modId: MOD_ID,
        capabilities: [...MOD_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            // Make SDK context available to React components
            setSdkRuntimeContext(sdkRuntimeContext);
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
