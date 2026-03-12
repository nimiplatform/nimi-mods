import { VIDEOPLAY_CAPABILITIES, VIDEOPLAY_MOD_ID, } from './contracts.js';
import { createVideoPlayFlowId, emitVideoPlayLog } from './logging.js';
import { registerVideoPlayDataCapabilities } from './registrars/data.js';
import { registerVideoPlayUiExtensions } from './registrars/ui.js';
import { createVideoPlayRuntimeAiClient } from './runtime-ai-client.js';
import { type RuntimeModRegistration, createHookClient, createModRuntimeClient } from "@nimiplatform/sdk/mod";
let _runtimeAiClient: ReturnType<typeof createVideoPlayRuntimeAiClient> | null = null;
export function getVideoPlayAiClient() {
    if (!_runtimeAiClient) {
        throw new Error('VIDEOPLAY_AI_CLIENT_NOT_INITIALIZED');
    }
    return _runtimeAiClient;
}
export function createVideoPlayRuntimeMod(): RuntimeModRegistration {
    return {
        modId: VIDEOPLAY_MOD_ID,
        capabilities: [...VIDEOPLAY_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(VIDEOPLAY_MOD_ID, sdkRuntimeContext);
            const runtimeClient = createModRuntimeClient(VIDEOPLAY_MOD_ID, sdkRuntimeContext);
            _runtimeAiClient = createVideoPlayRuntimeAiClient(runtimeClient);
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
        teardown: async () => {
            _runtimeAiClient = null;
        },
    };
}
export const createRuntimeMod = createVideoPlayRuntimeMod;
