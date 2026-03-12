import { TEXTPLAY_CAPABILITIES, TEXTPLAY_MOD_ID, } from './contracts.js';
import { createTextplayFlowId, emitTextplayLog, } from './logging.js';
import { registerTextplayDataCapabilities } from './registrars/data.js';
import { registerTextplayUiExtensions } from './registrars/ui.js';
import { createHookClient, type RuntimeModRegistration } from "@nimiplatform/sdk/mod";
export function createTextplayRuntimeMod(): RuntimeModRegistration {
    return {
        modId: TEXTPLAY_MOD_ID,
        capabilities: [...TEXTPLAY_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(TEXTPLAY_MOD_ID, sdkRuntimeContext);
            const flowId = createTextplayFlowId('textplay-setup');
            const startedAt = performance.now();
            emitTextplayLog({
                level: 'info',
                message: 'phase:setup:start',
                flowId,
                source: 'createTextplayRuntimeMod.setup',
            });
            await registerTextplayDataCapabilities({ hookClient });
            await registerTextplayUiExtensions({ hookClient });
            emitTextplayLog({
                level: 'info',
                message: 'phase:setup:done',
                flowId,
                source: 'createTextplayRuntimeMod.setup',
                costMs: Number((performance.now() - startedAt).toFixed(2)),
            });
        },
        teardown: async () => { },
    };
}
export const createRuntimeMod = createTextplayRuntimeMod;
