import { useState, useRef, useCallback, useEffect } from 'react';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { createModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type {
  RuntimeCanonicalCapability,
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  MOD_ID,
  REST_REMINDER_INTERVAL_MS,
  REST_REMINDER_IDLE_RESET_MS,
  DEFAULT_BUDDY_MODEL_ID,
  type BuddyModelId,
  BUDDY_MODELS,
} from '../contracts.js';
import type { EmotionType } from '../contracts.js';
import type { ModelState } from '../live2d/model-manager.js';
import { createModelManager } from '../live2d/model-manager.js';
import {
  compileMessages,
  extractEmotion,
  createDialogueHistory,
  type ChatMessage,
} from '../services/dialogue-engine.js';
import {
  playAudioSource,
  detectMimeType,
  recordVoice,
  concatBytes,
} from '../services/voice-engine.js';
import { logBuddyConsole } from '../services/debug-log.js';
import { loadBuddySession, saveBuddySession } from '../services/session-store.js';

const TEXT_ROUTE_CAPABILITY: RuntimeCanonicalCapability = 'text.generate';
const TTS_ROUTE_CAPABILITY: RuntimeCanonicalCapability = 'audio.synthesize';
const STT_ROUTE_CAPABILITY: RuntimeCanonicalCapability = 'audio.transcribe';
const DEFAULT_TTS_AUDIO_FORMAT = 'mp3';

function pickRouteBinding(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteBinding | null {
  if (!snapshot) return null;
  const candidate = snapshot.resolvedDefault || snapshot.selected || null;
  if (!candidate || !String(candidate.model || '').trim()) {
    return null;
  }
  return candidate;
}

function ensureRouteSnapshot(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    local: {
      models: snapshot.local?.models || [],
      defaultEndpoint: snapshot.local?.defaultEndpoint,
    },
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
  };
}

function chooseBindingBySource(
  source: RuntimeRouteSource,
  options: RuntimeRouteOptionsSnapshot | null,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!options) return previous;
  if (source === 'local') {
    const local = options.local.models[0] || null;
    return {
      source: 'local',
      connectorId: '',
      model: local?.model || previous?.model || '',
      ...(local?.localModelId ? { localModelId: local.localModelId } : {}),
      ...(local?.engine ? { engine: local.engine } : {}),
    };
  }
  const connector = options.connectors[0] || null;
  return {
    source: 'cloud',
    connectorId: connector?.id || previous?.connectorId || '',
    model: connector?.models[0] || previous?.model || '',
  };
}

function chooseBindingByConnector(
  connectorId: string,
  options: RuntimeRouteOptionsSnapshot | null,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!options) return previous;
  const connector = options.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) return previous;
  return {
    source: 'cloud',
    connectorId: connector.id,
    model: connector.models[0] || previous?.model || '',
  };
}

function chooseBindingByModel(
  model: string,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const normalized = model.trim();
  if (!normalized) return previous;
  return {
    source: previous?.source || 'local',
    connectorId: previous?.connectorId || '',
    model: normalized,
    ...(previous?.localModelId ? { localModelId: previous.localModelId } : {}),
    ...(previous?.engine ? { engine: previous.engine } : {}),
  };
}

type RouteKind = 'text' | 'tts' | 'stt';

type AudioStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TtsVoiceOption {
  id: string;
  name: string;
  lang: string;
}

interface AssistantAudioCacheEntry {
  audioBytes?: Uint8Array;
  audioUri?: string;
  mimeType?: string;
}

function firstArtifactWithAudio(
  artifacts: Array<{ bytes?: Uint8Array; uri?: string; mimeType?: string }>,
): { bytes?: Uint8Array; uri?: string; mimeType?: string } | null {
  return artifacts.find((artifact) => {
    return (artifact.bytes instanceof Uint8Array && artifact.bytes.length > 0)
      || Boolean(String(artifact.uri || '').trim());
  }) || null;
}

