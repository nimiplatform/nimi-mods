// ---------------------------------------------------------------------------
// Client factory hook — creates and memoizes SDK clients + adapters
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../adapters/tts-adapter.js';

export function useAudioBookClients() {
  const hookClient = useMemo(() => createHookClient(AUDIO_BOOK_MOD_ID), []);
  const aiClient = useMemo(() => createAiClient(AUDIO_BOOK_MOD_ID), []);
  const llmClient = useMemo(() => createLlmClientAdapter(aiClient), [aiClient]);
  const ttsClient = useMemo(() => createTtsClientAdapter(hookClient.llm.speech), [hookClient]);

  return { hookClient, aiClient, llmClient, ttsClient };
}
