import type { LocalChatAudioPlaybackSource } from '../../runtime-ai-client.js';

type VoicePlaybackSourceCacheInput = {
  audioUri?: string;
  audioBytes?: Uint8Array;
  mimeType?: string;
};

const DIRECT_PLAYBACK_URI_SCHEMES = new Set([
  'app',
  'asset',
  'blob',
  'data',
  'tauri',
]);

export function isDirectVoicePlaybackUri(rawUri: string): boolean {
  const normalized = String(rawUri || '').trim();
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith('/')) {
    return true;
  }
  const matched = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!matched) {
    return true;
  }
  return DIRECT_PLAYBACK_URI_SCHEMES.has(String(matched[1] || '').toLowerCase());
}

export function resolveCachedVoicePlaybackSource(
  input: VoicePlaybackSourceCacheInput,
): LocalChatAudioPlaybackSource | null {
  const audioUri = String(input.audioUri || '').trim();
  if (isDirectVoicePlaybackUri(audioUri)) {
    return { audioUri };
  }
  const audioBytes = input.audioBytes instanceof Uint8Array && input.audioBytes.length > 0
    ? Uint8Array.from(input.audioBytes)
    : undefined;
  if (audioBytes) {
    return {
      audioBytes,
      mimeType: String(input.mimeType || '').trim() || undefined,
    };
  }
  return null;
}

export function createPersistableVoicePlaybackCacheMeta(
  source: LocalChatAudioPlaybackSource,
): { audioUri: string } | null {
  const audioUri = String(source.audioUri || '').trim();
  if (!isDirectVoicePlaybackUri(audioUri)) {
    return null;
  }
  return audioUri ? { audioUri } : null;
}
