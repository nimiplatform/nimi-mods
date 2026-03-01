import { type RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import {
  TEST_CHAT_TTS_CAPABILITIES,
  TEST_CHAT_TTS_MOD_ID,
  TEST_CHAT_TTS_PERMISSIONS,
} from './contracts.js';
import { registerTestChatTtsUiExtensions } from './registrars/ui.js';

let _aiClient: ReturnType<typeof createAiClient> | null = null;
let _hookClient: ReturnType<typeof createHookClient> | null = null;

export function getTestChatTtsAiClient() {
  if (!_aiClient) {
    throw new Error('TEST_CHAT_TTS_AI_CLIENT_NOT_INITIALIZED');
  }
  return _aiClient;
}

export function getTestChatTtsHookClient() {
  if (!_hookClient) {
    throw new Error('TEST_CHAT_TTS_HOOK_CLIENT_NOT_INITIALIZED');
  }
  return _hookClient;
}

export function createTestChatTtsRuntimeMod(): RuntimeModRegistration {
  return {
    modId: TEST_CHAT_TTS_MOD_ID,
    capabilities: [...TEST_CHAT_TTS_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(TEST_CHAT_TTS_MOD_ID, sdkRuntimeContext);
      const aiClient = createAiClient(TEST_CHAT_TTS_MOD_ID, sdkRuntimeContext);
      _aiClient = aiClient;
      _hookClient = hookClient;
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
