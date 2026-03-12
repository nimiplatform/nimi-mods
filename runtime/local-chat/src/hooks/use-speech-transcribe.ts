import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { LocalChatAiClient } from '../runtime-ai-client.js';

type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'failed';

type StatusBannerPayload = {
  kind: 'warning' | 'error' | 'info' | 'success';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type UseSpeechTranscribeInput = {
  aiClient: Pick<LocalChatAiClient, 'transcribeAudio'>;
  enableVoice: boolean;
  sttRouteSource: 'auto' | 'local' | 'cloud';
  localSttRouteAvailable: boolean;
  selectedTargetId: string;
  selectedSessionId: string;
  setInputText: Dispatch<SetStateAction<string>>;
  setStatusBanner: (payload: StatusBannerPayload) => void;
  onOpenRuntimeSetup?: () => void;
  onSwitchSttToCloud?: () => void;
};

const DEFAULT_AUDIO_MIME = 'audio/webm';
const CHUNK_SIZE_MS = 250;

export function resolveVoiceInputPreflightError(input: {
  enableVoice: boolean;
  selectedTargetId: string;
  sttRouteSource: UseSpeechTranscribeInput['sttRouteSource'];
  localSttRouteAvailable: boolean;
}): {
  reasonCode: string;
  detail: string;
} | null {
  if (!input.enableVoice) {
    return {
      reasonCode: 'LOCAL_CHAT_STT_VOICE_DISABLED',
      detail: 'Voice input is disabled',
    };
  }
  if (!String(input.selectedTargetId || '').trim()) {
    return {
      reasonCode: 'LOCAL_CHAT_STT_TARGET_REQUIRED',
      detail: 'Select an Agent before recording',
    };
  }
  if (input.sttRouteSource === 'local' && !input.localSttRouteAvailable) {
    return {
      reasonCode: 'LOCAL_CHAT_STT_LOCAL_ROUTE_UNAVAILABLE',
      detail: 'No local STT-capable model is available',
    };
  }
  return null;
}

function resolveRouteBinding(
  source: UseSpeechTranscribeInput['sttRouteSource'],
): { source: 'local' | 'cloud'; connectorId: string; model: string } | undefined {
  if (source === 'local' || source === 'cloud') {
    return {
      source,
      connectorId: '',
      model: '',
    };
  }
  return undefined;
}

function resolveRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return candidates[0] || '';
  }
  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  return supported || '';
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  if (typeof btoa !== 'function') {
    throw new Error('LOCAL_CHAT_STT_BASE64_UNAVAILABLE');
  }
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return '';
  }
  return encodeBase64(bytes);
}

function resolveStartErrorCode(error: unknown): string {
  const name = String((error as { name?: unknown })?.name || '').trim();
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'LOCAL_CHAT_STT_PERMISSION_DENIED';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'LOCAL_CHAT_STT_INPUT_DEVICE_NOT_FOUND';
  if (name === 'NotReadableError' || name === 'AbortError') return 'LOCAL_CHAT_STT_INPUT_DEVICE_UNAVAILABLE';
  return 'LOCAL_CHAT_STT_RECORDING_START_FAILED';
}

