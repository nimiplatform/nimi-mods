// ---------------------------------------------------------------------------
// Client factory hook — creates and memoizes SDK clients + adapters
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { VOICE_STUDIO_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../adapters/tts-adapter.js';

export function useVoiceStudioClients() {
  const hookClient = useMemo(() => createHookClient(VOICE_STUDIO_MOD_ID), []);
  const aiClient = useMemo(() => createAiClient(VOICE_STUDIO_MOD_ID), []);
  const llmClient = useMemo(() => createLlmClientAdapter(aiClient), [aiClient]);
  const ttsClient = useMemo(() => createTtsClientAdapter(hookClient.llm.speech), [hookClient]);

  return { hookClient, aiClient, llmClient, ttsClient };
}
