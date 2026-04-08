// ---------------------------------------------------------------------------
// Client factory hook — creates and memoizes SDK clients + adapters
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../adapters/tts-adapter.js';
import { createHookClient, createModRuntimeClient, type ModRuntimeClient, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
/** Stable singleton hook client — call this once at the top of the component tree. */
export function useHookClient() {
    return useMemo(() => createHookClient(AUDIO_BOOK_MOD_ID), []);
}
/** Stable singleton runtime client — call once, pass to route + service hooks. */
export function useRuntimeClient() {
    return useMemo(() => createModRuntimeClient(AUDIO_BOOK_MOD_ID), []);
}
/**
 * Projection-only clients for UI helpers such as voice listing.
 * Execution entry points must read formal AIConfig directly at call time.
 */
export function useAudioBookClients(hookClient: ReturnType<typeof createHookClient>, runtimeClient: ModRuntimeClient, chatBinding?: RuntimeRouteBinding, ttsBinding?: RuntimeRouteBinding) {
    const llmClient = useMemo(() => createLlmClientAdapter(runtimeClient, chatBinding), [runtimeClient, chatBinding?.connectorId, chatBinding?.model, chatBinding?.source]);
    const ttsClient = useMemo(() => createTtsClientAdapter(runtimeClient, ttsBinding), [runtimeClient, ttsBinding?.connectorId, ttsBinding?.model, ttsBinding?.source]);
    return { hookClient, runtimeClient, llmClient, ttsClient };
}