export function useSpeechTranscribe(input: UseSpeechTranscribeInput) {
  const [voiceInputState, setVoiceInputState] = useState<VoiceInputState>('idle');
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>(DEFAULT_AUDIO_MIME);
  const finalizingRef = useRef(false);
  const unmountedRef = useRef(false);

  const teardownMedia = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      mediaRecorderRef.current = null;
    }
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // no-op
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  const safeSetVoiceInputState = useCallback((next: VoiceInputState) => {
    if (unmountedRef.current) return;
    setVoiceInputState(next);
  }, []);

  const emitFailureBanner = useCallback((reasonCode: string, detail: string) => {
    const hasOpenRuntime = typeof input.onOpenRuntimeSetup === 'function';
    const hasCloudFallback = typeof input.onSwitchSttToCloud === 'function';
    const shouldOpenRuntime = input.sttRouteSource === 'local' || !hasCloudFallback;

    let actionLabel: string | undefined;
    let onAction: (() => void) | undefined;

    if (shouldOpenRuntime && hasOpenRuntime) {
      actionLabel = 'Open AI Runtime';
      onAction = input.onOpenRuntimeSetup;
    } else if (hasCloudFallback) {
      actionLabel = 'Use Cloud';
      onAction = input.onSwitchSttToCloud;
    }

    input.setStatusBanner({
      kind: 'warning',
      message: `${detail} (${reasonCode}).`,
      ...(actionLabel && onAction ? { actionLabel, onAction } : {}),
    });
  }, [input]);

  const finalizeRecording = useCallback(async (
    mode: 'transcribe' | 'cancel',
    reasonCode?: string,
  ) => {
    if (finalizingRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      teardownMedia();
      safeSetVoiceInputState('idle');
      return;
    }

    finalizingRef.current = true;
    if (mode === 'transcribe') {
      safeSetVoiceInputState('transcribing');
    }

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const handleStop = () => {
          recorder.removeEventListener('error', handleError as EventListener);
          const mimeType = recorder.mimeType || recorderMimeTypeRef.current || DEFAULT_AUDIO_MIME;
          resolve(new Blob(audioChunksRef.current, { type: mimeType }));
        };
        const handleError = () => {
          recorder.removeEventListener('stop', handleStop);
          reject(new Error('LOCAL_CHAT_STT_RECORDING_STOP_FAILED'));
        };

        if (recorder.state === 'inactive') {
          handleStop();
          return;
        }

        recorder.addEventListener('stop', handleStop, { once: true });
        recorder.addEventListener('error', handleError as EventListener, { once: true });
        recorder.stop();
      });

      teardownMedia();

      if (mode === 'cancel') {
        safeSetVoiceInputState('idle');
        setLastErrorCode(reasonCode || null);
        return;
      }

      if (blob.size === 0) {
        throw new Error('LOCAL_CHAT_STT_EMPTY_AUDIO');
      }

      const audioBase64 = await blobToBase64(blob);
      if (!audioBase64) {
        throw new Error('LOCAL_CHAT_STT_EMPTY_AUDIO_BASE64');
      }

      const routeBinding = resolveRouteBinding(input.sttRouteSource);
      const response = await input.aiClient.transcribeAudio({
        capability: 'audio.transcribe',
        routeBinding,
        audioBase64,
        mimeType: blob.type || recorderMimeTypeRef.current || DEFAULT_AUDIO_MIME,
      });

      const transcript = String(response.text || '').trim();
      if (!transcript) {
        throw new Error('LOCAL_CHAT_STT_EMPTY_TRANSCRIPT');
      }

      input.setInputText((previous) => {
        const current = String(previous || '').trimEnd();
        return current ? `${current} ${transcript}` : transcript;
      });

      safeSetVoiceInputState('idle');
      setLastErrorCode(null);
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:stt:transcribe:done',
        details: {
          sessionId: input.selectedSessionId,
          targetId: input.selectedTargetId,
          transcriptLength: transcript.length,
          routeSource: input.sttRouteSource,
        },
      });
    } catch (error) {
      teardownMedia();
      const reasonCode = String(error instanceof Error ? error.message : error || '').trim() || 'LOCAL_CHAT_STT_TRANSCRIBE_FAILED';
      setLastErrorCode(reasonCode);
      safeSetVoiceInputState('failed');
      emitFailureBanner(reasonCode, 'Voice transcription failed');
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:stt:transcribe:failed',
        details: {
          sessionId: input.selectedSessionId,
          targetId: input.selectedTargetId,
          reasonCode,
          routeSource: input.sttRouteSource,
        },
      });
    } finally {
      finalizingRef.current = false;
    }
  }, [
    emitFailureBanner,
    input,
    safeSetVoiceInputState,
    teardownMedia,
  ]);

  const startRecording = useCallback(async () => {
    if (voiceInputState === 'recording' || voiceInputState === 'transcribing') return;
    const preflightError = resolveVoiceInputPreflightError({
      enableVoice: input.enableVoice,
      selectedTargetId: input.selectedTargetId,
      sttRouteSource: input.sttRouteSource,
      localSttRouteAvailable: input.localSttRouteAvailable,
    });
    if (preflightError) {
      setLastErrorCode(preflightError.reasonCode);
      safeSetVoiceInputState('failed');
      emitFailureBanner(preflightError.reasonCode, preflightError.detail);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const reasonCode = 'LOCAL_CHAT_STT_MEDIA_DEVICES_UNAVAILABLE';
      setLastErrorCode(reasonCode);
      safeSetVoiceInputState('failed');
      emitFailureBanner(reasonCode, 'Microphone capture is not supported in this environment');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderMimeTypeRef.current = recorder.mimeType || mimeType || DEFAULT_AUDIO_MIME;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start(CHUNK_SIZE_MS);
      setLastErrorCode(null);
      safeSetVoiceInputState('recording');
      logRendererEvent({
        level: 'info',
        area: 'local-chat',
        message: 'local-chat:stt:recording:start',
        details: {
          sessionId: input.selectedSessionId,
          targetId: input.selectedTargetId,
          routeSource: input.sttRouteSource,
          mimeType: recorderMimeTypeRef.current,
        },
      });
    } catch (error) {
      teardownMedia();
      const reasonCode = resolveStartErrorCode(error);
      setLastErrorCode(reasonCode);
      safeSetVoiceInputState('failed');
      emitFailureBanner(reasonCode, 'Microphone access failed');
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:stt:recording:failed',
        details: {
          sessionId: input.selectedSessionId,
          targetId: input.selectedTargetId,
          reasonCode,
          routeSource: input.sttRouteSource,
        },
      });
    }
  }, [emitFailureBanner, input, safeSetVoiceInputState, teardownMedia, voiceInputState]);

  const stopRecording = useCallback(() => {
    if (voiceInputState !== 'recording') return;
    void finalizeRecording('transcribe');
  }, [finalizeRecording, voiceInputState]);

  const cancelRecording = useCallback((reasonCode = 'LOCAL_CHAT_STT_RECORDING_CANCELLED') => {
    if (voiceInputState !== 'recording') return;
    void finalizeRecording('cancel', reasonCode);
  }, [finalizeRecording, voiceInputState]);

  const toggleRecording = useCallback(() => {
    if (voiceInputState === 'recording') {
      stopRecording();
      return;
    }
    if (voiceInputState === 'transcribing') return;
    void startRecording();
  }, [startRecording, stopRecording, voiceInputState]);

  useEffect(() => {
    if (input.enableVoice) return;
    cancelRecording('LOCAL_CHAT_STT_RECORDING_CANCELLED_VOICE_DISABLED');
  }, [cancelRecording, input.enableVoice]);

  useEffect(() => () => {
    unmountedRef.current = true;
    teardownMedia();
  }, [teardownMedia]);

  return {
    voiceInputState,
    lastErrorCode,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
  };
}
