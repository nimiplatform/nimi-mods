// ---------------------------------------------------------------------------
// TTS adapter — bridges HookLlmClient.speech → service-layer TtsClient interface
// ---------------------------------------------------------------------------

import type { HookLlmClient } from '@nimiplatform/sdk/mod/types';
import type { TtsClient } from '../types.js';

type HookSpeech = HookLlmClient['speech'];

/**
 * Wrap hookClient.llm.speech into the service-layer TtsClient abstraction.
 *
 * Mapping:
 *   listVoices(): { id, providerId, name, lang } → { voiceId, providerId, voiceName, language }
 *   synthesize(): audioUri → fetch → Blob; emotion → stylePrompt
 */
export function createTtsClientAdapter(speech: HookSpeech): TtsClient {
  return {
    async listVoices() {
      const voices = await speech.listVoices();
      return voices.map((v) => ({
        providerId: v.providerId,
        voiceId: v.id,
        voiceName: v.name,
        language: v.lang,
      }));
    },

    async synthesize(input) {
      const result = await speech.synthesize({
        text: input.text,
        voiceId: input.voiceId,
        providerId: input.providerId,
        speakingRate: input.speakingRate,
        pitch: input.pitch,
        stylePrompt: input.emotion,
      });

      // audioUri may be a blob URL, data URL, or tauri:// protocol — fetch handles all
      const response = await fetch(result.audioUri);
      const audioBlob = await response.blob();

      // Use server-reported duration if available, otherwise estimate from blob size
      const durationMs = result.durationMs ?? estimateDurationMs(audioBlob.size, result.mimeType);

      return { audioBlob, durationMs };
    },
  };
}

/** Fallback duration estimation: MP3 ~128kbps → bytes * 8 / 128000 * 1000 */
function estimateDurationMs(byteSize: number, mimeType: string): number {
  if (mimeType.includes('wav')) {
    // WAV 16-bit 24kHz mono → bytes / (24000 * 2) * 1000
    return Math.round(byteSize / 48_000 * 1000);
  }
  // Default: assume MP3 128kbps
  return Math.round(byteSize * 8 / 128_000 * 1000);
}
