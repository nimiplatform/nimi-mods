// ---------------------------------------------------------------------------
// TTS adapter — bridges runtime.media.tts → service-layer TtsClient interface
// ---------------------------------------------------------------------------

import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { TtsClient } from '../types.js';
import { getQwenSystemVoices, isQwenSystemTtsModel } from '../services/qwen-voice-catalog.js';

/**
 * Wrap runtime.media.tts into the service-layer TtsClient abstraction.
 *
 * Mapping:
 *   listVoices(): { id, providerId, name, lang } → { voiceId, providerId, voiceName, language }
 *   synthesize(): audioUri → fetch → Blob; emotion → stylePrompt
 */
export function createTtsClientAdapter(
  runtimeClient: ModRuntimeClient,
  defaultBinding?: RuntimeRouteBinding,
): TtsClient {
  return {
    async listVoices(options) {
      const binding = options?.binding || defaultBinding;
      const model = String(options?.model || binding?.model || '').trim();
      if (!model) {
        throw new Error('AUDIO_BOOK_TTS_MODEL_REQUIRED');
      }
      const [voices, resolved] = await Promise.all([
        runtimeClient.media.tts.listVoices({
          binding,
          model,
        }),
        runtimeClient.route.resolve({
          capability: 'audio.synthesize',
          binding,
        }),
      ]);
      const mapped = voices.voices.map((voice) => ({
        providerId: resolved.provider,
        voiceId: voice.voiceId,
        voiceName: voice.name,
        language: voice.lang,
      }));
      if (mapped.length > 0) return mapped;
      if (!isQwenSystemTtsModel(model)) return mapped;
      return getQwenSystemVoices().map((voice) => ({
        providerId: voice.providerId,
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        language: voice.language,
        gender: voice.gender,
      }));
    },

    async synthesize(input) {
      const binding = input.binding || defaultBinding;
      const model = String(input.model || binding?.model || '').trim();
      if (!model) {
        throw new Error('AUDIO_BOOK_TTS_MODEL_REQUIRED');
      }
      const result = await runtimeClient.media.tts.synthesize({
        text: input.text,
        voice: input.voiceId,
        speed: input.speakingRate,
        pitch: input.pitch,
        emotion: input.emotion,
        binding,
        model,
      });

      const artifact = result.artifacts.find((item) => item.uri) || null;
      if (!artifact?.uri) {
        throw new Error('AUDIO_BOOK_TTS_ARTIFACT_MISSING');
      }
      const response = await fetch(artifact.uri);
      const audioBlob = await response.blob();
      const durationMs = estimateDurationMs(audioBlob.size, artifact.mimeType || audioBlob.type || 'audio/mpeg');

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
