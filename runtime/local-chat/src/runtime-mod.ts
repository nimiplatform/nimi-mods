import { onRouteLifecycleChange } from '@nimiplatform/sdk/mod/lifecycle';
import { createLocalChatFlowId, emitLocalChatLog } from './logging.js';
import { LOCAL_CHAT_CAPABILITIES, LOCAL_CHAT_MOD_ID, LOCAL_CHAT_TAB_ID, } from './contracts.js';
import { registerLocalChatDataCapabilities, createLocalChatReadContextResolver } from './registrars/data.js';
import { registerLocalChatUiExtensions } from './registrars/ui.js';
import { startLocalChatProactiveHeartbeat } from './heartbeat.js';
import { stopLocalChatProactiveHeartbeat } from './heartbeat.js';
import { createLocalChatAiClient } from './runtime-ai-client.js';
import { type RuntimeModRegistration, createHookClient, createModRuntimeClient } from "@nimiplatform/sdk/mod";
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function createLocalChatRuntimeMod(): RuntimeModRegistration {
    let unsubscribeLifecycle: (() => void) | null = null;
    return {
        modId: LOCAL_CHAT_MOD_ID,
        capabilities: [...LOCAL_CHAT_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ getHttpContext, sdkRuntimeContext }) => {
            const hookClient = createHookClient(LOCAL_CHAT_MOD_ID, sdkRuntimeContext);
            const runtimeClient = createModRuntimeClient(LOCAL_CHAT_MOD_ID, sdkRuntimeContext);
            const aiClient = createLocalChatAiClient(runtimeClient);
            const flowId = createLocalChatFlowId('local-chat-setup');
            const startedAt = performance.now();
            emitLocalChatLog({
                level: 'info',
                message: 'phase:setup:start',
                flowId,
                source: 'createLocalChatRuntimeMod.setup',
            });
            await registerLocalChatDataCapabilities({
                hookClient,
                getHttpContext: getHttpContext as () => {
                    realmBaseUrl: string;
                    accessToken?: string;
                    fetchImpl?: FetchImpl;
                },
            });
            await registerLocalChatUiExtensions({ hookClient });
            const getReadContext = createLocalChatReadContextResolver({
                getHttpContext: getHttpContext as () => {
                    realmBaseUrl: string;
                    accessToken?: string;
                    fetchImpl?: FetchImpl;
                },
            });
            const heartbeatInput = { aiClient, getReadContext };
            startLocalChatProactiveHeartbeat(heartbeatInput);
            // Lifecycle: stop heartbeat when inactive, restart when active
            unsubscribeLifecycle = onRouteLifecycleChange(LOCAL_CHAT_TAB_ID, (state) => {
                if (state === 'active') {
                    startLocalChatProactiveHeartbeat(heartbeatInput);
                }
                else {
                    stopLocalChatProactiveHeartbeat();
                }
            });
            emitLocalChatLog({
                level: 'info',
                message: 'phase:setup:done',
                flowId,
                source: 'createLocalChatRuntimeMod.setup',
                costMs: Number((performance.now() - startedAt).toFixed(2)),
            });
        },
        teardown: async () => {
            unsubscribeLifecycle?.();
            unsubscribeLifecycle = null;
            stopLocalChatProactiveHeartbeat();
        },
    };
}
export const createRuntimeMod = createLocalChatRuntimeMod;
export { LOCAL_CHAT_CAPABILITIES, LOCAL_CHAT_MOD_ID, };
