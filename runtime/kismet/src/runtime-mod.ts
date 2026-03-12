import { createKismetFlowId, emitKismetLog } from './logging.js';
import { KISMET_CAPABILITIES, KISMET_MOD_ID, KISMET_PERMISSIONS, } from './contracts.js';
import { registerKismetDataCapabilities } from './registrars/data.js';
import { registerKismetUiExtensions } from './registrars/ui.js';
import { type RuntimeModRegistration, createHookClient, createModRuntimeClient, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
let _runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;
let _hookClient: ReturnType<typeof createHookClient> | null = null;
export function getKismetRuntimeClient() {
    if (!_runtimeClient) {
        throw new Error('KISMET_RUNTIME_CLIENT_NOT_INITIALIZED');
    }
    return _runtimeClient;
}
export function getKismetAiClient(): ModRuntimeClient['ai']['text'] {
    return getKismetRuntimeClient().ai.text;
}
export function getKismetRouteClient(): ModRuntimeClient['route'] {
    return getKismetRuntimeClient().route;
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
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(KISMET_MOD_ID, sdkRuntimeContext);
            const runtimeClient = createModRuntimeClient(KISMET_MOD_ID, sdkRuntimeContext);
            _runtimeClient = runtimeClient;
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
        teardown: async () => {
            _runtimeClient = null;
            _hookClient = null;
        },
    };
}
export const createRuntimeMod = createKismetRuntimeMod;
export { KISMET_CAPABILITIES, KISMET_MOD_ID, KISMET_PERMISSIONS, };
