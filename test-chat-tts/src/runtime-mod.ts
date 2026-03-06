import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import {
  TEST_CHAT_TTS_CAPABILITIES,
  TEST_CHAT_TTS_MOD_ID,
  TEST_CHAT_TTS_PERMISSIONS,
} from './contracts.js';
import { registerTestChatTtsUiExtensions } from './registrars/ui.js';

let _runtimeClient: ReturnType<typeof createModRuntimeClient> | null = null;

export function getTestChatTtsRuntimeClient() {
  if (!_runtimeClient) {
    throw new Error('TEST_CHAT_TTS_RUNTIME_CLIENT_NOT_INITIALIZED');
  }
  return _runtimeClient;
}

export function createTestChatTtsRuntimeMod(): RuntimeModRegistration {
  return {
    modId: TEST_CHAT_TTS_MOD_ID,
    capabilities: [...TEST_CHAT_TTS_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(TEST_CHAT_TTS_MOD_ID, sdkRuntimeContext);
      const runtimeClient = createModRuntimeClient(TEST_CHAT_TTS_MOD_ID, sdkRuntimeContext);
      _runtimeClient = runtimeClient;
      await registerTestChatTtsUiExtensions({ hookClient });
    },
  };
}

export const createRuntimeMod = createTestChatTtsRuntimeMod;

export {
  TEST_CHAT_TTS_CAPABILITIES,
  TEST_CHAT_TTS_MOD_ID,
  TEST_CHAT_TTS_PERMISSIONS,
};
