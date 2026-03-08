import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createModRuntimeInspector,
  type ModRuntimeDependencySnapshot,
} from '@nimiplatform/sdk/mod/runtime';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { readRuntimeModSettings } from '@nimiplatform/sdk/mod/settings';
import { LOCAL_CHAT_MOD_ID } from '../../contracts.js';
import type { LocalChatPromptTrace, LocalChatTurnAudit, VoiceConversationMode } from '../../session-store.js';
import type { ChatMessage } from '../../types.js';
import { useLocalChatRuntimeRoute } from '../use-local-chat-runtime-route.js';
import { useLocalChatSessions } from '../use-local-chat-sessions.js';
import { useLocalChatSpeechSettings } from '../use-local-chat-speech-settings.js';
import { useLocalChatTargets } from '../use-local-chat-targets.js';
import { useLocalChatTurnSend } from '../use-local-chat-turn-send.js';
import { useSpeechPlayback } from '../use-speech-playback.js';
import { useSpeechTranscribe } from '../use-speech-transcribe.js';
import { buildAgentVoiceStylePrompt } from '../../services/voice/agent-voice-style.js';
import { resolveSupportedVoiceId } from '../../services/voice/voice-selection.js';
import { deriveInteractionProfile } from '../turn-send/interaction-profile.js';
import {
  hasReadyLocalRuntimeModelForScenario,
  resolveEffectiveModelForScenario,
  resolveModelsForScenario,
  resolvePreferredModelForScenario,
} from '../../services/route/connector-model-capabilities.js';
import {
  extractTtsFailureActionHint,
  extractTtsFailureReasonCode,
  isVoiceUnsupportedTtsFailure,
} from '../../services/tts/recovery.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { createLocalChatAiClient } from '../../runtime-ai-client.js';
import type { InteractionSnapshot, RelationMemorySlot } from '../../state/index.js';
import {
  deleteLocalChatRelationMemorySlot,
  getLocalChatInteractionSnapshot,
  listLocalChatRelationMemorySlots,
  updateLocalChatRelationMemorySlot,
} from '../../state/index.js';
import {
  createUnsupportedMemorySyncAdapter,
  type MemorySyncStatus,
} from '../../services/memory/memory-sync-adapter.js';
import { hasStoredVoicePreference, shouldAutoPrimeVoiceDefaults } from './voice-defaults-policy.js';

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
  const runtimeClient = useMemo(() => createModRuntimeClient(LOCAL_CHAT_MOD_ID), []);
  const aiClient = useMemo(() => createLocalChatAiClient(runtimeClient), [runtimeClient]);
  const runtimeInspector = useMemo(() => createModRuntimeInspector(LOCAL_CHAT_MOD_ID), []);
  const memorySyncAdapter = useMemo(() => createUnsupportedMemorySyncAdapter(), []);

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
  const [dependencySnapshot, setDependencySnapshot] = useState<ModRuntimeDependencySnapshot | null>(null);
  const [voiceConversationModeBySessionId, setVoiceConversationModeBySessionId] = useState<Record<string, VoiceConversationMode>>({});
  const [activeInteractionSnapshot, setActiveInteractionSnapshot] = useState<InteractionSnapshot | null>(null);
  const [activeRelationMemorySlots, setActiveRelationMemorySlots] = useState<RelationMemorySlot[]>([]);
  const [memorySyncStatus, setMemorySyncStatus] = useState<MemorySyncStatus>({ state: 'unsupported' });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionMenuAnchorRef = useRef<HTMLDivElement>(null);
  const sessionMenuPanelRef = useRef<HTMLDivElement>(null);
  const didPrimeVoiceDefaultsRef = useRef(false);

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
    () =>
      String(
        (currentUser as Record<string, unknown> | null)?.id
          || (currentUser as Record<string, unknown> | null)?.userId
          || (currentUser as Record<string, unknown> | null)?.sub
          || 'local-chat-viewer',
      ).trim() || 'local-chat-viewer',
    [currentUser],
  );
  const targetsState = useLocalChatTargets({
    hookClient,
    viewerId: currentUserId,
    runtimeAgentId: String(runtimeFields.agentId || '').trim(),
    setStatusBanner,
  });
  const currentUserAvatarUrl = useMemo(() => {
    const raw = (currentUser as Record<string, unknown> | null)?.avatarUrl;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  }, [currentUser]);
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
  const selectedTargetInteractionProfile = useMemo(
    () => targetsState.selectedTarget ? deriveInteractionProfile(targetsState.selectedTarget) : null,
    [targetsState.selectedTarget],
  );

  const speechSettingsState = useLocalChatSpeechSettings({
    runtimeClient,
  });

  const sessionsState = useLocalChatSessions({
    viewerId: currentUserId,
    selectedTargetId: targetsState.selectedTargetId,
    selectedTarget: targetsState.selectedTarget,
    targets: targetsState.targets,
    setMessages,
    setLatestPromptTrace,
    setLatestTurnAudit,
  });

  const runtimeRouteState = useLocalChatRuntimeRoute({
    runtimeClient: runtimeClient.route,
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
        scenario: 'audio.synthesize',
      }),
    })).filter((item) => item.models.length > 0)
  ), [ttsRouteOptions?.connectors]);
  const localTtsRouteAvailable = useMemo(
    () => hasReadyLocalRuntimeModelForScenario({
      models: ttsRouteOptions?.local?.models || runtimeRouteState.chatRouteOptions?.local?.models || [],
      scenario: 'audio.synthesize',
    }),
    [runtimeRouteState.chatRouteOptions?.local?.models, ttsRouteOptions?.local?.models],
  );

  const effectiveTtsConnectorId = useMemo(
    () => {
      if (speechSettingsState.defaultSettings.ttsRouteSource === 'local') {
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
    const connectorId = String(effectiveTtsConnectorId || '').trim();
    if (!connectorId) {
      return configuredModel || String(ttsRouteOptions?.selected?.model || '').trim();
    }
    const candidate = ttsConnectorCandidates.find((item) => item.connector.id === connectorId) || null;
    if (!candidate) {
      return configuredModel || String(ttsRouteOptions?.selected?.model || '').trim();
    }
    return resolveEffectiveModelForScenario({
      configuredModel,
      routeSelectedModel: String(ttsRouteOptions?.selected?.model || '').trim(),
      models: candidate.connector.models || [],
      modelCapabilities: candidate.connector.modelCapabilities,
      scenario: 'audio.synthesize',
    });
  }, [
    speechSettingsState.defaultSettings.ttsModel,
    effectiveTtsConnectorId,
    ttsConnectorCandidates,
    ttsRouteOptions?.selected?.model,
  ]);

  useEffect(() => {
    const ttsRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
    const resolvedRouteSource = ttsRouteOptions?.selected?.source;
    const shouldAlignTokenRoute = ttsRouteSource === 'cloud'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'cloud');
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
    const shouldAlignTokenRoute = ttsRouteSource === 'cloud'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'cloud');
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
      scenario: 'audio.synthesize',
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
    if (!speechSettingsState.defaultSettings.enableVoice) {
      return;
    }
    const ttsRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
    const resolvedRouteSource = ttsRouteOptions?.selected?.source;
    const shouldUseTokenRoute = ttsRouteSource === 'cloud'
      || (ttsRouteSource === 'auto' && resolvedRouteSource === 'cloud');
    if (shouldUseTokenRoute) {
      const connectorId = String(effectiveTtsConnectorId || '').trim();
      const model = String(effectiveTtsModel || '').trim();
      if (!connectorId || !model) {
        return;
      }
      void speechSettingsState.loadSpeechVoices({
        routeSource: 'cloud',
        connectorId,
        model,
      });
      return;
    }
    void speechSettingsState.loadSpeechVoices();
  }, [
    effectiveTtsConnectorId,
    effectiveTtsModel,
    speechSettingsState.defaultSettings.enableVoice,
    ttsRouteOptions?.selected?.source,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.loadSpeechVoices,
  ]);

  const effectiveRouteSource = (
    runtimeRouteState.routeBinding?.source
    || runtimeRouteState.routeSnapshot?.source
    || undefined
  ) as 'cloud' | 'local' | undefined;

  const refreshDependencySnapshot = useCallback(async () => {
    const dependencyCapability = speechSettingsState.defaultSettings.enableVoice
      ? undefined
      : 'text.generate';
    if (dependencyCapability === 'text.generate') {
      setDependencySnapshot((previous) => {
        if (!previous) return previous;
        const hasVoiceCapabilityRow = previous.dependencies.some((item) => (
          item.capability === 'audio.synthesize' || item.capability === 'audio.transcribe'
        ));
        return hasVoiceCapabilityRow ? null : previous;
      });
    }
    try {
      const snapshot = await runtimeInspector.getDependencySnapshot(
        dependencyCapability,
        effectiveRouteSource,
      );
      setDependencySnapshot(snapshot);
    } catch (error) {
      setDependencySnapshot({
        modId: LOCAL_CHAT_MOD_ID,
        status: 'missing',
        routeSource: 'cloud',
        reasonCode: ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED,
        warnings: [error instanceof Error ? error.message : String(error || 'unknown error')],
        dependencies: [],
        repairActions: [{
          actionId: 'runtime:open-setup',
          label: 'Open Runtime Setup',
          reasonCode: ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED,
        }],
        updatedAt: new Date().toISOString(),
      });
    }
  }, [runtimeInspector, speechSettingsState.defaultSettings.enableVoice, effectiveRouteSource]);

  useEffect(() => {
    void refreshDependencySnapshot();
  }, [refreshDependencySnapshot]);

  useEffect(() => {
    void refreshDependencySnapshot();
  }, [
    refreshDependencySnapshot,
    runtimeRouteState.routeSnapshot?.source,
    runtimeRouteState.routeSnapshot?.model,
    runtimeRouteState.routeBinding?.source,
    runtimeRouteState.routeBinding?.model,
  ]);

  const localSttRouteAvailable = useMemo(
    () => hasReadyLocalRuntimeModelForScenario({
      models: sttRouteOptions?.local?.models || runtimeRouteState.chatRouteOptions?.local?.models || [],
      scenario: 'audio.transcribe',
    }),
    [runtimeRouteState.chatRouteOptions?.local?.models, sttRouteOptions?.local?.models],
  );

  useEffect(() => {
    if (didPrimeVoiceDefaultsRef.current) {
      return;
    }
    const ttsReady = localTtsRouteAvailable || ttsConnectorCandidates.length > 0;
    const rawSettings = readRuntimeModSettings(LOCAL_CHAT_MOD_ID);
    const looksFresh =
      speechSettingsState.productSettings.enableVoice === false
      && speechSettingsState.productSettings.voiceConversationMode === 'off';
    if (hasStoredVoicePreference(rawSettings) || !looksFresh) {
      didPrimeVoiceDefaultsRef.current = true;
      return;
    }
    if (!shouldAutoPrimeVoiceDefaults({
      alreadyPrimed: didPrimeVoiceDefaultsRef.current,
      rawSettings,
      productSettings: speechSettingsState.productSettings,
      ttsReady,
    })) {
      return;
    }
    didPrimeVoiceDefaultsRef.current = true;
    speechSettingsState.updateProductSettings((previous) => ({
      ...previous,
      enableVoice: true,
      voiceConversationMode: 'suggested',
    }));
  }, [
    localTtsRouteAvailable,
    speechSettingsState.productSettings.enableVoice,
    speechSettingsState.productSettings.voiceConversationMode,
    speechSettingsState.updateProductSettings,
    ttsConnectorCandidates.length,
  ]);

  const resolvePlayableTtsVoiceId = useCallback(async (selectedModel: string): Promise<string> => {
    const normalizedModel = String(selectedModel || '').trim();
    const currentVoiceId = String(speechSettingsState.inspectSettings.voiceName || '').trim();
    const catalogModelResolved = String(speechSettingsState.speechVoiceCatalogMeta.modelResolved || '').trim();
    let availableVoiceIds = catalogModelResolved === normalizedModel
      ? speechSettingsState.speechVoices.map((voice) => voice.id)
      : [];

    if (normalizedModel && availableVoiceIds.length === 0) {
      const configuredRouteSource = speechSettingsState.defaultSettings.ttsRouteSource;
      const resolvedRouteSource = ttsRouteOptions?.selected?.source;
      const explicitRouteSource = configuredRouteSource === 'cloud' || configuredRouteSource === 'local'
        ? configuredRouteSource
        : resolvedRouteSource === 'cloud' || resolvedRouteSource === 'local'
          ? resolvedRouteSource
          : undefined;
      const refreshedVoices = await speechSettingsState.loadSpeechVoices({
        routeSource: explicitRouteSource,
        connectorId: String(effectiveTtsConnectorId || '').trim() || undefined,
        model: normalizedModel,
      });
      availableVoiceIds = refreshedVoices.map((voice) => voice.id);
    }

    const resolvedVoiceId = resolveSupportedVoiceId({
      selectedVoiceId: currentVoiceId,
      availableVoiceIds,
      genderGuard: selectedTargetInteractionProfile?.voice.genderGuard,
      voiceAffinity: selectedTargetInteractionProfile?.voice.voiceAffinity,
    });
    if (resolvedVoiceId && resolvedVoiceId !== currentVoiceId) {
      speechSettingsState.handleVoiceIdChange(resolvedVoiceId);
    }
    return resolvedVoiceId;
  }, [
    effectiveTtsConnectorId,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.inspectSettings.voiceName,
    speechSettingsState.handleVoiceIdChange,
    speechSettingsState.loadSpeechVoices,
    speechSettingsState.speechVoiceCatalogMeta.modelResolved,
    speechSettingsState.speechVoices,
    selectedTargetInteractionProfile?.voice.genderGuard,
    selectedTargetInteractionProfile?.voice.voiceAffinity,
    ttsRouteOptions?.selected?.source,
  ]);

  const synthesizeVoiceOnce = useCallback(async (text: string, modelOverride?: string) => {
    const voiceStyle = buildAgentVoiceStylePrompt({
      target: targetsState.selectedTarget,
      messageText: text,
    });
    const selectedModel = String(modelOverride || effectiveTtsModel || '').trim();
    const selectedVoiceId = await resolvePlayableTtsVoiceId(selectedModel);
    const binding = speechSettingsState.defaultSettings.ttsRouteSource === 'cloud' || speechSettingsState.defaultSettings.ttsRouteSource === 'local'
      ? {
        source: speechSettingsState.defaultSettings.ttsRouteSource,
        connectorId: String(effectiveTtsConnectorId || '').trim(),
        model: selectedModel,
      }
      : undefined;
    logRendererEvent({
      level: 'debug',
      area: 'local-chat',
      message: 'local-chat:voice-synthesize:start',
      details: {
        targetId: targetsState.selectedTargetId,
        worldId: targetsState.selectedTarget?.worldId || null,
        routeSource: speechSettingsState.defaultSettings.ttsRouteSource,
        connectorId: String(effectiveTtsConnectorId || '').trim() || null,
        model: selectedModel || null,
        voiceId: selectedVoiceId || null,
        hasStylePrompt: Boolean(voiceStyle.stylePrompt),
      },
    });
    const response = await aiClient.synthesizeSpeech({
      text,
      voice: selectedVoiceId || undefined,
      audioFormat: DEFAULT_TTS_FORMAT,
      language: voiceStyle.language || undefined,
      model: selectedModel || undefined,
      routeBinding: binding,
      extensions: voiceStyle.stylePrompt
        ? { instruct: voiceStyle.stylePrompt }
        : undefined,
      preferStream: true,
    });
    const audioUri = String(response.audioUri || '').trim();
    const audioBytes = response.audioBytes instanceof Uint8Array && response.audioBytes.length > 0
      ? response.audioBytes
      : undefined;
    const mimeType = String(response.mimeType || '').trim()
      || (DEFAULT_TTS_FORMAT === 'mp3' ? 'audio/mpeg' : '');
    logRendererEvent({
      level: 'debug',
      area: 'local-chat',
      message: 'local-chat:voice-synthesize:done',
      details: {
        targetId: targetsState.selectedTargetId,
        worldId: targetsState.selectedTarget?.worldId || null,
        routeSource: speechSettingsState.defaultSettings.ttsRouteSource,
        connectorId: String(effectiveTtsConnectorId || '').trim() || null,
        model: selectedModel || null,
        voiceId: selectedVoiceId || null,
        hasAudioUri: Boolean(audioUri),
        hasAudioBytes: Boolean(audioBytes && audioBytes.length > 0),
        mimeType: mimeType || null,
        usedStream: response.usedStream,
      },
    });
    return {
      audioUri: audioUri || undefined,
      audioBytes,
      mimeType: mimeType || undefined,
    };
  }, [
    aiClient,
    targetsState.selectedTarget,
    speechSettingsState.defaultSettings.ttsRouteSource,
    effectiveTtsConnectorId,
    effectiveTtsModel,
    resolvePlayableTtsVoiceId,
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
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:voice-synthesize:failed',
        details: {
          targetId: targetsState.selectedTargetId,
          worldId: targetsState.selectedTarget?.worldId || null,
          connectorId: connectorId || null,
          model: currentModel || null,
          voiceId: speechSettingsState.defaultSettings.voiceName || null,
          reasonCode: reasonCode || null,
          actionHint: actionHint || null,
          error: error instanceof Error ? error.message : String(error || ''),
          retryableModelFailure: false,
        },
      });
      throw error;
    }
  }, [
    effectiveTtsModel,
    effectiveTtsConnectorId,
    setStatusBanner,
    targetsState.selectedTarget,
    targetsState.selectedTargetId,
    speechSettingsState.defaultSettings.voiceName,
    speechSettingsState.loadSpeechCatalog,
    synthesizeVoiceOnce,
  ]);

  const speechPlaybackState = useSpeechPlayback({
    enableVoice: speechSettingsState.defaultSettings.enableVoice,
    defaultVoiceName: speechSettingsState.defaultSettings.voiceName,
    defaultVoiceId: DEFAULT_TTS_VOICE,
    ttsRouteSource: speechSettingsState.defaultSettings.ttsRouteSource,
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
    onSwitchSttToCloud: () => {
      speechSettingsState.handleSttRouteSourceChange('cloud');
    },
  });

  const activeVoiceConversationMode = useMemo<VoiceConversationMode>(() => {
    const sessionId = String(sessionsState.selectedSessionId || '').trim();
    if (!sessionId) {
      return speechSettingsState.defaultSettings.voiceConversationMode;
    }
    return voiceConversationModeBySessionId[sessionId] || speechSettingsState.defaultSettings.voiceConversationMode;
  }, [
    sessionsState.selectedSessionId,
    speechSettingsState.defaultSettings.voiceConversationMode,
    voiceConversationModeBySessionId,
  ]);

  const setVoiceConversationMode = useCallback((mode: VoiceConversationMode) => {
    const sessionId = String(sessionsState.selectedSessionId || '').trim();
    if (!sessionId) {
      return;
    }
    setVoiceConversationModeBySessionId((previous) => ({
      ...previous,
      [sessionId]: mode,
    }));
  }, [sessionsState.selectedSessionId]);

  const refreshMemorySurface = useCallback(async () => {
    const targetId = String(targetsState.selectedTargetId || '').trim();
    const conversationId = String(sessionsState.selectedSessionId || '').trim();
    if (!targetId || !conversationId) {
      setActiveInteractionSnapshot(null);
      setActiveRelationMemorySlots([]);
      setMemorySyncStatus({ state: 'unsupported' });
      return;
    }
    const [snapshot, slots, syncStatus] = await Promise.all([
      getLocalChatInteractionSnapshot(conversationId),
      listLocalChatRelationMemorySlots({
        targetId,
        viewerId: currentUserId,
      }),
      memorySyncAdapter.status({
        viewerId: currentUserId,
        targetId,
        worldId: targetsState.selectedTarget?.worldId || null,
      }),
    ]);
    setActiveInteractionSnapshot(snapshot);
    setActiveRelationMemorySlots(slots);
    setMemorySyncStatus(syncStatus);
  }, [
    currentUserId,
    memorySyncAdapter,
    sessionsState.selectedSessionId,
    targetsState.selectedTarget?.worldId,
    targetsState.selectedTargetId,
  ]);

  useEffect(() => {
    void refreshMemorySurface();
  }, [refreshMemorySurface, messages.length]);

  const updateRelationMemorySlotOverride = useCallback(async (slotId: string, userOverride: RelationMemorySlot['userOverride']) => {
    const targetId = String(targetsState.selectedTargetId || '').trim();
    if (!slotId || !targetId) {
      return;
    }
    await updateLocalChatRelationMemorySlot({
      id: slotId,
      targetId,
      viewerId: currentUserId,
      updater: (previous) => ({
        ...previous,
        userOverride,
        updatedAt: new Date().toISOString(),
      }),
    });
    await refreshMemorySurface();
  }, [currentUserId, refreshMemorySurface, targetsState.selectedTargetId]);

  const deleteRelationMemorySlot = useCallback(async (slotId: string) => {
    const targetId = String(targetsState.selectedTargetId || '').trim();
    if (!slotId || !targetId) {
      return;
    }
    await deleteLocalChatRelationMemorySlot({
      id: slotId,
      targetId,
      viewerId: currentUserId,
    });
    await refreshMemorySurface();
  }, [currentUserId, refreshMemorySurface, targetsState.selectedTargetId]);

  const turnSendState = useLocalChatTurnSend({
    aiClient,
    inputText,
    setInputText,
    viewerId: currentUserId,
    viewerDisplayName: currentUserDisplayName,
    runtimeMode: runtimeFields.mode,
    chatRouteOptions: runtimeRouteState.chatRouteOptions,
    imageRouteOptions: runtimeRouteState.imageRouteOptions,
    videoRouteOptions: runtimeRouteState.videoRouteOptions,
    routeBinding: runtimeRouteState.routeBinding,
    routeSnapshot: runtimeRouteState.routeSnapshot
      ? {
        source: runtimeRouteState.routeSnapshot.source,
        model: runtimeRouteState.routeSnapshot.model,
      }
      : null,
    defaultSettings: speechSettingsState.defaultSettings,
    voiceConversationMode: activeVoiceConversationMode,
    setVoiceConversationMode,
    selectedTarget: targetsState.selectedTarget,
    selectedSessionId: sessionsState.selectedSessionId,
    messages,
    setMessages,
    setSessions: sessionsState.setSessions,
    setSelectedSessionId: sessionsState.setSelectedSessionId,
    setLatestPromptTrace,
    setLatestTurnAudit,
    setStatusBanner,
    isTranscribing: speechTranscribeState.voiceInputState === 'transcribing',
    onOpenRuntimeSetup: () => {
      setActiveTab('runtime');
    },
    synthesizeVoice: speechSettingsState.defaultSettings.enableVoice
      ? synthesizeVoice
      : undefined,
  });

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
    refreshDependencySnapshot,
    activeInteractionSnapshot,
    activeRelationMemorySlots,
    memorySyncStatus,
    refreshMemorySurface,
    updateRelationMemorySlotOverride,
    deleteRelationMemorySlot,
    inputRef,
    messagesEndRef,
    sessionMenuAnchorRef,
    sessionMenuPanelRef,
    currentUserDisplayName,
    currentUserAvatarUrl,
    selectedTargetAvatarUrl,
    selectedTargetInitial,
    selectedTargetInteractionProfile,
    activeVoiceConversationMode,
    setVoiceConversationMode,
    effectiveTtsConnectorId,
    effectiveTtsModel,
    localTtsRouteAvailable,
    localSttRouteAvailable,
    targetsState,
    speechSettingsState,
    sessionsState,
    runtimeRouteState,
    speechPlaybackState,
    speechTranscribeState,
    turnSendState,
  };
}
