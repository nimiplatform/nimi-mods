import { TEST_AI_CAPABILITIES, TEST_AI_MOD_ID, TEST_AI_PERMISSIONS, } from './contracts.js';
import { registerTestAiUiExtensions } from './registrars/ui.js';
import { type RuntimeModRegistration, createHookClient, createModRuntimeClient } from "@nimiplatform/sdk/mod";
let _runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;
export function getTestAiRuntimeClient() {
    if (!_runtimeClient) {
        throw new Error('TEST_AI_RUNTIME_CLIENT_NOT_INITIALIZED');
    }
    return _runtimeClient;
}
export function createTestAiRuntimeMod(): RuntimeModRegistration {
    return {
        modId: TEST_AI_MOD_ID,
        capabilities: [...TEST_AI_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(TEST_AI_MOD_ID, sdkRuntimeContext);
            const runtimeClient = createModRuntimeClient(TEST_AI_MOD_ID, sdkRuntimeContext);
            _runtimeClient = runtimeClient;
            await registerTestAiUiExtensions({ hookClient });
        },
        teardown: async () => {
            _runtimeClient = null;
        },
    };
}
export const createRuntimeMod = createTestAiRuntimeMod;
export { TEST_AI_CAPABILITIES, TEST_AI_MOD_ID, TEST_AI_PERMISSIONS, };
