import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createLocalChatFlowId, emitLocalChatLog } from './logging.js';
import {
  LOCAL_CHAT_CAPABILITIES,
  LOCAL_CHAT_MOD_ID,
} from './contracts.js';
import { registerLocalChatDataCapabilities, createLocalChatReadContextResolver } from './registrars/data.js';
import { registerLocalChatUiExtensions } from './registrars/ui.js';
import { startLocalChatProactiveHeartbeat } from './heartbeat.js';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createLocalChatRuntimeMod(): RuntimeModRegistration {
  return {
    modId: LOCAL_CHAT_MOD_ID,
    capabilities: [...LOCAL_CHAT_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ getHttpContext, sdkRuntimeContext }) => {
      const hookClient = createHookClient(LOCAL_CHAT_MOD_ID, sdkRuntimeContext);
      const aiClient = createAiClient(LOCAL_CHAT_MOD_ID, sdkRuntimeContext);
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
      startLocalChatProactiveHeartbeat({
        aiClient,
        getReadContext,
      });

      emitLocalChatLog({
        level: 'info',
        message: 'phase:setup:done',
        flowId,
        source: 'createLocalChatRuntimeMod.setup',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createLocalChatRuntimeMod;

export {
  LOCAL_CHAT_CAPABILITIES,
  LOCAL_CHAT_MOD_ID,
};
