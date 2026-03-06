import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAiClient,
  createAiRuntimeInspector,
  type AiRuntimeDependencySnapshot,
} from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { LOCAL_CHAT_MOD_ID } from '../../contracts.js';
import type { LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import type { ChatMessage, LocalChatResolvedMediaRoute } from '../../types.js';
import { useLocalChatRuntimeRoute } from '../use-local-chat-runtime-route.js';
import { useLocalChatSessions } from '../use-local-chat-sessions.js';
import { useLocalChatSpeechSettings } from '../use-local-chat-speech-settings.js';
import { useLocalChatTargets } from '../use-local-chat-targets.js';
import { useLocalChatTurnSend } from '../use-local-chat-turn-send.js';
import { useSpeechPlayback } from '../use-speech-playback.js';
import { useSpeechTranscribe } from '../use-speech-transcribe.js';
import { buildAgentVoiceStylePrompt } from '../../services/voice/agent-voice-style.js';
import { resolveModelsForScenario, resolvePreferredModelForScenario } from '../../services/route/connector-model-capabilities.js';
import {
  extractTtsFailureActionHint,
  extractTtsFailureReasonCode,
  isRetryableTtsModelFailure,
  isVoiceUnsupportedTtsFailure,
  selectNextTtsModelCandidate,
} from '../../services/tts/recovery.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import {
  buildMediaSettingsRevision,
  isResolvedMediaRouteFresh,
  preflightResolveMediaRoute,
  resolveMediaRouteFromOptions,
} from '../turn-send/media-route.js';

type RuntimeFieldsMap = {
  mode?: 'STORY' | 'SCENE_TURN';
  targetType?: string;
  agentId?: string;
  worldId?: string;
  [key: string]: unknown;
};

