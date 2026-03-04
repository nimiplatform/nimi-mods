import { useCallback, useEffect, useRef, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { ChatMessage } from '../types.js';
import type { LocalChatTarget } from '../data/index.js';

const TTS_PLAYBACK_ERROR_CODE = 'LOCAL_CHAT_TTS_PLAYBACK_FAILED';

export function useSpeechPlayback(input: {
  enableVoice: boolean;
  defaultVoiceName: string;
  defaultVoiceId: string;
  ttsRouteSource: 'auto' | 'local-runtime' | 'token-api';
  selectedSpeechProviderId: string;
  selectedTargetId: string;
  selectedTarget: LocalChatTarget | null;
  synthesizeVoice: (text: string) => Promise<{ audioUri: string }>;
  setStatusBanner: (payload: { kind: 'warn' | 'error' | 'info' | 'success'; message: string }) => void;
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

  const playVoiceMessage = useCallback(async (message: ChatMessage) => {
    if (message.kind !== 'voice') return;
    if (!input.enableVoice) return;
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
          providerId: input.selectedSpeechProviderId || 'auto',
          routeSource: input.ttsRouteSource,
          voiceId: input.defaultVoiceName || input.defaultVoiceId,
        },
      });

      clearVoiceAudio();
      setPlayingVoiceMessageId(message.id);

      // Use pre-synthesized audioUri from cache if available
      const cachedAudioUri = String(message.meta?.audioUri || '').trim();
      let objectUrl: string;

      if (cachedAudioUri) {
        objectUrl = cachedAudioUri;
      } else {
        // Fallback to on-demand synthesis (old messages / pre-synthesis failed / URL expired)
        const response = await input.synthesizeVoice(text);
        if (voicePlaybackTokenRef.current !== playbackToken) {
          return;
        }
        objectUrl = String(response.audioUri || '').trim();
      }

      if (!objectUrl) {
        throw new Error('SPEECH_OUTPUT_INVALID: empty audioUri');
      }
      const audio = new Audio(objectUrl);
      audio.onended = () => {
        if (voicePlaybackTokenRef.current !== playbackToken) return;
        clearVoiceAudio();
        setPlayingVoiceMessageId(null);
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:voice-playback:done',
          flowId: message.id,
          details: {
            targetId: input.selectedTargetId,
            worldId: input.selectedTarget?.worldId || null,
            messageId: message.id,
          },
        });
      };
      audio.onerror = () => {
        if (voicePlaybackTokenRef.current !== playbackToken) return;
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
          flowId: message.id,
          details: {
            targetId: input.selectedTargetId,
            worldId: input.selectedTarget?.worldId || null,
            messageId: message.id,
            errorCode: TTS_PLAYBACK_ERROR_CODE,
            error: TTS_PLAYBACK_ERROR_CODE,
          },
        });
      };
      voiceAudioRef.current = audio;
      voiceAudioObjectUrlRef.current = objectUrl;

      await audio.play().catch((error) => {
        throw error instanceof Error ? error : new Error(String(error || 'LOCAL_CHAT_TTS_PLAYBACK_FAILED'));
      });
    } catch (error) {
      if (voicePlaybackTokenRef.current !== playbackToken) {
        return;
      }
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
    clearVoiceAudio,
    input.defaultVoiceId,
    input.defaultVoiceName,
    input.enableVoice,
    input.synthesizeVoice,
    input.ttsRouteSource,
    input.selectedSpeechProviderId,
    input.selectedTarget,
    input.selectedTargetId,
    input.setStatusBanner,
    playingVoiceMessageId,
    stopVoicePlayback,
  ]);

  return {
    playingVoiceMessageId,
    playVoiceMessage,
    stopVoicePlayback,
  };
}
