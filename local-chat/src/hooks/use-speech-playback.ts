import { useCallback, useEffect, useRef, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { ChatMessage } from '../types.js';
import type { LocalChatTarget } from '../data/index.js';
import type { LocalChatAudioPlaybackSource } from '../runtime-ai-client.js';
import {
  isDirectVoicePlaybackUri,
  resolveCachedVoicePlaybackSource,
} from '../services/voice/playback-source.js';
import {
  extractTtsFailureActionHint,
  extractTtsFailureReasonCode,
  isVoiceUnsupportedTtsFailure,
} from '../services/tts/recovery.js';

const TTS_PLAYBACK_ERROR_CODE = 'LOCAL_CHAT_TTS_PLAYBACK_FAILED';

function looksLikeWavBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x41
    && bytes[10] === 0x56
    && bytes[11] === 0x45;
}

function looksLikeMp3Bytes(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) {
    return true;
  }
  return false;
}

export function normalizeVoicePlaybackMimeType(input: {
  mimeType?: string;
  audioBytes?: Uint8Array;
}): string {
  const normalizedMimeType = String(input.mimeType || '').trim().toLowerCase();
  if (normalizedMimeType === 'audio/x-wav') {
    return 'audio/wav';
  }
  if (normalizedMimeType === 'audio/mp3') {
    return 'audio/mpeg';
  }
  if (normalizedMimeType) {
    return normalizedMimeType;
  }
  const bytes = input.audioBytes;
  if (bytes instanceof Uint8Array && bytes.length > 0) {
    if (looksLikeWavBytes(bytes)) {
      return 'audio/wav';
    }
    if (looksLikeMp3Bytes(bytes)) {
      return 'audio/mpeg';
    }
  }
  return 'audio/mpeg';
}

function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '';
  }
  const globalBuffer = (globalThis as { Buffer?: { from(value: Uint8Array): { toString(format: string): string } } }).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(bytes).toString('base64');
  }
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error('LOCAL_CHAT_VOICE_PLAYBACK_BASE64_UNAVAILABLE');
}

export function createVoicePlaybackDataUri(source: LocalChatAudioPlaybackSource): string {
  const bytes = source.audioBytes instanceof Uint8Array && source.audioBytes.length > 0
    ? Uint8Array.from(source.audioBytes)
    : null;
  if (!bytes) {
    return '';
  }
  const mimeType = normalizeVoicePlaybackMimeType({
    mimeType: source.mimeType,
    audioBytes: bytes,
  });
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function hasVoicePlaybackBytes(source: LocalChatAudioPlaybackSource): boolean {
  return source.audioBytes instanceof Uint8Array && source.audioBytes.length > 0;
}

function resolveVoicePlaybackUriScheme(rawUri: string): string | null {
  const normalized = String(rawUri || '').trim();
  if (!normalized) {
    return null;
  }
  const matched = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!matched) {
    return normalized.startsWith('/') ? 'path' : 'relative';
  }
  return String(matched[1] || '').toLowerCase() || null;
}

export function createVoicePlaybackUrl(input: {
  source: LocalChatAudioPlaybackSource;
  setObjectUrl: (value: string | null) => void;
}): string {
  const directUri = String(input.source.audioUri || '').trim();
  const bytes = input.source.audioBytes;
  if (bytes instanceof Uint8Array && bytes.length > 0) {
    const mimeType = normalizeVoicePlaybackMimeType({
      mimeType: input.source.mimeType,
      audioBytes: bytes,
    });
    const normalizedBytes = Uint8Array.from(bytes);
    const objectUrl = URL.createObjectURL(new Blob([normalizedBytes], { type: mimeType }));
    input.setObjectUrl(objectUrl);
    return objectUrl;
  }
  if (isDirectVoicePlaybackUri(directUri)) {
    input.setObjectUrl(null);
    return directUri;
  }
  input.setObjectUrl(null);
  return '';
}