type AppStoreRuntimeSelectorShape = {
  runtimeFields: RuntimeFieldsMap;
  setRuntimeField: (field: string, value: string) => void;
  setStatusBanner: (input: {
    kind: 'info' | 'error' | 'success' | 'warn';
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => void;
  setActiveTab: (tab: string) => void;
  navigateToProfile: (profileId: string | null, tab: 'profile' | 'agent-detail') => void;
};

const DEFAULT_TTS_VOICE = 'alloy';
const DEFAULT_TTS_FORMAT = 'mp3';
const DEPENDENCY_SNAPSHOT_TTL_MS = 15_000;
const MEDIA_DEPENDENCY_TTL_MS = 30_000;
const RUNTIME_SIDEBAR_WARMUP_DELAY_MS = 700;
type MediaDependencyCapability = 'image' | 'video';
type MediaDependencyRouteSource = 'local-runtime' | 'token-api' | undefined;

function createDependencySnapshotFailure(error: unknown): AiRuntimeDependencySnapshot {
  return {
    modId: LOCAL_CHAT_MOD_ID,
    status: 'missing',
    routeSource: 'token-api',
    reasonCode: ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED,
    warnings: [error instanceof Error ? error.message : String(error || 'unknown error')],
    dependencies: [],
    repairActions: [{
      actionId: 'runtime:open-setup',
      label: 'Open Runtime Setup',
      reasonCode: ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED,
    }],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDependencyHint(value: string): MediaDependencyRouteSource {
  return value === 'local-runtime' || value === 'token-api'
    ? value
    : undefined;
}

export function useLocalChatPageState() {
  const runtimeFields = useAppStore((s) => (s as AppStoreRuntimeSelectorShape).runtimeFields);
  const setRuntimeField = useAppStore((s) => (s as AppStoreRuntimeSelectorShape).setRuntimeField);
  const setStatusBanner = useAppStore((s) => (s as AppStoreRuntimeSelectorShape).setStatusBanner);
  const setActiveTab = useAppStore((s) => (s as AppStoreRuntimeSelectorShape).setActiveTab);
  const navigateToProfile = useAppStore((s) => (s as AppStoreRuntimeSelectorShape).navigateToProfile);
  const currentUser = useAppStore(
    (s) => (s as { auth?: { user?: Record<string, unknown> | null } }).auth?.user || null,
  );

  const hookClient = useMemo(() => createHookClient(LOCAL_CHAT_MOD_ID), []);
  const aiClient = useMemo(() => createAiClient(LOCAL_CHAT_MOD_ID), []);
  const aiRuntimeInspector = useMemo(() => createAiRuntimeInspector(LOCAL_CHAT_MOD_ID), []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [isRuntimeSidebarOpen, setIsRuntimeSidebarOpen] = useState(false);
  const [voiceTranscriptVisibleById, setVoiceTranscriptVisibleById] = useState<Record<string, boolean>>({});
  const [voiceContextMenu, setVoiceContextMenu] = useState<{
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const [latestPromptTrace, setLatestPromptTrace] = useState<LocalChatPromptTrace | null>(null);
  const [latestTurnAudit, setLatestTurnAudit] = useState<LocalChatTurnAudit | null>(null);
  const [dependencySnapshot, setDependencySnapshot] = useState<AiRuntimeDependencySnapshot | null>(null);
  const [imageDependencySnapshot, setImageDependencySnapshot] = useState<AiRuntimeDependencySnapshot | null>(null);
  const [videoDependencySnapshot, setVideoDependencySnapshot] = useState<AiRuntimeDependencySnapshot | null>(null);
  const [imageResolvedRoute, setImageResolvedRoute] = useState<LocalChatResolvedMediaRoute | null>(null);
  const [videoResolvedRoute, setVideoResolvedRoute] = useState<LocalChatResolvedMediaRoute | null>(null);
  const [mediaRouteOptionsRevisionByCapability, setMediaRouteOptionsRevisionByCapability] = useState<Record<MediaDependencyCapability, number>>({
    image: 0,
    video: 0,
  });
  const [mediaRouteProbeLoadingByCapability, setMediaRouteProbeLoadingByCapability] = useState<Record<MediaDependencyCapability, boolean>>({
    image: false,
    video: false,
  });
  const [isMediaRuntimeSidebarLoading, setIsMediaRuntimeSidebarLoading] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionMenuAnchorRef = useRef<HTMLDivElement>(null);
  const sessionMenuPanelRef = useRef<HTMLDivElement>(null);
  const dependencySnapshotFetchedAtRef = useRef(0);
  const dependencySnapshotInFlightRef = useRef<Promise<AiRuntimeDependencySnapshot | null> | null>(null);
  const mediaDependencyFetchedAtRef = useRef<Record<MediaDependencyCapability, number>>({
    image: 0,
    video: 0,
  });
  const mediaDependencyInFlightRef = useRef<Partial<Record<MediaDependencyCapability, Promise<AiRuntimeDependencySnapshot | null>>>>({});
  const mediaSidebarVisibleLoadCountRef = useRef(0);

  const currentUserDisplayName = useMemo(
    () =>
      String(
        (currentUser as Record<string, unknown> | null)?.displayName
          || (currentUser as Record<string, unknown> | null)?.handle
          || 'User',
      ),
    [currentUser],
  );
  const currentUserId = useMemo(
    () => String((currentUser as Record<string, unknown> | null)?.id || 'viewer').trim() || 'viewer',
    [currentUser],
  );
  const currentUserAvatarUrl = useMemo(() => {
    const raw = (currentUser as Record<string, unknown> | null)?.avatarUrl;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  }, [currentUser]);

  const targetsState = useLocalChatTargets({
    hookClient,
    viewerId: currentUserId,
    runtimeAgentId: String(runtimeFields.agentId || '').trim(),
    setStatusBanner,
  });
  const selectedTargetAvatarUrl = useMemo(() => {
    const raw = targetsState.selectedTarget?.avatarUrl;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  }, [targetsState.selectedTarget]);
  const selectedTargetInitial = useMemo(
    () => (
      String(targetsState.selectedTarget?.displayName || targetsState.selectedTarget?.handle || 'A')
        .trim()
        .charAt(0)
      || 'A'
    ).toUpperCase(),
    [targetsState.selectedTarget],
  );

  const speechSettingsState = useLocalChatSpeechSettings({
    hookClient,
  });

  const sessionsState = useLocalChatSessions({
    viewerId: currentUserId,
    selectedTargetId: targetsState.selectedTargetId,
    selectedTarget: targetsState.selectedTarget,
    targets: targetsState.targets,
    allowProactiveContact: speechSettingsState.defaultSettings.allowProactiveContact,
    setMessages,
    setLatestPromptTrace,
    setLatestTurnAudit,
  });

  const runtimeRouteState = useLocalChatRuntimeRoute({
    aiClient,
    hookClient,
    setStatusBanner,
  });

  const ttsRouteOptions = runtimeRouteState.ttsRouteOptions;
  const sttRouteOptions = runtimeRouteState.sttRouteOptions;

  const ttsConnectorCandidates = useMemo(() => (
    (ttsRouteOptions?.connectors || []).map((connector) => ({
      connector,
      models: resolveModelsForScenario({
        models: connector.models || [],
        modelCapabilities: connector.modelCapabilities,
        scenario: 'tts',
      }),
    })).filter((item) => item.models.length > 0)
  ), [ttsRouteOptions?.connectors]);

  const effectiveTtsConnectorId = useMemo(
    () => {
      if (speechSettingsState.defaultSettings.ttsRouteSource === 'local-runtime') {
        return '';
      }
      const preferredConnectorId = String(speechSettingsState.defaultSettings.ttsConnectorId || '').trim();
      if (preferredConnectorId && ttsConnectorCandidates.some((item) => item.connector.id === preferredConnectorId)) {
        return preferredConnectorId;
      }
      const selectedConnectorId = String(ttsRouteOptions?.selected?.connectorId || '').trim();
      if (selectedConnectorId && ttsConnectorCandidates.some((item) => item.connector.id === selectedConnectorId)) {
        return selectedConnectorId;
      }
      return ttsConnectorCandidates[0]?.connector.id || '';
    },
    [
      speechSettingsState.defaultSettings.ttsRouteSource,
      speechSettingsState.defaultSettings.ttsConnectorId,
      ttsConnectorCandidates,
      ttsRouteOptions?.selected?.connectorId,
    ],
  );

  const effectiveTtsModel = useMemo(() => {
    const configuredModel = String(speechSettingsState.defaultSettings.ttsModel || '').trim();
    if (configuredModel) {
      return configuredModel;
    }
    const connectorId = String(effectiveTtsConnectorId || '').trim();
    if (!connectorId) {
      return configuredModel;
    }
    const candidate = ttsConnectorCandidates.find((item) => item.connector.id === connectorId) || null;
    if (!candidate) {
      return configuredModel;
    }
    const candidateModels = candidate.models;
    if (candidateModels.length === 0) {
      return configuredModel;
    }
    return candidateModels[0] || configuredModel;
  }, [
    speechSettingsState.defaultSettings.ttsModel,
    effectiveTtsConnectorId,
    ttsConnectorCandidates,
  ]);

  useEffect(() => {
    const ttsRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
    const resolvedRouteSource = ttsRouteOptions?.selected?.source;
    const shouldAlignTokenRoute = ttsRouteSource === 'token-api'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'token-api');
    if (!shouldAlignTokenRoute) {
      return;
    }
    const currentConnectorId = String(speechSettingsState.defaultSettings.ttsConnectorId || '').trim();
    const nextConnectorId = String(effectiveTtsConnectorId || '').trim();
    if (!nextConnectorId || nextConnectorId === currentConnectorId) {
      return;
    }
    speechSettingsState.handleTtsConnectorChange(nextConnectorId);
  }, [
    effectiveTtsConnectorId,
    ttsRouteOptions?.selected?.source,
    speechSettingsState.defaultSettings.ttsConnectorId,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.handleTtsConnectorChange,
  ]);

  useEffect(() => {
    const ttsRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
    const resolvedRouteSource = ttsRouteOptions?.selected?.source;
    const shouldAlignTokenRoute = ttsRouteSource === 'token-api'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'token-api');
    if (!shouldAlignTokenRoute) {
      return;
    }
    const connectorId = String(effectiveTtsConnectorId || '').trim();
    if (!connectorId) {
      return;
    }
    const candidate = ttsConnectorCandidates.find((item) => item.connector.id === connectorId) || null;
    if (!candidate || candidate.models.length === 0) {
      return;
    }
    const currentModel = String(speechSettingsState.defaultSettings.ttsModel || '').trim();
    if (currentModel && currentModel === effectiveTtsModel) {
      return;
    }
    const fallbackModel = candidate.models[0] || resolvePreferredModelForScenario({
      models: candidate.connector.models || [],
      modelCapabilities: candidate.connector.modelCapabilities,
      scenario: 'tts',
    });
    const nextModel = effectiveTtsModel || fallbackModel;
    if (!nextModel || nextModel === currentModel) {
      return;
    }
    speechSettingsState.handleTtsModelChange(nextModel);
  }, [
    effectiveTtsConnectorId,
    effectiveTtsModel,
    ttsConnectorCandidates,
    ttsRouteOptions?.selected?.source,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.defaultSettings.ttsModel,
    speechSettingsState.handleTtsModelChange,
  ]);

  useEffect(() => {
    const ttsRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
    const resolvedRouteSource = ttsRouteOptions?.selected?.source;
    const shouldUseTokenRoute = ttsRouteSource === 'token-api'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'token-api');
    if (shouldUseTokenRoute) {
      const connectorId = String(effectiveTtsConnectorId || '').trim();
      const model = String(effectiveTtsModel || '').trim();
      if (!connectorId || !model) {
        return;
      }
      void speechSettingsState.loadSpeechVoices({
        routeSource: 'token-api',
        connectorId,
        model,
      });
      return;
    }
    const providerId = String(speechSettingsState.selectedSpeechProviderId || '').trim();
    void speechSettingsState.loadSpeechVoices(providerId ? { providerId } : undefined);
  }, [
    effectiveTtsConnectorId,
    effectiveTtsModel,
    ttsRouteOptions?.selected?.source,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.selectedSpeechProviderId,
    speechSettingsState.loadSpeechVoices,
  ]);

  const effectiveRouteSource = (
    runtimeRouteState.routeOverride?.source
    || runtimeRouteState.routeSnapshot?.source
    || undefined
  ) as 'token-api' | 'local-runtime' | undefined;
  const imageDependencyRouteHint = normalizeDependencyHint(speechSettingsState.defaultSettings.imageRouteSource);
  const videoDependencyRouteHint = normalizeDependencyHint(speechSettingsState.defaultSettings.videoRouteSource);
  const imageMediaSettingsRevision = useMemo(() => buildMediaSettingsRevision({
    kind: 'image',
    settings: speechSettingsState.defaultSettings,
  }), [speechSettingsState.defaultSettings]);
  const videoMediaSettingsRevision = useMemo(() => buildMediaSettingsRevision({
    kind: 'video',
    settings: speechSettingsState.defaultSettings,
  }), [speechSettingsState.defaultSettings]);

  const setMediaRouteProbeLoading = useCallback((capability: MediaDependencyCapability, next: boolean) => {
    setMediaRouteProbeLoadingByCapability((previous) => {
      if (previous[capability] === next) {
        return previous;
      }
      return {
        ...previous,
        [capability]: next,
      };
    });
  }, []);

  useEffect(() => {
    setMediaRouteOptionsRevisionByCapability((previous) => ({
      ...previous,
      image: previous.image + 1,
    }));
  }, [runtimeRouteState.imageRouteOptions]);

  useEffect(() => {
    setMediaRouteOptionsRevisionByCapability((previous) => ({
      ...previous,
      video: previous.video + 1,
    }));
  }, [runtimeRouteState.videoRouteOptions]);

  const imageRouteOptionsRevision = mediaRouteOptionsRevisionByCapability.image;
  const videoRouteOptionsRevision = mediaRouteOptionsRevisionByCapability.video;

  useEffect(() => {
    if (speechSettingsState.defaultSettings.imageRouteSource !== 'auto') {
      setImageResolvedRoute(null);
      return;
    }
    const resolved = resolveMediaRouteFromOptions({
      kind: 'image',
      settings: speechSettingsState.defaultSettings,
      routeOptions: runtimeRouteState.imageRouteOptions,
      routeOptionsRevision: imageRouteOptionsRevision,
    });
    if (resolved) {
      setImageResolvedRoute(resolved);
      return;
    }
    setImageResolvedRoute((previous) => (
      isResolvedMediaRouteFresh({
        route: previous,
        settingsRevision: imageMediaSettingsRevision,
        routeOptionsRevision: imageRouteOptionsRevision,
      })
        ? previous
        : null
    ));
  }, [
    imageMediaSettingsRevision,
    imageRouteOptionsRevision,
    runtimeRouteState.imageRouteOptions,
    speechSettingsState.defaultSettings,
    speechSettingsState.defaultSettings.imageRouteSource,
  ]);

  useEffect(() => {
    if (speechSettingsState.defaultSettings.videoRouteSource !== 'auto') {
      setVideoResolvedRoute(null);
      return;
    }
    const resolved = resolveMediaRouteFromOptions({
      kind: 'video',
      settings: speechSettingsState.defaultSettings,
      routeOptions: runtimeRouteState.videoRouteOptions,
      routeOptionsRevision: videoRouteOptionsRevision,
    });
    if (resolved) {
      setVideoResolvedRoute(resolved);
      return;
    }
    setVideoResolvedRoute((previous) => (
      isResolvedMediaRouteFresh({
        route: previous,
        settingsRevision: videoMediaSettingsRevision,
        routeOptionsRevision: videoRouteOptionsRevision,
      })
        ? previous
        : null
    ));
  }, [
    runtimeRouteState.videoRouteOptions,
    speechSettingsState.defaultSettings,
    speechSettingsState.defaultSettings.videoRouteSource,
    videoRouteOptionsRevision,
    videoMediaSettingsRevision,
  ]);

  const probeAutoMediaRoute = useCallback(async (input: {
    capability: MediaDependencyCapability;
    force?: boolean;
  }) => {
    const kind = input.capability;
    const routeSource = kind === 'image'
      ? speechSettingsState.defaultSettings.imageRouteSource
      : speechSettingsState.defaultSettings.videoRouteSource;
    if (routeSource !== 'auto') {
      if (kind === 'image') {
        setImageResolvedRoute(null);
      } else {
        setVideoResolvedRoute(null);
      }
      return null;
    }
    const routeOptions = kind === 'image'
      ? runtimeRouteState.imageRouteOptions
      : runtimeRouteState.videoRouteOptions;
    const settingsRevision = kind === 'image'
      ? imageMediaSettingsRevision
      : videoMediaSettingsRevision;
    const routeOptionsRevision = kind === 'image'
      ? imageRouteOptionsRevision
      : videoRouteOptionsRevision;
    const currentRoute = kind === 'image' ? imageResolvedRoute : videoResolvedRoute;
    const resolvedFromOptions = resolveMediaRouteFromOptions({
      kind,
      settings: speechSettingsState.defaultSettings,
      routeOptions,
      routeOptionsRevision,
    });
    if (resolvedFromOptions) {
      if (kind === 'image') {
        setImageResolvedRoute(resolvedFromOptions);
      } else {
        setVideoResolvedRoute(resolvedFromOptions);
      }
      return resolvedFromOptions;
    }
    if (!input.force && isResolvedMediaRouteFresh({
      route: currentRoute,
      settingsRevision,
      routeOptionsRevision,
    })) {
      return currentRoute;
    }
    setMediaRouteProbeLoading(kind, true);
    try {
      const resolved = await preflightResolveMediaRoute({
        aiClient,
        kind,
        settings: speechSettingsState.defaultSettings,
        routeOptionsRevision,
      });
      if (kind === 'image') {
        setImageResolvedRoute(resolved);
      } else {
        setVideoResolvedRoute(resolved);
      }
      return resolved;
    } finally {
      setMediaRouteProbeLoading(kind, false);
    }
  }, [
    aiClient,
    imageMediaSettingsRevision,
    imageRouteOptionsRevision,
    imageResolvedRoute,
    runtimeRouteState.imageRouteOptions,
    runtimeRouteState.videoRouteOptions,
    setMediaRouteProbeLoading,
    speechSettingsState.defaultSettings,
    videoRouteOptionsRevision,
    videoMediaSettingsRevision,
    videoResolvedRoute,
  ]);

  const refreshDependencySnapshot = useCallback(async (force = false) => {
    const dependencyCapability = speechSettingsState.defaultSettings.enableVoice
      ? undefined
      : 'chat';
    const now = Date.now();
    const isFresh = !force
      && dependencySnapshotFetchedAtRef.current > 0
      && (now - dependencySnapshotFetchedAtRef.current) < DEPENDENCY_SNAPSHOT_TTL_MS;
    if (isFresh) {
      return dependencySnapshot;
    }
    if (dependencySnapshotInFlightRef.current && !force) {
      return dependencySnapshotInFlightRef.current;
    }
    if (dependencyCapability === 'chat') {
      setDependencySnapshot((previous) => {
        if (!previous) return previous;
        const hasVoiceCapabilityRow = previous.dependencies.some((item) => (
          item.capability === 'tts' || item.capability === 'stt'
        ));
        return hasVoiceCapabilityRow ? null : previous;
      });
    }
    const task = (async () => {
      try {
        const snapshot = await aiRuntimeInspector.getDependencySnapshot(
          dependencyCapability,
          effectiveRouteSource,
        );
        dependencySnapshotFetchedAtRef.current = Date.now();
        setDependencySnapshot(snapshot);
        return snapshot;
      } catch (error) {
        const fallbackSnapshot = createDependencySnapshotFailure(error);
        dependencySnapshotFetchedAtRef.current = Date.now();
        setDependencySnapshot(fallbackSnapshot);
        return fallbackSnapshot;
      }
    })();
    dependencySnapshotInFlightRef.current = task;
    void task.finally(() => {
      if (dependencySnapshotInFlightRef.current === task) {
        dependencySnapshotInFlightRef.current = null;
      }
    });
    return task;
  }, [
    aiRuntimeInspector,
    dependencySnapshot,
    speechSettingsState.defaultSettings.enableVoice,
    effectiveRouteSource,
  ]);

  const refreshMediaDependencySnapshot = useCallback(async (input: {
    capability: MediaDependencyCapability;
    routeSourceHint?: MediaDependencyRouteSource;
    force?: boolean;
  }) => {
    const now = Date.now();
    const lastFetchedAt = mediaDependencyFetchedAtRef.current[input.capability] || 0;
    const isFresh = !input.force && lastFetchedAt > 0 && (now - lastFetchedAt) < MEDIA_DEPENDENCY_TTL_MS;
    if (isFresh) {
      return input.capability === 'image' ? imageDependencySnapshot : videoDependencySnapshot;
    }
    const inFlight = mediaDependencyInFlightRef.current[input.capability];
    if (inFlight && !input.force) {
      return inFlight;
    }
    const task = (async () => {
      try {
        const snapshot = await aiRuntimeInspector.getDependencySnapshot(
          input.capability,
          input.routeSourceHint,
        );
        mediaDependencyFetchedAtRef.current[input.capability] = Date.now();
        if (input.capability === 'image') {
          setImageDependencySnapshot(snapshot);
        } else {
          setVideoDependencySnapshot(snapshot);
        }
        return snapshot;
      } catch (error) {
        const fallbackSnapshot = createDependencySnapshotFailure(error);
        mediaDependencyFetchedAtRef.current[input.capability] = Date.now();
        if (input.capability === 'image') {
          setImageDependencySnapshot(fallbackSnapshot);
        } else {
          setVideoDependencySnapshot(fallbackSnapshot);
        }
        return fallbackSnapshot;
      }
    })();
    mediaDependencyInFlightRef.current[input.capability] = task;
    void task.finally(() => {
      if (mediaDependencyInFlightRef.current[input.capability] === task) {
        delete mediaDependencyInFlightRef.current[input.capability];
      }
    });
    return task;
  }, [
    aiRuntimeInspector,
    imageDependencySnapshot,
    videoDependencySnapshot,
  ]);

  const refreshImageDependencySnapshot = useCallback((force = false) => (
    refreshMediaDependencySnapshot({
      capability: 'image',
      routeSourceHint: imageDependencyRouteHint,
      force,
    })
  ), [imageDependencyRouteHint, refreshMediaDependencySnapshot]);

  const refreshVideoDependencySnapshot = useCallback((force = false) => (
    refreshMediaDependencySnapshot({
      capability: 'video',
      routeSourceHint: videoDependencyRouteHint,
      force,
    })
  ), [videoDependencyRouteHint, refreshMediaDependencySnapshot]);

  const refreshMediaDependencies = useCallback(async (force = false) => {
    await Promise.all([
      refreshImageDependencySnapshot(force),
      refreshVideoDependencySnapshot(force),
    ]);
  }, [refreshImageDependencySnapshot, refreshVideoDependencySnapshot]);

  useEffect(() => {
    if (!isRuntimeSidebarOpen) {
      return;
    }
    void refreshDependencySnapshot();
  }, [
    isRuntimeSidebarOpen,
    refreshDependencySnapshot,
    runtimeRouteState.routeSnapshot?.source,
    runtimeRouteState.routeSnapshot?.model,
    runtimeRouteState.routeOverride?.source,
    runtimeRouteState.routeOverride?.model,
  ]);

  useEffect(() => {
    if (isRuntimeSidebarOpen) {
      return;
    }
    if (!targetsState.selectedTargetId) {
      return;
    }
    const warmTimer = setTimeout(() => {
      void runtimeRouteState.loadBootstrapRuntimeRouteOptions();
      void refreshDependencySnapshot();
    }, RUNTIME_SIDEBAR_WARMUP_DELAY_MS);
    return () => {
      clearTimeout(warmTimer);
    };
  }, [
    isRuntimeSidebarOpen,
    targetsState.selectedTargetId,
    runtimeRouteState.loadBootstrapRuntimeRouteOptions,
    refreshDependencySnapshot,
  ]);

  const runMediaRuntimeSidebarLoad = useCallback(async (input?: {
    exposeLoading?: boolean;
    forceDependencies?: boolean;
    forceRouteOptions?: boolean;
    forceRouteProbe?: boolean;
  }) => {
    const shouldLoadImageRouteOptions = Boolean(input?.forceRouteOptions) || !runtimeRouteState.imageRouteOptions;
    const shouldLoadVideoRouteOptions = Boolean(input?.forceRouteOptions) || !runtimeRouteState.videoRouteOptions;
    const shouldLoadImageDependencies = Boolean(input?.forceDependencies) || !imageDependencySnapshot;
    const shouldLoadVideoDependencies = Boolean(input?.forceDependencies) || !videoDependencySnapshot;
    if (
      !shouldLoadImageRouteOptions
      && !shouldLoadVideoRouteOptions
      && !shouldLoadImageDependencies
      && !shouldLoadVideoDependencies
    ) {
      return;
    }
    if (input?.exposeLoading) {
      mediaSidebarVisibleLoadCountRef.current += 1;
      setIsMediaRuntimeSidebarLoading(true);
    }
    try {
      await Promise.all([
        shouldLoadImageRouteOptions
          ? runtimeRouteState.loadImageRuntimeRouteOptions()
          : Promise.resolve(runtimeRouteState.imageRouteOptions),
        shouldLoadVideoRouteOptions
          ? runtimeRouteState.loadVideoRuntimeRouteOptions()
          : Promise.resolve(runtimeRouteState.videoRouteOptions),
      ]);
      await Promise.all([
        probeAutoMediaRoute({
          capability: 'image',
          force: Boolean(input?.forceRouteProbe) || Boolean(input?.forceRouteOptions),
        }),
        probeAutoMediaRoute({
          capability: 'video',
          force: Boolean(input?.forceRouteProbe) || Boolean(input?.forceRouteOptions),
        }),
        shouldLoadImageDependencies
          ? refreshImageDependencySnapshot(Boolean(input?.forceDependencies))
          : Promise.resolve(imageDependencySnapshot),
        shouldLoadVideoDependencies
          ? refreshVideoDependencySnapshot(Boolean(input?.forceDependencies))
          : Promise.resolve(videoDependencySnapshot),
      ]);
    } finally {
      if (input?.exposeLoading) {
        mediaSidebarVisibleLoadCountRef.current = Math.max(0, mediaSidebarVisibleLoadCountRef.current - 1);
        if (mediaSidebarVisibleLoadCountRef.current === 0) {
          setIsMediaRuntimeSidebarLoading(false);
        }
      }
    }
  }, [
    imageDependencySnapshot,
    probeAutoMediaRoute,
    refreshImageDependencySnapshot,
    refreshVideoDependencySnapshot,
    runtimeRouteState.imageRouteOptions,
    runtimeRouteState.loadImageRuntimeRouteOptions,
    runtimeRouteState.loadVideoRuntimeRouteOptions,
    runtimeRouteState.videoRouteOptions,
    videoDependencySnapshot,
  ]);

  useEffect(() => {
    if (!isRuntimeSidebarOpen) {
      return;
    }
    const warmTimer = window.setTimeout(() => {
      void runMediaRuntimeSidebarLoad();
    }, 900);
    return () => {
      window.clearTimeout(warmTimer);
    };
  }, [isRuntimeSidebarOpen, runMediaRuntimeSidebarLoad]);

  useEffect(() => {
    if (!isRuntimeSidebarOpen || speechSettingsState.defaultSettings.imageRouteSource !== 'auto') {
      return;
    }
    void probeAutoMediaRoute({ capability: 'image' });
  }, [
    imageRouteOptionsRevision,
    isRuntimeSidebarOpen,
    probeAutoMediaRoute,
    speechSettingsState.defaultSettings.imageRouteSource,
  ]);

  useEffect(() => {
    if (!isRuntimeSidebarOpen || speechSettingsState.defaultSettings.videoRouteSource !== 'auto') {
      return;
    }
    void probeAutoMediaRoute({ capability: 'video' });
  }, [
    isRuntimeSidebarOpen,
    probeAutoMediaRoute,
    speechSettingsState.defaultSettings.videoRouteSource,
    videoRouteOptionsRevision,
  ]);

  const localSttRouteAvailable = useMemo(
    () => (sttRouteOptions?.localRuntime.models || runtimeRouteState.chatRouteOptions?.localRuntime.models || []).some((model) => {
      const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
      return capabilities.includes('stt');
    }),
    [runtimeRouteState.chatRouteOptions?.localRuntime.models, sttRouteOptions?.localRuntime.models],
  );

  const synthesizeVoiceOnce = useCallback(async (text: string, modelOverride?: string) => {
    const voiceStyle = buildAgentVoiceStylePrompt({
      target: targetsState.selectedTarget,
      messageText: text,
    });
    const response = await hookClient.llm.speech.synthesize({
      text,
      providerId: speechSettingsState.selectedSpeechProviderId || undefined,
      routeSource: speechSettingsState.defaultSettings.ttsRouteSource,
      connectorId: effectiveTtsConnectorId || undefined,
      model: String(modelOverride || effectiveTtsModel || '').trim() || undefined,
      voiceId: speechSettingsState.defaultSettings.voiceName,
      format: DEFAULT_TTS_FORMAT,
      language: voiceStyle.language,
      stylePrompt: voiceStyle.stylePrompt,
      targetId: targetsState.selectedTargetId,
      sessionId: sessionsState.selectedSessionId || undefined,
    });
    return { audioUri: String(response.audioUri || '').trim() };
  }, [
    hookClient.llm.speech,
    targetsState.selectedTarget,
    targetsState.selectedTargetId,
    sessionsState.selectedSessionId,
    speechSettingsState.selectedSpeechProviderId,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.defaultSettings.voiceName,
    effectiveTtsConnectorId,
    effectiveTtsModel,
  ]);

  const synthesizeVoice = useCallback(async (text: string) => {
    const currentModel = String(effectiveTtsModel || '').trim();
    try {
      return await synthesizeVoiceOnce(text, currentModel);
    } catch (error) {
      const reasonCode = extractTtsFailureReasonCode(error);
      const actionHint = extractTtsFailureActionHint(error);
      const connectorId = String(effectiveTtsConnectorId || '').trim();
      if (isVoiceUnsupportedTtsFailure(reasonCode, actionHint)) {
        setStatusBanner({
          kind: 'warn',
          message: 'Current voice is not supported by the selected TTS model. Please choose another voice or refresh voice list.',
          actionLabel: 'Refresh Voice List',
          onAction: () => {
            void speechSettingsState.loadSpeechCatalog();
          },
        });
        logRendererEvent({
          level: 'warn',
          area: 'local-chat',
          message: 'local-chat-voice-unsupported',
          details: {
            targetId: targetsState.selectedTargetId,
            worldId: targetsState.selectedTarget?.worldId || null,
            connectorId: connectorId || null,
            model: currentModel || null,
            voiceId: speechSettingsState.defaultSettings.voiceName,
            reasonCode,
            actionHint,
            error: error instanceof Error ? error.message : String(error || ''),
          },
        });
        throw error;
      }
      if (!isRetryableTtsModelFailure(reasonCode) || !connectorId) {
        throw error;
      }
      const connectorModelCandidates = ttsConnectorCandidates.find(
        (item) => item.connector.id === connectorId,
      )?.models || [];
      const nextModel = selectNextTtsModelCandidate(connectorModelCandidates, currentModel);
      if (!nextModel || nextModel === currentModel) {
        throw error;
      }
      speechSettingsState.handleTtsModelChange(nextModel);
      return synthesizeVoiceOnce(text, nextModel);
    }
  }, [
    effectiveTtsModel,
    effectiveTtsConnectorId,
    setStatusBanner,
    ttsConnectorCandidates,
    targetsState.selectedTarget,
    targetsState.selectedTargetId,
    speechSettingsState.defaultSettings.voiceName,
    speechSettingsState.loadSpeechCatalog,
    speechSettingsState.handleTtsModelChange,
    synthesizeVoiceOnce,
  ]);

  const speechPlaybackState = useSpeechPlayback({
    enableVoice: speechSettingsState.defaultSettings.enableVoice,
    defaultVoiceName: speechSettingsState.defaultSettings.voiceName,
    defaultVoiceId: DEFAULT_TTS_VOICE,
    ttsRouteSource: speechSettingsState.defaultSettings.ttsRouteSource,
    selectedSpeechProviderId: speechSettingsState.selectedSpeechProviderId,
    selectedTargetId: targetsState.selectedTargetId,
    selectedTarget: targetsState.selectedTarget,
    setStatusBanner,
    synthesizeVoice,
    onVoiceUnsupported: () => {
      setIsRuntimeSidebarOpen(true);
      void speechSettingsState.loadSpeechCatalog();
    },
  });

  const speechTranscribeState = useSpeechTranscribe({
    aiClient,
    enableVoice: speechSettingsState.defaultSettings.enableVoice,
    sttRouteSource: speechSettingsState.defaultSettings.sttRouteSource,
    localSttRouteAvailable,
    selectedTargetId: targetsState.selectedTargetId,
    selectedSessionId: sessionsState.selectedSessionId,
    setInputText,
    setStatusBanner,
    onOpenRuntimeSetup: () => {
      setActiveTab('runtime');
    },
    onSwitchSttToTokenApi: () => {
      speechSettingsState.handleSttRouteSourceChange('token-api');
    },
  });

  const turnSendState = useLocalChatTurnSend({
    aiClient,
    viewerId: currentUserId,
    viewerDisplayName: currentUserDisplayName,
    inputText,
    setInputText,
    runtimeMode: runtimeFields.mode,
    chatRouteOptions: runtimeRouteState.chatRouteOptions,
    imageRouteOptions: runtimeRouteState.imageRouteOptions,
    videoRouteOptions: runtimeRouteState.videoRouteOptions,
    imageRouteOptionsRevision,
    videoRouteOptionsRevision,
    routeOverride: runtimeRouteState.routeOverride,
    routeSnapshot: runtimeRouteState.routeSnapshot
      ? {
        source: runtimeRouteState.routeSnapshot.source,
        model: runtimeRouteState.routeSnapshot.model,
      }
      : null,
    imageResolvedRoute,
    videoResolvedRoute,
    defaultSettings: speechSettingsState.defaultSettings,
    selectedTarget: targetsState.selectedTarget,
    selectedSessionId: sessionsState.selectedSessionId,
    messages,
    setMessages,
    setSessions: sessionsState.setSessions,
    setSelectedSessionId: sessionsState.setSelectedSessionId,
    setLatestPromptTrace,
    setLatestTurnAudit,
    imageDependencySnapshot,
    videoDependencySnapshot,
    setStatusBanner,
    isTranscribing: speechTranscribeState.voiceInputState === 'transcribing',
    onOpenRuntimeSetup: () => {
      setActiveTab('runtime');
    },
    synthesizeVoice: speechSettingsState.defaultSettings.enableVoice
      ? synthesizeVoice
      : undefined,
  });

  const bootstrapRuntimeSidebar = useCallback(() => {
    void runtimeRouteState.loadBootstrapRuntimeRouteOptions();
  }, [runtimeRouteState.loadBootstrapRuntimeRouteOptions]);

  const loadChatRuntimeSidebarData = useCallback(() => {
    void runtimeRouteState.loadBootstrapRuntimeRouteOptions();
  }, [runtimeRouteState.loadBootstrapRuntimeRouteOptions]);

  const loadVoiceRuntimeSidebarData = useCallback(() => {
    void speechSettingsState.ensureSpeechCatalogLoaded();
    void Promise.all([
      runtimeRouteState.loadTtsRuntimeRouteOptions(),
      runtimeRouteState.loadSttRuntimeRouteOptions(),
    ]);
  }, [
    runtimeRouteState.loadTtsRuntimeRouteOptions,
    runtimeRouteState.loadSttRuntimeRouteOptions,
    speechSettingsState.ensureSpeechCatalogLoaded,
  ]);

  const loadMediaRuntimeSidebarData = useCallback(() => {
    void runMediaRuntimeSidebarLoad({ exposeLoading: true });
  }, [runMediaRuntimeSidebarLoad]);

  const refreshMediaRuntimeSidebarData = useCallback(() => {
    void runMediaRuntimeSidebarLoad({
      exposeLoading: true,
      forceDependencies: true,
      forceRouteOptions: true,
      forceRouteProbe: true,
    });
  }, [runMediaRuntimeSidebarLoad]);

  return {
    runtimeFields,
    setRuntimeField,
    setActiveTab,
    setStatusBanner,
    navigateToProfile,
    hookClient,
    aiClient,
    messages,
    setMessages,
    inputText,
    setInputText,
    isSessionMenuOpen,
    setIsSessionMenuOpen,
    isRuntimeSidebarOpen,
    setIsRuntimeSidebarOpen,
    voiceTranscriptVisibleById,
    setVoiceTranscriptVisibleById,
    voiceContextMenu,
    setVoiceContextMenu,
    latestPromptTrace,
    setLatestPromptTrace,
    latestTurnAudit,
    setLatestTurnAudit,
    dependencySnapshot,
    imageDependencySnapshot,
    videoDependencySnapshot,
    imageResolvedRoute,
    videoResolvedRoute,
    imageRouteOptionsRevision,
    videoRouteOptionsRevision,
    mediaRouteProbeLoadingByCapability,
    isMediaRuntimeSidebarLoading,
    bootstrapRuntimeSidebar,
    loadChatRuntimeSidebarData,
    loadVoiceRuntimeSidebarData,
    loadMediaRuntimeSidebarData,
    refreshMediaRuntimeSidebarData,
    refreshDependencySnapshot,
    refreshMediaDependencies,
    inputRef,
    messagesEndRef,
    sessionMenuAnchorRef,
    sessionMenuPanelRef,
    currentUserDisplayName,
    currentUserAvatarUrl,
    selectedTargetAvatarUrl,
    selectedTargetInitial,
    effectiveTtsConnectorId,
    effectiveTtsModel,
    targetsState,
    speechSettingsState,
    sessionsState,
    runtimeRouteState,
    speechPlaybackState,
    speechTranscribeState,
    turnSendState,
  };
}