export interface BuddyControllerState {
  modelState: ModelState;
  modelError: string | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  isRecording: boolean;
  streamingText: string;
  currentEmotion: EmotionType;
  showRestReminder: boolean;
  selectedModelId: BuddyModelId;
  textRouteOptions: RuntimeRouteOptionsSnapshot | null;
  ttsRouteOptions: RuntimeRouteOptionsSnapshot | null;
  sttRouteOptions: RuntimeRouteOptionsSnapshot | null;
  textRouteBinding: RuntimeRouteBinding | null;
  ttsRouteBinding: RuntimeRouteBinding | null;
  sttRouteBinding: RuntimeRouteBinding | null;
  routeOptionsLoading: boolean;
  voiceModeEnabled: boolean;
  ttsVoiceOptions: TtsVoiceOption[];
  ttsVoicesLoading: boolean;
  selectedTtsVoiceId: string;
  activeAudioMessageId: string | null;
  audioStatusByMessageId: Record<string, AudioStatus>;
  audioErrorByMessageId: Record<string, string>;
}

export interface BuddyControllerActions {
  mountCanvas: (canvas: HTMLCanvasElement) => void;
  loadModel: (url: string) => Promise<void>;
  tapModel: (clientX: number, clientY: number) => void;
  selectModel: (modelId: string) => void;
  setVoiceModeEnabled: (enabled: boolean) => void;
  setRouteSource: (kind: RouteKind, source: RuntimeRouteSource) => void;
  setRouteConnector: (kind: RouteKind, connectorId: string) => void;
  setRouteModel: (kind: RouteKind, model: string) => void;
  setSelectedTtsVoiceId: (voiceId: string) => void;
  sendMessage: (text: string) => Promise<void>;
  playAssistantMessageAudio: (messageId: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  dismissRestReminder: () => void;
  retry: () => void;
}

export function useBuddyController(
  sdkRuntimeContext: unknown,
): BuddyControllerState & BuddyControllerActions {
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('happy');
  const [showRestReminder, setShowRestReminder] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<BuddyModelId>(DEFAULT_BUDDY_MODEL_ID);
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false);
  const [textRouteOptions, setTextRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [ttsRouteOptions, setTtsRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [sttRouteOptions, setSttRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [textRouteBinding, setTextRouteBinding] = useState<RuntimeRouteBinding | null>(null);
  const [ttsRouteBinding, setTtsRouteBinding] = useState<RuntimeRouteBinding | null>(null);
  const [sttRouteBinding, setSttRouteBinding] = useState<RuntimeRouteBinding | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [ttsVoiceOptions, setTtsVoiceOptions] = useState<TtsVoiceOption[]>([]);
  const [ttsVoicesLoading, setTtsVoicesLoading] = useState(false);
  const [selectedTtsVoiceId, setSelectedTtsVoiceIdState] = useState('');
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const [audioStatusByMessageId, setAudioStatusByMessageId] = useState<Record<string, AudioStatus>>({});
  const [audioErrorByMessageId, setAudioErrorByMessageId] = useState<Record<string, string>>({});

  const managerRef = useRef<ReturnType<typeof createModelManager> | null>(null);
  const historyRef = useRef(createDialogueHistory());
  const runtimeRef = useRef<ReturnType<typeof createModRuntimeClient> | null>(null);
  const hookRef = useRef<ReturnType<typeof createHookClient> | null>(null);
  const recorderRef = useRef<Awaited<ReturnType<typeof recordVoice>> | null>(null);
  const lastModelUrlRef = useRef<string>('');
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackStopRef = useRef<(() => Promise<void>) | null>(null);
  const hydratedRef = useRef(false);
  const textBindingRef = useRef<RuntimeRouteBinding | null>(null);
  const ttsBindingRef = useRef<RuntimeRouteBinding | null>(null);
  const sttBindingRef = useRef<RuntimeRouteBinding | null>(null);
  const audioCacheRef = useRef<Map<string, AssistantAudioCacheEntry>>(new Map());
  const playbackTokenRef = useRef(0);

  // Initialize runtime client
  useEffect(() => {
    if (sdkRuntimeContext) {
      runtimeRef.current = createModRuntimeClient(MOD_ID, sdkRuntimeContext as any);
      hookRef.current = createHookClient(MOD_ID, sdkRuntimeContext as any);
    }
  }, [sdkRuntimeContext]);

  useEffect(() => {
    let cancelled = false;
    if (!runtimeRef.current || !hookRef.current || hydratedRef.current) {
      return;
    }

    const hydrate = async () => {
      setRouteOptionsLoading(true);
      const [session, textOptions, ttsOptions, sttOptions] = await Promise.all([
        loadBuddySession(hookRef.current),
        runtimeRef.current?.route.listOptions({ capability: TEXT_ROUTE_CAPABILITY }).catch(() => null),
        runtimeRef.current?.route.listOptions({ capability: TTS_ROUTE_CAPABILITY }).catch(() => null),
        runtimeRef.current?.route.listOptions({ capability: STT_ROUTE_CAPABILITY }).catch(() => null),
      ]);

      if (cancelled) return;

      hydratedRef.current = true;
      const normalizedTextOptions = ensureRouteSnapshot(textOptions || null);
      const normalizedTtsOptions = ensureRouteSnapshot(ttsOptions || null);
      const normalizedSttOptions = ensureRouteSnapshot(sttOptions || null);
      setTextRouteOptions(normalizedTextOptions);
      setTtsRouteOptions(normalizedTtsOptions);
      setSttRouteOptions(normalizedSttOptions);

      textBindingRef.current = session?.textBinding || pickRouteBinding(normalizedTextOptions);
      ttsBindingRef.current = session?.ttsBinding || pickRouteBinding(normalizedTtsOptions);
      sttBindingRef.current = session?.sttBinding || pickRouteBinding(normalizedSttOptions);
      setTextRouteBinding(textBindingRef.current);
      setTtsRouteBinding(ttsBindingRef.current);
      setSttRouteBinding(sttBindingRef.current);

      if (session) {
        historyRef.current.restore(session.messages);
        setMessages(session.messages);
        setSelectedModelId(session.selectedModelId);
        setVoiceModeEnabled(session.voiceModeEnabled);
        setSelectedTtsVoiceIdState(session.selectedTtsVoiceId);
      }
      setRouteOptionsLoading(false);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [sdkRuntimeContext]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void saveBuddySession(hookRef.current, {
      messages: historyRef.current.messages,
      selectedModelId,
      voiceModeEnabled,
      selectedTtsVoiceId,
      textBinding: textBindingRef.current,
      ttsBinding: ttsBindingRef.current,
      sttBinding: sttBindingRef.current,
    });
  }, [
    messages,
    selectedModelId,
    voiceModeEnabled,
    selectedTtsVoiceId,
    textRouteBinding,
    ttsRouteBinding,
    sttRouteBinding,
  ]);

  // Rest reminder timer (BD-SAFE-003)
  const resetRestTimer = useCallback(() => {
    if (restTimerRef.current) clearTimeout(restTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    restTimerRef.current = setTimeout(() => {
      setShowRestReminder(true);
    }, REST_REMINDER_INTERVAL_MS);

    // Reset on idle
    idleTimerRef.current = setTimeout(() => {
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
    }, REST_REMINDER_IDLE_RESET_MS);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
      void playbackStopRef.current?.();
      playbackCtxRef.current?.close();
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const mountCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const mgr = createModelManager((state, error) => {
      setModelState(state);
      setModelError(error ?? null);
    });
    mgr.mount(canvas);
    managerRef.current = mgr;
  }, []);

  const loadModel = useCallback(async (url: string) => {
    lastModelUrlRef.current = url;
    await managerRef.current?.loadModel(url);
  }, []);

  const tapModel = useCallback((clientX: number, clientY: number) => {
    managerRef.current?.handleTap(clientX, clientY);
  }, []);

  const selectModel = useCallback((modelId: string) => {
    const matched = BUDDY_MODELS.find((item) => item.id === modelId);
    if (matched) {
      managerRef.current?.setModelProfile(matched.id);
      setSelectedModelId(matched.id);
    }
  }, []);

  useEffect(() => {
    managerRef.current?.setModelProfile(selectedModelId);
  }, [selectedModelId]);

  const setRouteSource = useCallback((kind: RouteKind, source: RuntimeRouteSource) => {
    if (kind === 'text') {
      const next = chooseBindingBySource(source, textRouteOptions, textBindingRef.current);
      textBindingRef.current = next;
      setTextRouteBinding(next);
      return;
    }
    if (kind === 'tts') {
      const next = chooseBindingBySource(source, ttsRouteOptions, ttsBindingRef.current);
      ttsBindingRef.current = next;
      setTtsRouteBinding(next);
      return;
    }
    const next = chooseBindingBySource(source, sttRouteOptions, sttBindingRef.current);
    sttBindingRef.current = next;
    setSttRouteBinding(next);
  }, [sttRouteOptions, textRouteOptions, ttsRouteOptions]);

  const setRouteConnector = useCallback((kind: RouteKind, connectorId: string) => {
    if (kind === 'text') {
      const next = chooseBindingByConnector(connectorId, textRouteOptions, textBindingRef.current);
      textBindingRef.current = next;
      setTextRouteBinding(next);
      return;
    }
    if (kind === 'tts') {
      const next = chooseBindingByConnector(connectorId, ttsRouteOptions, ttsBindingRef.current);
      ttsBindingRef.current = next;
      setTtsRouteBinding(next);
      return;
    }
    const next = chooseBindingByConnector(connectorId, sttRouteOptions, sttBindingRef.current);
    sttBindingRef.current = next;
    setSttRouteBinding(next);
  }, [sttRouteOptions, textRouteOptions, ttsRouteOptions]);

  const setRouteModel = useCallback((kind: RouteKind, model: string) => {
    if (kind === 'text') {
      const next = chooseBindingByModel(model, textBindingRef.current);
      textBindingRef.current = next;
      setTextRouteBinding(next);
      return;
    }
    if (kind === 'tts') {
      const next = chooseBindingByModel(model, ttsBindingRef.current);
      ttsBindingRef.current = next;
      setTtsRouteBinding(next);
      return;
    }
    const next = chooseBindingByModel(model, sttBindingRef.current);
    sttBindingRef.current = next;
    setSttRouteBinding(next);
  }, []);

  const setSelectedTtsVoiceId = useCallback((voiceId: string) => {
    setSelectedTtsVoiceIdState(String(voiceId || '').trim());
    audioCacheRef.current.clear();
  }, []);

  const retry = useCallback(() => {
    if (lastModelUrlRef.current) {
      void managerRef.current?.loadModel(lastModelUrlRef.current);
    }
  }, []);

  const stopSpeakingPlayback = useCallback(async () => {
    playbackTokenRef.current += 1;
    const stopPlayback = playbackStopRef.current;
    playbackStopRef.current = null;
    if (stopPlayback) {
      try {
        await stopPlayback();
      } catch {
        // Ignore playback shutdown races.
      }
    }
    const activeContext = playbackCtxRef.current;
    playbackCtxRef.current = null;
    if (activeContext) {
      try {
        await activeContext.close();
      } catch {
        // Ignore shutdown races from already-closed contexts.
      }
    }
    managerRef.current?.stopAudio();
    managerRef.current?.stopSpeaking();
    setActiveAudioMessageId(null);
  }, []);

  const logAudioEvent = useCallback((input: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    messageId: string;
    details?: Record<string, unknown>;
  }) => {
    logBuddyConsole(input.level || 'info', input.message, {
      messageId: input.messageId,
      ...(input.details || {}),
    });
    logRendererEvent({
      level: input.level || 'info',
      area: 'buddy',
      message: input.message,
      flowId: `buddy-audio:${input.messageId}`,
      details: input.details,
    });
  }, []);

  useEffect(() => {
    const runtimeClient = runtimeRef.current;
    const binding = ttsBindingRef.current;
    if (!runtimeClient || !hydratedRef.current || !binding?.model?.trim()) {
      setTtsVoiceOptions([]);
      setSelectedTtsVoiceIdState('');
      setTtsVoicesLoading(false);
      return;
    }

    let cancelled = false;
    setTtsVoicesLoading(true);
    logBuddyConsole('debug', 'buddy:tts:voices-load-start', {
      routeSource: binding.source,
      connectorId: binding.connectorId || '',
      model: binding.model,
    });
    logRendererEvent({
      level: 'debug',
      area: 'buddy',
      message: 'buddy:tts:voices-load-start',
      flowId: `buddy-tts-voices:${binding.model}`,
      details: {
        routeSource: binding.source,
        connectorId: binding.connectorId || '',
        model: binding.model,
      },
    });

    void runtimeClient.media.tts.listVoices({
      binding,
      model: binding.model,
    }).then((result) => {
      if (cancelled) return;
      const voices = result.voices.map((voice) => ({
        id: String(voice.voiceId || '').trim(),
        name: String(voice.name || '').trim() || String(voice.voiceId || '').trim(),
        lang: String(voice.lang || '').trim(),
      })).filter((voice) => voice.id);
      setTtsVoiceOptions(voices);
      setSelectedTtsVoiceIdState((current) => {
        if (current && voices.some((voice) => voice.id === current)) {
          return current;
        }
        return voices[0]?.id || '';
      });
      setTtsVoicesLoading(false);
      audioCacheRef.current.clear();
      logBuddyConsole('debug', 'buddy:tts:voices-loaded', {
        routeSource: binding.source,
        connectorId: binding.connectorId || '',
        model: binding.model,
        voiceCount: voices.length,
        firstVoiceId: voices[0]?.id || '',
      });
      logRendererEvent({
        level: 'debug',
        area: 'buddy',
        message: 'buddy:tts:voices-loaded',
        flowId: `buddy-tts-voices:${binding.model}`,
        details: {
          routeSource: binding.source,
          connectorId: binding.connectorId || '',
          model: binding.model,
          voiceCount: voices.length,
          firstVoiceId: voices[0]?.id || '',
        },
      });
    }).catch((error) => {
      if (cancelled) return;
      setTtsVoiceOptions([]);
      setSelectedTtsVoiceIdState('');
      setTtsVoicesLoading(false);
      audioCacheRef.current.clear();
      logBuddyConsole('warn', 'buddy:tts:voices-failed', {
        routeSource: binding.source,
        connectorId: binding.connectorId || '',
        model: binding.model,
        error: error instanceof Error ? error.message : String(error || ''),
      });
      logRendererEvent({
        level: 'warn',
        area: 'buddy',
        message: 'buddy:tts:voices-failed',
        flowId: `buddy-tts-voices:${binding.model}`,
        details: {
          routeSource: binding.source,
          connectorId: binding.connectorId || '',
          model: binding.model,
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sdkRuntimeContext, ttsRouteBinding]);

  const synthesizeAssistantAudio = useCallback(async (message: ChatMessage): Promise<AssistantAudioCacheEntry | null> => {
    const cached = audioCacheRef.current.get(message.id) || null;
    if (cached) {
      setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'ready' }));
      setAudioErrorByMessageId((current) => ({ ...current, [message.id]: '' }));
      logAudioEvent({
        level: 'debug',
        message: 'buddy:tts:cache-hit',
        messageId: message.id,
        details: {
          hasAudioBytes: Boolean(cached.audioBytes?.length),
          hasAudioUri: Boolean(String(cached.audioUri || '').trim()),
          mimeType: cached.mimeType || '',
        },
      });
      return cached;
    }

    if (!runtimeRef.current) return null;
    setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'loading' }));
    setAudioErrorByMessageId((current) => ({ ...current, [message.id]: '' }));
    logAudioEvent({
      message: 'buddy:tts:start',
      messageId: message.id,
      details: {
        routeSource: ttsBindingRef.current?.source || '',
        connectorId: ttsBindingRef.current?.connectorId || '',
        model: ttsBindingRef.current?.model || '',
        voiceId: selectedTtsVoiceId || '',
        textLength: message.content.length,
      },
    });

    let audioBytes: Uint8Array | null = null;
    let audioUri = '';
    let mimeType = '';

    try {
      try {
        const streamResult = await runtimeRef.current.media.tts.stream({
          text: message.content,
          voice: selectedTtsVoiceId || undefined,
          audioFormat: DEFAULT_TTS_AUDIO_FORMAT,
          binding: ttsBindingRef.current || undefined,
        });
        const chunks: Uint8Array[] = [];
        for await (const chunk of streamResult) {
          if (chunk.chunk instanceof Uint8Array && chunk.chunk.length > 0) {
            chunks.push(chunk.chunk);
          }
          if (!mimeType && String(chunk.mimeType || '').trim()) {
            mimeType = String(chunk.mimeType || '').trim();
          }
        }
        if (chunks.length > 0) {
          audioBytes = concatBytes(chunks);
          logAudioEvent({
            level: 'debug',
            message: 'buddy:tts:stream-artifacts',
            messageId: message.id,
            details: {
              chunkCount: chunks.length,
              totalBytes: audioBytes.length,
              mimeType,
            },
          });
        }
      } catch (error) {
        audioBytes = null;
        logAudioEvent({
          level: 'warn',
          message: 'buddy:tts:stream-failed',
          messageId: message.id,
          details: {
            error: error instanceof Error ? error.message : String(error || ''),
            voiceId: selectedTtsVoiceId || '',
          },
        });
      }

      if (!audioBytes) {
        const ttsResult = await runtimeRef.current.media.tts.synthesize({
          text: message.content,
          voice: selectedTtsVoiceId || undefined,
          audioFormat: DEFAULT_TTS_AUDIO_FORMAT,
          binding: ttsBindingRef.current || undefined,
        });
        const artifact = firstArtifactWithAudio(ttsResult.artifacts);
        if (artifact?.bytes instanceof Uint8Array && artifact.bytes.length > 0) {
          audioBytes = artifact.bytes;
          mimeType = String(artifact.mimeType || '').trim();
        }
        if (!audioBytes) {
          audioUri = String(artifact?.uri || '').trim();
          if (!mimeType) {
            mimeType = String(artifact?.mimeType || '').trim();
          }
        }
        logAudioEvent({
          level: 'debug',
          message: 'buddy:tts:synthesize-artifact',
          messageId: message.id,
          details: {
            hasAudioBytes: Boolean(audioBytes?.length),
            audioBytesLength: audioBytes?.length || 0,
            hasAudioUri: Boolean(audioUri),
            mimeType,
            artifactCount: ttsResult.artifacts.length,
            voiceId: selectedTtsVoiceId || '',
          },
        });
      }

      if ((!audioBytes || audioBytes.length === 0) && !audioUri) {
        setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'error' }));
        setAudioErrorByMessageId((current) => ({ ...current, [message.id]: 'TTS 没有返回可播放音频' }));
        logAudioEvent({
          level: 'error',
          message: 'buddy:tts:empty-audio',
          messageId: message.id,
          details: {
            routeSource: ttsBindingRef.current?.source || '',
            connectorId: ttsBindingRef.current?.connectorId || '',
            model: ttsBindingRef.current?.model || '',
            voiceId: selectedTtsVoiceId || '',
          },
        });
        return null;
      }

      const entry = {
        ...(audioBytes ? { audioBytes } : {}),
        ...(audioUri ? { audioUri } : {}),
        mimeType: mimeType || (audioBytes ? detectMimeType(audioBytes.slice().buffer) : undefined),
      };
      audioCacheRef.current.set(message.id, entry);
      setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'ready' }));
      setAudioErrorByMessageId((current) => ({ ...current, [message.id]: '' }));
      logAudioEvent({
        message: 'buddy:tts:ready',
        messageId: message.id,
        details: {
          hasAudioBytes: Boolean(entry.audioBytes?.length),
          hasAudioUri: Boolean(String(entry.audioUri || '').trim()),
          mimeType: entry.mimeType || '',
          voiceId: selectedTtsVoiceId || '',
        },
      });
      return entry;
    } catch (error) {
      setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'error' }));
      setAudioErrorByMessageId((current) => ({ ...current, [message.id]: error instanceof Error ? error.message : 'TTS 生成失败' }));
      logAudioEvent({
        level: 'error',
        message: 'buddy:tts:failed',
        messageId: message.id,
        details: {
          error: error instanceof Error ? error.message : String(error || ''),
          voiceId: selectedTtsVoiceId || '',
        },
      });
      return null;
    }
  }, [logAudioEvent, selectedTtsVoiceId]);

  const playAssistantMessageAudio = useCallback(async (messageId: string) => {
    const message = historyRef.current.messages.find((item) => item.id === messageId && item.role === 'assistant') || null;
    if (!message) return;

    await stopSpeakingPlayback();
    const playbackToken = playbackTokenRef.current;
    const audio = await synthesizeAssistantAudio(message);
    if (!audio || playbackToken !== playbackTokenRef.current) {
      return;
    }

    setActiveAudioMessageId(message.id);
    managerRef.current?.startSpeaking(message.emotion);
    logAudioEvent({
      message: 'buddy:tts:playback-start',
      messageId: message.id,
      details: {
        hasAudioBytes: Boolean(audio.audioBytes?.length),
        hasAudioUri: Boolean(String(audio.audioUri || '').trim()),
        mimeType: audio.mimeType || '',
      },
    });
    try {
      const playback = await playAudioSource(audio);
      playbackCtxRef.current = playback.audioContext;
      playbackStopRef.current = playback.stop;
      managerRef.current?.feedAudio(playback.analyser, playback.lipSyncStream);
      await playback.finished;
      logAudioEvent({
        message: 'buddy:tts:playback-done',
        messageId: message.id,
      });
    } catch (error) {
      setAudioStatusByMessageId((current) => ({ ...current, [message.id]: 'error' }));
      setAudioErrorByMessageId((current) => ({ ...current, [message.id]: error instanceof Error ? error.message : '音频播放失败' }));
      logAudioEvent({
        level: 'error',
        message: 'buddy:tts:playback-failed',
        messageId: message.id,
        details: {
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    } finally {
      if (playbackToken === playbackTokenRef.current) {
        managerRef.current?.stopAudio();
        managerRef.current?.stopSpeaking();
        playbackStopRef.current = null;
        playbackCtxRef.current = null;
        setActiveAudioMessageId(null);
      }
    }
  }, [stopSpeakingPlayback, synthesizeAssistantAudio]);

  const sendMessage = useCallback(async (text: string) => {
    if (!runtimeRef.current || isGenerating) return;

    resetRestTimer();
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsGenerating(true);
    setStreamingText('');

    // Add user message
    historyRef.current.addUser(trimmed);
    setMessages([...historyRef.current.messages]);

    try {
      const compiled = compileMessages(historyRef.current.messages);
      const system = compiled[0]?.role === 'system' ? compiled[0].content : undefined;
      const input = compiled[0]?.role === 'system' ? compiled.slice(1) : compiled;
      let fullText = '';

      // BD-PIPE-001: stream text
      const stream = await runtimeRef.current.ai.text.stream({
        input,
        system,
        binding: textBindingRef.current || undefined,
      });

      for await (const chunk of stream.stream) {
        if (chunk.type === 'delta') {
          fullText += chunk.text;
          setStreamingText(fullText);
          continue;
        }
        if (chunk.type === 'error') {
          throw new Error(chunk.error.message || '生成失败，请重试');
        }
      }

      // BD-PIPE-004: extract emotion
      const { text: cleanText, emotion } = extractEmotion(fullText);
      setCurrentEmotion(emotion);
      managerRef.current?.setEmotion(emotion);

      // Add assistant message (clean)
      historyRef.current.addAssistant(cleanText, emotion);
      setMessages([...historyRef.current.messages]);
      setStreamingText('');
      const assistantMessage = historyRef.current.messages[historyRef.current.messages.length - 1] || null;
      if (voiceModeEnabled && assistantMessage?.role === 'assistant') {
        void playAssistantMessageAudio(assistantMessage.id);
      }
    } catch (err) {
      // BD-ERR-003: LLM generation failure
      const errorMsg = err instanceof Error ? err.message : '生成失败，请重试';
      historyRef.current.addAssistant(errorMsg);
      setMessages([...historyRef.current.messages]);
      setStreamingText('');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, playAssistantMessageAudio, resetRestTimer, voiceModeEnabled]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setIsRecording(true);
    try {
      recorderRef.current = await recordVoice();
    } catch {
      setIsRecording(false);
    }
  }, [isRecording]);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || !runtimeRef.current) {
      setIsRecording(false);
      return;
    }

    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      setIsRecording(false);

      // BD-PIPE-003: STT transcribe
      const arrayBuffer = await blob.arrayBuffer();
      const result = await runtimeRef.current.media.stt.transcribe({
        audio: { kind: 'bytes', bytes: new Uint8Array(arrayBuffer) },
        mimeType: blob.type,
        binding: sttBindingRef.current || undefined,
      });

      const transcribed = typeof result === 'string' ? result : (result as any)?.text ?? '';
      if (transcribed.trim()) {
        await sendMessage(transcribed);
      }
    } catch {
      setIsRecording(false);
    }
  }, [sendMessage]);

  const dismissRestReminder = useCallback(() => {
    setShowRestReminder(false);
    resetRestTimer();
  }, [resetRestTimer]);

  return {
    modelState,
    modelError,
    messages,
    isGenerating,
    isRecording,
    streamingText,
    currentEmotion,
    showRestReminder,
    selectedModelId,
    textRouteOptions,
    ttsRouteOptions,
    sttRouteOptions,
    textRouteBinding,
    ttsRouteBinding,
    sttRouteBinding,
    routeOptionsLoading,
    voiceModeEnabled,
    ttsVoiceOptions,
    ttsVoicesLoading,
    selectedTtsVoiceId,
    activeAudioMessageId,
    audioStatusByMessageId,
    audioErrorByMessageId,
    mountCanvas,
    loadModel,
    tapModel,
    selectModel,
    setVoiceModeEnabled,
    setRouteSource,
    setRouteConnector,
    setRouteModel,
    setSelectedTtsVoiceId,
    sendMessage,
    playAssistantMessageAudio,
    startRecording,
    stopRecording,
    dismissRestReminder,
    retry,
  };
}
