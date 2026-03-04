import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAiClient,
  createAiRuntimeInspector,
  type AiRuntimeDependencySnapshot,
} from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { LOCAL_CHAT_MOD_ID } from '../../contracts.js';
import type { LocalChatPromptTrace, LocalChatTurnAudit } from '../../session-store.js';
import type { ChatMessage } from '../../types.js';
import { useLocalChatRuntimeRoute } from '../use-local-chat-runtime-route.js';
import { useLocalChatSessions } from '../use-local-chat-sessions.js';
import { useLocalChatSpeechSettings } from '../use-local-chat-speech-settings.js';
import { useLocalChatTargets } from '../use-local-chat-targets.js';
import { useLocalChatTurnSend } from '../use-local-chat-turn-send.js';
import { useSpeechPlayback } from '../use-speech-playback.js';
import { useSpeechTranscribe } from '../use-speech-transcribe.js';
import { buildAgentVoiceStylePrompt } from '../../services/voice/agent-voice-style.js';
import { resolvePreferredModelForScenario } from '../../services/route/connector-model-capabilities.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

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

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionMenuAnchorRef = useRef<HTMLDivElement>(null);
  const sessionMenuPanelRef = useRef<HTMLDivElement>(null);

  const targetsState = useLocalChatTargets({
    hookClient,
    runtimeAgentId: String(runtimeFields.agentId || '').trim(),
    setStatusBanner,
  });

  const currentUserDisplayName = useMemo(
    () =>
      String(
        (currentUser as Record<string, unknown> | null)?.displayName
          || (currentUser as Record<string, unknown> | null)?.handle
          || 'User',
      ),
    [currentUser],
  );
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

  const speechSettingsState = useLocalChatSpeechSettings({
    hookClient,
  });

  const sessionsState = useLocalChatSessions({
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

  const effectiveTtsConnectorId = useMemo(
    () => (
      speechSettingsState.defaultSettings.ttsConnectorId
      || runtimeRouteState.routeOverride?.connectorId
      || runtimeRouteState.chatRouteOptions?.selected?.connectorId
      || ''
    ),
    [
      speechSettingsState.defaultSettings.ttsConnectorId,
      runtimeRouteState.routeOverride?.connectorId,
      runtimeRouteState.chatRouteOptions?.selected?.connectorId,
    ],
  );

  useEffect(() => {
    if (speechSettingsState.defaultSettings.ttsRouteSource !== 'token-api') {
      return;
    }
    const connectorId = String(effectiveTtsConnectorId || '').trim();
    if (!connectorId) {
      return;
    }
    const connectors = runtimeRouteState.chatRouteOptions?.connectors || [];
    const connector = connectors.find((item) => item.id === connectorId);
    if (!connector || connector.models.length === 0) {
      return;
    }
    const currentModel = String(speechSettingsState.defaultSettings.ttsModel || '').trim();
    if (currentModel && connector.models.includes(currentModel)) {
      return;
    }
    const fallbackModel = resolvePreferredModelForScenario({
      models: connector.models || [],
      modelCapabilities: connector.modelCapabilities,
      scenario: 'tts',
    });
    if (!fallbackModel || fallbackModel === currentModel) {
      return;
    }
    speechSettingsState.handleTtsModelChange(fallbackModel);
  }, [
    effectiveTtsConnectorId,
    runtimeRouteState.chatRouteOptions?.connectors,
    speechSettingsState.defaultSettings.ttsRouteSource,
    speechSettingsState.defaultSettings.ttsModel,
    speechSettingsState.handleTtsModelChange,
  ]);

  const effectiveRouteSource = (
    runtimeRouteState.routeOverride?.source
    || runtimeRouteState.routeSnapshot?.source
    || undefined
  ) as 'token-api' | 'local-runtime' | undefined;

  const refreshDependencySnapshot = useCallback(async () => {
    const dependencyCapability = speechSettingsState.defaultSettings.enableVoice
      ? undefined
      : 'chat';
    if (dependencyCapability === 'chat') {
      setDependencySnapshot((previous) => {
        if (!previous) return previous;
        const hasVoiceCapabilityRow = previous.dependencies.some((item) => (
          item.capability === 'tts' || item.capability === 'stt'
        ));
        return hasVoiceCapabilityRow ? null : previous;
      });
    }
    try {
      const snapshot = await aiRuntimeInspector.getDependencySnapshot(
        dependencyCapability,
        effectiveRouteSource,
      );
      setDependencySnapshot(snapshot);
    } catch (error) {
      setDependencySnapshot({
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
      });
    }
  }, [aiRuntimeInspector, speechSettingsState.defaultSettings.enableVoice, effectiveRouteSource]);

  useEffect(() => {
    void refreshDependencySnapshot();
  }, [refreshDependencySnapshot]);

  useEffect(() => {
    void refreshDependencySnapshot();
  }, [
    refreshDependencySnapshot,
    runtimeRouteState.routeSnapshot?.source,
    runtimeRouteState.routeSnapshot?.model,
    runtimeRouteState.routeOverride?.source,
    runtimeRouteState.routeOverride?.model,
  ]);

  const localSttRouteAvailable = useMemo(
    () => (runtimeRouteState.chatRouteOptions?.localRuntime.models || []).some((model) => {
      const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
      return capabilities.includes('stt');
    }),
    [runtimeRouteState.chatRouteOptions?.localRuntime.models],
  );

  const speechPlaybackState = useSpeechPlayback({
    hookClient,
    enableVoice: speechSettingsState.defaultSettings.enableVoice,
    defaultVoiceName: speechSettingsState.defaultSettings.voiceName,
    defaultVoiceId: DEFAULT_TTS_VOICE,
    defaultAudioFormat: DEFAULT_TTS_FORMAT,
    ttsRouteSource: speechSettingsState.defaultSettings.ttsRouteSource,
    ttsConnectorId: effectiveTtsConnectorId,
    ttsModel: speechSettingsState.defaultSettings.ttsModel,
    selectedSpeechProviderId: speechSettingsState.selectedSpeechProviderId,
    selectedTargetId: targetsState.selectedTargetId,
    selectedTarget: targetsState.selectedTarget,
    selectedSessionId: sessionsState.selectedSessionId,
    setStatusBanner,
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

  const synthesizeVoice = useCallback(async (text: string) => {
    const voiceStyle = buildAgentVoiceStylePrompt({
      target: targetsState.selectedTarget,
      messageText: text,
    });
    const response = await hookClient.llm.speech.synthesize({
      text,
      providerId: speechSettingsState.selectedSpeechProviderId || undefined,
      routeSource: speechSettingsState.defaultSettings.ttsRouteSource,
      connectorId: effectiveTtsConnectorId || undefined,
      model: speechSettingsState.defaultSettings.ttsModel || undefined,
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
    effectiveTtsConnectorId,
    speechSettingsState.defaultSettings.ttsModel,
    speechSettingsState.defaultSettings.voiceName,
  ]);

  const turnSendState = useLocalChatTurnSend({
    aiClient,
    inputText,
    setInputText,
    runtimeMode: runtimeFields.mode,
    chatRouteOptions: runtimeRouteState.chatRouteOptions,
    routeOverride: runtimeRouteState.routeOverride,
    routeSnapshot: runtimeRouteState.routeSnapshot
      ? {
        source: runtimeRouteState.routeSnapshot.source,
        model: runtimeRouteState.routeSnapshot.model,
      }
      : null,
    defaultSettings: speechSettingsState.defaultSettings,
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
    inputRef,
    messagesEndRef,
    sessionMenuAnchorRef,
    sessionMenuPanelRef,
    currentUserDisplayName,
    currentUserAvatarUrl,
    selectedTargetAvatarUrl,
    selectedTargetInitial,
    targetsState,
    speechSettingsState,
    sessionsState,
    runtimeRouteState,
    speechPlaybackState,
    speechTranscribeState,
    turnSendState,
  };
}