export function useSpeechPlayback(input: {
  enableVoice: boolean;
  defaultVoiceName: string;
  defaultVoiceId: string;
  ttsRouteSource: 'auto' | 'local' | 'cloud';
  selectedTargetId: string;
  selectedTarget: LocalChatTarget | null;
  synthesizeVoice: (text: string) => Promise<LocalChatAudioPlaybackSource>;
  setStatusBanner: (payload: {
    kind: 'warn' | 'error' | 'info' | 'success';
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => void;
  onVoiceUnsupported?: () => void;
}) {
  const [playingVoiceMessageId, setPlayingVoiceMessageId] = useState<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioObjectUrlRef = useRef<string | null>(null);
  const voicePlaybackTokenRef = useRef(0);

  const clearVoiceAudio = useCallback(() => {
    const audio = voiceAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      voiceAudioRef.current = null;
    }
    const objectUrl = voiceAudioObjectUrlRef.current;
    if (
      objectUrl
      && typeof URL !== 'undefined'
      && typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(objectUrl);
      voiceAudioObjectUrlRef.current = null;
    }
  }, []);

  const stopVoicePlayback = useCallback(() => {
    voicePlaybackTokenRef.current += 1;
    clearVoiceAudio();
    setPlayingVoiceMessageId(null);
  }, [clearVoiceAudio]);

  useEffect(() => {
    if (!input.enableVoice) {
      stopVoicePlayback();
    }
  }, [input.enableVoice, stopVoicePlayback]);

  useEffect(() => () => {
    stopVoicePlayback();
  }, [stopVoicePlayback]);

  const resolvePlaybackUrl = useCallback((source: LocalChatAudioPlaybackSource): string => {
    return createVoicePlaybackUrl({
      source,
      setObjectUrl: (value) => {
        voiceAudioObjectUrlRef.current = value;
      },
    });
  }, []);

  const attachVoiceAudioHandlers = useCallback((value: {
    audio: HTMLAudioElement;
    messageId: string;
    playbackToken: number;
  }) => {
    value.audio.onended = () => {
      if (voicePlaybackTokenRef.current !== value.playbackToken) return;
      clearVoiceAudio();
      setPlayingVoiceMessageId(null);
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:voice-playback:done',
        flowId: value.messageId,
        details: {
          targetId: input.selectedTargetId,
          worldId: input.selectedTarget?.worldId || null,
          messageId: value.messageId,
        },
      });
    };
    value.audio.onerror = () => {
      if (voicePlaybackTokenRef.current !== value.playbackToken) return;
      clearVoiceAudio();
      setPlayingVoiceMessageId(null);
      input.setStatusBanner({
        kind: 'warn',
        message: `Voice playback failed: ${TTS_PLAYBACK_ERROR_CODE}`,
      });
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:voice-playback:failed',
        flowId: value.messageId,
        details: {
          targetId: input.selectedTargetId,
          worldId: input.selectedTarget?.worldId || null,
          messageId: value.messageId,
          errorCode: TTS_PLAYBACK_ERROR_CODE,
          error: TTS_PLAYBACK_ERROR_CODE,
        },
      });
    };
  }, [clearVoiceAudio, input]);

  const playVoiceMessage = useCallback(async (message: ChatMessage) => {
    if (message.kind !== 'voice') return;
    if (!input.enableVoice) {
      input.setStatusBanner({
        kind: 'info',
        message: 'Voice is disabled in Default Settings.',
      });
      return;
    }
    const text = String(message.content || '').trim();
    if (!text) return;
    if (!input.selectedTargetId) return;
    if (
      typeof window === 'undefined'
      || typeof Audio !== 'function'
      || typeof URL === 'undefined'
      || typeof URL.createObjectURL !== 'function'
    ) {
      return;
    }

    if (playingVoiceMessageId === message.id) {
      stopVoicePlayback();
      return;
    }

    const playbackToken = voicePlaybackTokenRef.current + 1;
    voicePlaybackTokenRef.current = playbackToken;

    try {
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:voice-playback:start',
        flowId: message.id,
        details: {
          targetId: input.selectedTargetId,
          worldId: input.selectedTarget?.worldId || null,
          messageId: message.id,
          routeSource: input.ttsRouteSource,
          voiceId: input.defaultVoiceName || input.defaultVoiceId,
        },
      });

      clearVoiceAudio();
      setPlayingVoiceMessageId(message.id);

      const cachedSource = resolveCachedVoicePlaybackSource({
        audioUri: message.meta?.audioUri,
        audioBytes: message.meta?.audioBytes,
        mimeType: message.meta?.audioMimeType,
      });
      if (String(message.meta?.audioUri || '').trim() && !cachedSource) {
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:voice-playback:cached-source-skipped',
          flowId: message.id,
          details: {
            targetId: input.selectedTargetId,
            worldId: input.selectedTarget?.worldId || null,
            messageId: message.id,
            cacheReason: 'unstable-audio-uri',
          },
        });
      }

      let playbackSource = cachedSource;
      if (!playbackSource) {
        // Fallback to on-demand synthesis for old messages or unstable cached URIs.
        const response = await input.synthesizeVoice(text);
        if (voicePlaybackTokenRef.current !== playbackToken) {
          return;
        }
        playbackSource = response;
      }

      logRendererEvent({
        level: 'debug',
        area: 'local-chat',
        message: 'local-chat:voice-playback:source-resolved',
        flowId: message.id,
        details: {
          targetId: input.selectedTargetId,
          worldId: input.selectedTarget?.worldId || null,
          messageId: message.id,
          hasAudioBytes: hasVoicePlaybackBytes(playbackSource),
          hasAudioUri: Boolean(String(playbackSource.audioUri || '').trim()),
          audioUriScheme: resolveVoicePlaybackUriScheme(playbackSource.audioUri || ''),
          mimeType: normalizeVoicePlaybackMimeType({
            mimeType: playbackSource.mimeType,
            audioBytes: playbackSource.audioBytes,
          }),
        },
      });

      const objectUrl = resolvePlaybackUrl(playbackSource);
      if (!objectUrl) {
        throw new Error('SPEECH_OUTPUT_INVALID: empty audio playback source');
      }
      const audio = new Audio(objectUrl);
      attachVoiceAudioHandlers({
        audio,
        messageId: message.id,
        playbackToken,
      });
      voiceAudioRef.current = audio;
      if (!cachedSource && !voiceAudioObjectUrlRef.current) {
        voiceAudioObjectUrlRef.current = objectUrl;
      }

      try {
        await audio.play();
      } catch (error) {
        const normalizedError = error instanceof Error
          ? error
          : new Error(String(error || 'LOCAL_CHAT_TTS_PLAYBACK_FAILED'));
        const retryDataUri = hasVoicePlaybackBytes(playbackSource)
          ? createVoicePlaybackDataUri(playbackSource)
          : '';
        if (!retryDataUri || voicePlaybackTokenRef.current !== playbackToken) {
          throw normalizedError;
        }
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:voice-playback:data-uri-retry',
          flowId: message.id,
          details: {
            targetId: input.selectedTargetId,
            worldId: input.selectedTarget?.worldId || null,
            messageId: message.id,
            initialError: normalizedError.message,
            mimeType: normalizeVoicePlaybackMimeType({
              mimeType: playbackSource.mimeType,
              audioBytes: playbackSource.audioBytes,
            }),
          },
        });
        clearVoiceAudio();
        const retryAudio = new Audio(retryDataUri);
        attachVoiceAudioHandlers({
          audio: retryAudio,
          messageId: message.id,
          playbackToken,
        });
        voiceAudioRef.current = retryAudio;
        await retryAudio.play();
      }
    } catch (error) {
      if (voicePlaybackTokenRef.current !== playbackToken) {
        return;
      }
      clearVoiceAudio();
      setPlayingVoiceMessageId(null);
      const reasonCode = extractTtsFailureReasonCode(error);
      const actionHint = extractTtsFailureActionHint(error);
      if (isVoiceUnsupportedTtsFailure(reasonCode, actionHint)) {
        input.setStatusBanner({
          kind: 'warn',
          message: 'Current voice is not supported by the selected TTS model. Please choose another voice or refresh voice list.',
          actionLabel: input.onVoiceUnsupported ? 'Refresh Voice List' : undefined,
          onAction: input.onVoiceUnsupported,
        });
      } else {
        input.setStatusBanner({
          kind: 'warn',
          message: `Voice playback failed: ${TTS_PLAYBACK_ERROR_CODE}`,
        });
      }
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:voice-playback:failed',
        flowId: message.id,
        details: {
          targetId: input.selectedTargetId,
          worldId: input.selectedTarget?.worldId || null,
          messageId: message.id,
          errorCode: TTS_PLAYBACK_ERROR_CODE,
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    }
  }, [
    attachVoiceAudioHandlers,
    clearVoiceAudio,
    input.defaultVoiceId,
    input.defaultVoiceName,
    input.enableVoice,
    input.setStatusBanner,
    input.synthesizeVoice,
    input.ttsRouteSource,
    input.selectedTarget,
    input.selectedTargetId,
    input.onVoiceUnsupported,
    playingVoiceMessageId,
    resolvePlaybackUrl,
    stopVoicePlayback,
  ]);

  return {
    playingVoiceMessageId,
    playVoiceMessage,
    stopVoicePlayback,
  };
}
