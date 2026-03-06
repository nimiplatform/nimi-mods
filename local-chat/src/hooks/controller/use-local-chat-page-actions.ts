import { useCallback, useMemo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { LocalChatBooleanSettingKey } from '../../default-settings-store.js';
import type { ChatMessage } from '../../types.js';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';
import type { RuntimeStatusSidebarProps } from '../../components/sidebar/types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { resolveModelsForScenario } from '../../services/route/connector-model-capabilities.js';
import { isMediaRouteReady } from '../turn-send/media-route.js';
import { resolveRuntimeSidebarDependencyOverview } from '../../services/runtime/runtime-sidebar-overview.js';

type LocalChatPageState = ReturnType<typeof useLocalChatPageState>;

export function useLocalChatPageActions(state: LocalChatPageState) {
  const handleSpeechProviderChange = useCallback(
    (providerId: string) => {
      state.speechPlaybackState.stopVoicePlayback();
      state.speechSettingsState.handleSpeechProviderChange(providerId);
    },
    [state.speechPlaybackState, state.speechSettingsState],
  );

  const handleVoiceIdChange = useCallback(
    (voiceId: string) => {
      state.speechPlaybackState.stopVoicePlayback();
      state.speechSettingsState.handleVoiceIdChange(voiceId);
    },
    [state.speechPlaybackState, state.speechSettingsState],
  );

  const handleDefaultSettingChange = useCallback(
    (key: LocalChatBooleanSettingKey, value: boolean) => {
      state.speechSettingsState.handleDefaultSettingChange(key, value);
    },
    [state.speechSettingsState],
  );

  const handleDefaultVoiceNameChange = useCallback(
    (value: string) => {
      state.speechPlaybackState.stopVoicePlayback();
      state.speechSettingsState.handleDefaultVoiceNameChange(value);
    },
    [state.speechPlaybackState, state.speechSettingsState],
  );

  const handleVoiceContextMenu = useCallback((message: ChatMessage, event: MouseEvent<HTMLButtonElement>) => {
    if (message.kind !== 'voice') return;
    event.preventDefault();
    state.setVoiceContextMenu({
      messageId: message.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, [state.setVoiceContextMenu]);

  const handleToggleVoiceTranscript = useCallback((messageId: string) => {
    state.setVoiceTranscriptVisibleById((previous) => ({
      ...previous,
      [messageId]: !previous[messageId],
    }));
    state.setVoiceContextMenu(null);
  }, [state.setVoiceContextMenu, state.setVoiceTranscriptVisibleById]);

  const handleSendAndFocus = useCallback(async () => {
    await state.turnSendState.handleSend();
    state.inputRef.current?.focus();
  }, [state.turnSendState, state.inputRef]);

  const handleToggleVoiceInput = useCallback(() => {
    state.speechTranscribeState.toggleRecording();
  }, [state.speechTranscribeState]);

  const handleCancelVoiceInput = useCallback(() => {
    state.speechTranscribeState.cancelRecording('LOCAL_CHAT_STT_RECORDING_CANCELLED_BY_USER');
  }, [state.speechTranscribeState]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSendAndFocus();
      }
    },
    [handleSendAndFocus],
  );

  const runtimeSidebarProps = useMemo<RuntimeStatusSidebarProps>(
    () => {
      const resolvedDefaultSource = state.runtimeRouteState.chatRouteOptions?.resolvedDefault?.source;
      const dependencySnapshot = state.dependencySnapshot;
      const imageDependencySnapshot = state.imageDependencySnapshot;
      const videoDependencySnapshot = state.videoDependencySnapshot;
      const autoBoundSource: RuntimeStatusSidebarProps['autoBoundSource'] = (
        dependencySnapshot?.routeSource === 'local-runtime'
        || dependencySnapshot?.routeSource === 'token-api'
        || dependencySnapshot?.routeSource === 'mixed'
      )
        ? dependencySnapshot.routeSource
        : (
          resolvedDefaultSource === 'local-runtime' || resolvedDefaultSource === 'token-api'
        )
        ? resolvedDefaultSource
        : 'unknown';

      const localChatRuntimeModels = state.runtimeRouteState.chatRouteOptions?.localRuntime.models || [];
      const localTtsRuntimeModels = state.runtimeRouteState.ttsRouteOptions?.localRuntime.models || localChatRuntimeModels;
      const localSttRuntimeModels = state.runtimeRouteState.sttRouteOptions?.localRuntime.models || localChatRuntimeModels;
      const localTtsRouteAvailable = localTtsRuntimeModels.some((model) => {
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
        return capabilities.includes('tts');
      });
      const localSttRouteAvailable = localSttRuntimeModels.some((model) => {
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
        return capabilities.includes('stt');
      });

      const chatCapabilityMatched = (() => {
        const dependencyRows = dependencySnapshot?.dependencies || [];
        const chatRows = dependencyRows.filter((item) => item.capability === 'chat');
        if (chatRows.length > 0) {
          return chatRows.some((item) => item.selected);
        }
        const selected = state.runtimeRouteState.routeOverride || state.runtimeRouteState.chatRouteOptions?.selected || null;
        if (!selected || selected.source !== 'local-runtime') return true;
        const localModel = localChatRuntimeModels.find((model) => {
          const byId = String(model.localModelId || '').trim() === String(selected.localModelId || '').trim();
          const byModel = String(model.model || '').trim() === String(selected.model || '').trim();
          return byId || byModel;
        });
        const capabilities = Array.isArray(localModel?.capabilities) ? localModel?.capabilities : [];
        return capabilities.includes('chat');
      })();

      const isLocalSnapshotFailure = autoBoundSource === 'token-api'
        && dependencySnapshot?.reasonCode === ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED;
      const mediaPlannerEnabled = state.speechSettingsState.defaultSettings.mediaPlannerMode !== 'off';
      const imageRouteReady = isMediaRouteReady({
        kind: 'image',
        settings: state.speechSettingsState.defaultSettings,
        routeOptions: state.runtimeRouteState.imageRouteOptions,
        resolvedRoute: state.imageResolvedRoute,
        routeOptionsRevision: state.imageRouteOptionsRevision,
      });
      const videoRouteReady = isMediaRouteReady({
        kind: 'video',
        settings: state.speechSettingsState.defaultSettings,
        routeOptions: state.runtimeRouteState.videoRouteOptions,
        resolvedRoute: state.videoResolvedRoute,
        routeOptionsRevision: state.videoRouteOptionsRevision,
      });
      const imageCapabilityMatched = imageRouteReady && imageDependencySnapshot?.status === 'ready';
      const videoCapabilityMatched = videoRouteReady && videoDependencySnapshot?.status === 'ready';
      const imageRouteResolved = state.speechSettingsState.defaultSettings.imageRouteSource !== 'auto'
        || Boolean(state.imageResolvedRoute)
        || imageRouteReady;
      const videoRouteResolved = state.speechSettingsState.defaultSettings.videoRouteSource !== 'auto'
        || Boolean(state.videoResolvedRoute)
        || videoRouteReady;
      const dependencyRows = dependencySnapshot?.dependencies || [];
      const hasDependencyRowsForCapability = (capability: 'chat' | 'tts' | 'stt') => (
        dependencyRows.some((item) => item.capability === capability)
      );

      const capabilityMatchedFromSnapshot = (capability: 'chat' | 'tts' | 'stt'): boolean => {
        const rows = dependencyRows.filter((item) => item.capability === capability);
        if (rows.length === 0) {
          if (capability === 'chat') return chatCapabilityMatched;
          if (capability === 'tts') {
            if (state.speechSettingsState.defaultSettings.ttsRouteSource === 'token-api') return true;
            if (
              state.speechSettingsState.defaultSettings.ttsRouteSource === 'auto'
              && state.runtimeRouteState.ttsRouteOptions?.selected?.source === 'token-api'
            ) {
              return true;
            }
            return localTtsRouteAvailable;
          }
          if (state.speechSettingsState.defaultSettings.sttRouteSource === 'token-api') return true;
          if (
            state.speechSettingsState.defaultSettings.sttRouteSource === 'auto'
            && state.runtimeRouteState.sttRouteOptions?.selected?.source === 'token-api'
          ) {
            return true;
          }
          return localSttRouteAvailable;
        }
        return rows.some((item) => item.selected);
      };

      const isVoiceEnabled = Boolean(state.speechSettingsState.defaultSettings.enableVoice);
      const ttsCapabilityMatched = capabilityMatchedFromSnapshot('tts');
      const sttCapabilityMatched = capabilityMatchedFromSnapshot('stt');
      const dependencyRepairActions = Array.from(new Map(
        [
          ...(dependencySnapshot?.repairActions || []),
          ...(imageDependencySnapshot?.repairActions || []),
          ...(videoDependencySnapshot?.repairActions || []),
        ].filter((action) => {
          if (isLocalSnapshotFailure && String(action.capability || '').trim().toLowerCase() === 'chat') {
            return false;
          }
          const capability = String(action.capability || '').trim().toLowerCase();
          const dependencyId = String(action.dependencyId || '').trim().toLowerCase();
          const actionId = String(action.actionId || '').trim().toLowerCase();
          if (capability === 'chat') return true;
          if (!isVoiceEnabled && (
            capability === 'tts'
            || capability === 'stt'
            || dependencyId.includes('tts')
            || dependencyId.includes('stt')
            || actionId.includes('tts')
            || actionId.includes('stt')
            || actionId.includes('speech.')
          )) {
            return false;
          }
          if (!mediaPlannerEnabled && (
            capability === 'image'
            || capability === 'video'
            || dependencyId.includes('image')
            || dependencyId.includes('video')
            || actionId.includes('image')
            || actionId.includes('video')
          )) {
            return false;
          }
          return true;
        }).map((action) => [
          `${action.actionId}:${String(action.capability || '')}:${String(action.dependencyId || '')}`,
          action,
        ]),
      ).values());
      const dependencyOverview = resolveRuntimeSidebarDependencyOverview({
        isVoiceEnabled,
        mediaPlannerEnabled,
        isLocalSnapshotFailure,
        dependencySnapshotStatus: dependencySnapshot?.status,
        dependencySnapshotReasonCode: dependencySnapshot?.reasonCode,
        dependencySnapshotUpdatedAt: dependencySnapshot?.updatedAt,
        imageDependencyStatus: imageDependencySnapshot?.status,
        imageDependencyReasonCode: imageDependencySnapshot?.reasonCode,
        imageDependencyUpdatedAt: imageDependencySnapshot?.updatedAt,
        videoDependencyStatus: videoDependencySnapshot?.status,
        videoDependencyReasonCode: videoDependencySnapshot?.reasonCode,
        videoDependencyUpdatedAt: videoDependencySnapshot?.updatedAt,
        dependencyRepairActionCount: dependencyRepairActions.length,
        chatCapabilityMatched,
        chatCapabilityResolved: Boolean(dependencySnapshot) || chatCapabilityMatched,
        ttsCapabilityMatched,
        ttsCapabilityResolved: !isVoiceEnabled || hasDependencyRowsForCapability('tts') || Boolean(state.runtimeRouteState.ttsRouteOptions),
        sttCapabilityMatched,
        sttCapabilityResolved: !isVoiceEnabled || hasDependencyRowsForCapability('stt') || Boolean(state.runtimeRouteState.sttRouteOptions),
        imageCapabilityMatched,
        imageCapabilityResolved: !mediaPlannerEnabled || (
          !state.mediaRouteProbeLoadingByCapability.image
          && imageRouteResolved
          && Boolean(imageDependencySnapshot)
        ),
        videoCapabilityMatched,
        videoCapabilityResolved: !mediaPlannerEnabled || (
          !state.mediaRouteProbeLoadingByCapability.video
          && videoRouteResolved
          && Boolean(videoDependencySnapshot)
        ),
      });

      return {
        healthStatus: state.runtimeRouteState.healthStatus,
        checkingHealth: state.runtimeRouteState.checkingHealth,
        chatRouteOptions: state.runtimeRouteState.chatRouteOptions,
        imageRouteOptions: state.runtimeRouteState.imageRouteOptions,
        videoRouteOptions: state.runtimeRouteState.videoRouteOptions,
        imageResolvedRoute: state.imageResolvedRoute,
        videoResolvedRoute: state.videoResolvedRoute,
        routeOverride: state.runtimeRouteState.routeOverride,
        speechProviders: state.speechSettingsState.speechProviders,
        speechVoices: state.speechSettingsState.speechVoices,
        selectedSpeechProviderId: state.speechSettingsState.selectedSpeechProviderId,
        selectedVoiceId: state.speechSettingsState.defaultSettings.voiceName,
        ttsRouteSource: state.speechSettingsState.defaultSettings.ttsRouteSource,
        sttRouteSource: state.speechSettingsState.defaultSettings.sttRouteSource,
        imageRouteSource: state.speechSettingsState.defaultSettings.imageRouteSource,
        videoRouteSource: state.speechSettingsState.defaultSettings.videoRouteSource,
        localTtsRouteAvailable,
        localSttRouteAvailable,
        autoBoundSource,
        autoBoundModel: state.runtimeRouteState.chatRouteOptions?.resolvedDefault?.model || '',
        chatCapabilityMatched,
        dependencyCapabilities: dependencyOverview.dependencyCapabilities,
        dependencyStatus: dependencyOverview.dependencyStatus,
        dependencyReasonCode: dependencyOverview.dependencyReasonCode,
        dependencyUpdatedAt: dependencyOverview.dependencyUpdatedAt,
        isMediaRuntimeSidebarLoading: state.isMediaRuntimeSidebarLoading,
        isImageRouteProbeLoading: state.mediaRouteProbeLoadingByCapability.image,
        isVideoRouteProbeLoading: state.mediaRouteProbeLoadingByCapability.video,
        dependencyRepairActions,
        latestPromptTrace: state.latestPromptTrace,
        latestTurnAudit: state.latestTurnAudit,
        onRouteSourceChange: state.runtimeRouteState.handleRouteSourceChange,
        onRouteConnectorChange: state.runtimeRouteState.handleRouteConnectorChange,
        onRouteModelChange: state.runtimeRouteState.handleRouteModelChange,
        onClearRouteOverride: state.runtimeRouteState.clearRouteOverride,
        onSpeechProviderChange: handleSpeechProviderChange,
        onVoiceIdChange: handleVoiceIdChange,
        ttsConnectorId: state.effectiveTtsConnectorId,
        ttsModel: state.effectiveTtsModel,
        sttConnectorId: state.speechSettingsState.defaultSettings.sttConnectorId,
        sttModel: state.speechSettingsState.defaultSettings.sttModel,
        imageConnectorId: state.speechSettingsState.defaultSettings.imageConnectorId,
        imageModel: state.speechSettingsState.defaultSettings.imageModel,
        videoConnectorId: state.speechSettingsState.defaultSettings.videoConnectorId,
        videoModel: state.speechSettingsState.defaultSettings.videoModel,
        ttsConnectors: (state.runtimeRouteState.ttsRouteOptions?.connectors || []).filter((c) => {
          const models = resolveModelsForScenario({
            models: c.models || [],
            modelCapabilities: c.modelCapabilities,
            scenario: 'tts',
          });
          return models.length > 0;
        }).map((c) => ({
          id: c.id,
          label: c.label || c.id,
          models: c.models || [],
          modelCapabilities: c.modelCapabilities,
        })),
        sttConnectors: (state.runtimeRouteState.sttRouteOptions?.connectors || []).filter((c) => {
          const models = resolveModelsForScenario({
            models: c.models || [],
            modelCapabilities: c.modelCapabilities,
            scenario: 'stt',
          });
          return models.length > 0;
        }).map((c) => ({
          id: c.id,
          label: c.label || c.id,
          models: c.models || [],
          modelCapabilities: c.modelCapabilities,
        })),
        imageConnectors: (state.runtimeRouteState.imageRouteOptions?.connectors || []).filter((c) => {
          const models = resolveModelsForScenario({
            models: c.models || [],
            modelCapabilities: c.modelCapabilities,
            scenario: 'image',
          });
          return models.length > 0;
        }).map((c) => ({
          id: c.id,
          label: c.label || c.id,
          models: c.models || [],
          modelCapabilities: c.modelCapabilities,
        })),
        videoConnectors: (state.runtimeRouteState.videoRouteOptions?.connectors || []).filter((c) => {
          const models = resolveModelsForScenario({
            models: c.models || [],
            modelCapabilities: c.modelCapabilities,
            scenario: 'video',
          });
          return models.length > 0;
        }).map((c) => ({
          id: c.id,
          label: c.label || c.id,
          models: c.models || [],
          modelCapabilities: c.modelCapabilities,
        })),
        onTtsRouteSourceChange: state.speechSettingsState.handleTtsRouteSourceChange,
        onTtsConnectorChange: state.speechSettingsState.handleTtsConnectorChange,
        onTtsModelChange: state.speechSettingsState.handleTtsModelChange,
        onSttRouteSourceChange: state.speechSettingsState.handleSttRouteSourceChange,
        onSttConnectorChange: state.speechSettingsState.handleSttConnectorChange,
        onSttModelChange: state.speechSettingsState.handleSttModelChange,
        onImageRouteSourceChange: state.speechSettingsState.handleImageRouteSourceChange,
        onImageConnectorChange: state.speechSettingsState.handleImageConnectorChange,
        onImageModelChange: state.speechSettingsState.handleImageModelChange,
        onVideoRouteSourceChange: state.speechSettingsState.handleVideoRouteSourceChange,
        onVideoConnectorChange: state.speechSettingsState.handleVideoConnectorChange,
        onVideoModelChange: state.speechSettingsState.handleVideoModelChange,
        defaultSettings: state.speechSettingsState.defaultSettings,
        onDefaultSettingChange: handleDefaultSettingChange,
        onDefaultVoiceNameChange: handleDefaultVoiceNameChange,
        onMediaPlannerModeChange: state.speechSettingsState.handleMediaPlannerModeChange,
        onVideoAutoPolicyChange: state.speechSettingsState.handleVideoAutoPolicyChange,
        onRefreshMediaDependencies: () => {
          void state.refreshMediaRuntimeSidebarData();
        },
        onSidebarBootstrap: state.bootstrapRuntimeSidebar,
        onOpenChatPanel: state.loadChatRuntimeSidebarData,
        onOpenVoicePanel: state.loadVoiceRuntimeSidebarData,
        onOpenMediaPanel: state.loadMediaRuntimeSidebarData,
        onOpenRuntimeSetup: () => {
          state.setActiveTab('runtime');
        },
        onHealthCheck: () => {
          void state.runtimeRouteState.handleHealthCheck();
        },
      };
    },
    [
      state.runtimeRouteState,
      state.speechSettingsState,
      state.latestPromptTrace,
      state.latestTurnAudit,
      state.dependencySnapshot,
      state.imageDependencySnapshot,
      state.videoDependencySnapshot,
      state.imageResolvedRoute,
      state.videoResolvedRoute,
      state.imageRouteOptionsRevision,
      state.videoRouteOptionsRevision,
      state.mediaRouteProbeLoadingByCapability,
      state.bootstrapRuntimeSidebar,
      state.loadChatRuntimeSidebarData,
      state.loadVoiceRuntimeSidebarData,
      state.loadMediaRuntimeSidebarData,
      state.refreshMediaRuntimeSidebarData,
      handleSpeechProviderChange,
      handleVoiceIdChange,
      handleDefaultSettingChange,
      handleDefaultVoiceNameChange,
      state.refreshMediaDependencies,
      state.speechSettingsState.handleMediaPlannerModeChange,
      state.speechSettingsState.handleVideoAutoPolicyChange,
    ],
  );

  const modelLabel = state.runtimeRouteState.routeSnapshot?.model || '-';
  const canSend = Boolean(state.targetsState.selectedTarget)
    && !state.turnSendState.isSending
    && state.speechTranscribeState.voiceInputState !== 'transcribing';

  return {
    handleSpeechProviderChange,
    handleVoiceIdChange,
    handleDefaultSettingChange,
    handleDefaultVoiceNameChange,
    handleVoiceContextMenu,
    handleToggleVoiceTranscript,
    handleSendAndFocus,
    handleKeyDown,
    runtimeSidebarProps,
    handleToggleVoiceInput,
    handleCancelVoiceInput,
    modelLabel,
    canSend,
  };
}
