import { useCallback, useMemo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { RuntimeCanonicalCapability } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatBooleanSettingKey } from '../../default-settings-store.js';
import type { ChatMessage } from '../../types.js';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';
import type { RuntimeStatusSidebarProps } from '../../components/sidebar/types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { resolveModelsForScenario } from '../../services/route/connector-model-capabilities.js';

type LocalChatPageState = ReturnType<typeof useLocalChatPageState>;

export function shouldIncludeDependencyRepairAction(input: {
  isLocalSnapshotFailure: boolean;
  isVoiceEnabled: boolean;
  capability?: RuntimeCanonicalCapability;
}): boolean {
  if (input.isLocalSnapshotFailure) {
    return false;
  }
  if (input.capability === 'text.generate') {
    return true;
  }
  if (!input.isVoiceEnabled && (
    input.capability === 'audio.synthesize'
    || input.capability === 'audio.transcribe'
  )) {
    return false;
  }
  return true;
}

export function useLocalChatPageActions(state: LocalChatPageState) {
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
        return capabilities.includes('audio.synthesize');
      });
      const localSttRouteAvailable = localSttRuntimeModels.some((model) => {
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
        return capabilities.includes('audio.transcribe');
      });

      const chatCapabilityMatched = (() => {
        const dependencyRows = dependencySnapshot?.dependencies || [];
        const chatRows = dependencyRows.filter((item) => item.capability === 'text.generate');
        if (chatRows.length > 0) {
          return chatRows.some((item) => item.selected);
        }
        const selected = state.runtimeRouteState.routeBinding || state.runtimeRouteState.chatRouteOptions?.selected || null;
        if (!selected || selected.source !== 'local-runtime') return true;
        const localModel = localChatRuntimeModels.find((model) => {
          const byId = String(model.localModelId || '').trim() === String(selected.localModelId || '').trim();
          const byModel = String(model.model || '').trim() === String(selected.model || '').trim();
          return byId || byModel;
        });
        const capabilities = Array.isArray(localModel?.capabilities) ? localModel?.capabilities : [];
        return capabilities.includes('text.generate');
      })();

      const isLocalSnapshotFailure = autoBoundSource === 'token-api'
        && dependencySnapshot?.reasonCode === ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED;

      const capabilityMatchedFromSnapshot = (capability: 'text.generate' | 'audio.synthesize' | 'audio.transcribe'): boolean => {
        const dependencyRows = dependencySnapshot?.dependencies || [];
        const rows = dependencyRows.filter((item) => item.capability === capability);
        if (rows.length === 0) {
          if (capability === 'text.generate') return chatCapabilityMatched;
          if (capability === 'audio.synthesize') {
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
      const dependencyCapabilities: RuntimeStatusSidebarProps['dependencyCapabilities'] = [
        { capability: 'text.generate', matched: capabilityMatchedFromSnapshot('text.generate'), required: true },
        {
          capability: 'audio.synthesize',
          matched: capabilityMatchedFromSnapshot('audio.synthesize'),
          required: isVoiceEnabled,
        },
        {
          capability: 'audio.transcribe',
          matched: capabilityMatchedFromSnapshot('audio.transcribe'),
          required: isVoiceEnabled,
        },
      ];
      const dependencyRepairActions = (dependencySnapshot?.repairActions || []).filter((action) => {
        const capability = action.capability;
        return shouldIncludeDependencyRepairAction({
          isLocalSnapshotFailure,
          isVoiceEnabled,
          capability,
        });
      });
      const dependencyStatus: RuntimeStatusSidebarProps['dependencyStatus'] = (() => {
        if (isLocalSnapshotFailure) {
          if (!chatCapabilityMatched || dependencyCapabilities.some((item) => item.required && !item.matched)) {
            return 'missing';
          }
          return dependencyRepairActions.length > 0 ? 'degraded' : 'ready';
        }
        const snapshotStatus = dependencySnapshot?.status || 'unknown';
        if (snapshotStatus === 'unknown') return 'unknown';
        if (!chatCapabilityMatched || dependencyCapabilities.some((item) => item.required && !item.matched)) {
          return 'missing';
        }
        if (!isVoiceEnabled) {
          return dependencyRepairActions.length > 0 ? 'degraded' : 'ready';
        }
        return snapshotStatus;
      })();
      const dependencyReasonCode = (() => {
        const raw = String(dependencySnapshot?.reasonCode || '').trim();
        if (!raw || dependencyStatus === 'ready') return undefined;
        if (!isVoiceEnabled) {
          const normalized = raw.toLowerCase();
          if (
            normalized.includes('tts')
            || normalized.includes('stt')
            || normalized.includes('speech')
          ) {
            return undefined;
          }
        }
        return raw;
      })();

      return {
        healthStatus: state.runtimeRouteState.healthStatus,
        checkingHealth: state.runtimeRouteState.checkingHealth,
        chatRouteOptions: state.runtimeRouteState.chatRouteOptions,
        imageRouteOptions: state.runtimeRouteState.imageRouteOptions,
        videoRouteOptions: state.runtimeRouteState.videoRouteOptions,
        routeBinding: state.runtimeRouteState.routeBinding,
        speechVoices: state.speechSettingsState.speechVoices,
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
        dependencyCapabilities,
        dependencyStatus,
        dependencyReasonCode,
        dependencyUpdatedAt: dependencySnapshot?.updatedAt,
        dependencyRepairActions,
        latestPromptTrace: state.latestPromptTrace,
        latestTurnAudit: state.latestTurnAudit,
        voiceCatalogSource: state.speechSettingsState.speechVoiceCatalogMeta.voiceCatalogSource || undefined,
        voiceCatalogModelResolved: state.speechSettingsState.speechVoiceCatalogMeta.modelResolved || undefined,
        voiceCatalogVersion: state.speechSettingsState.speechVoiceCatalogMeta.voiceCatalogVersion || undefined,
        onRouteSourceChange: state.runtimeRouteState.handleRouteSourceChange,
        onRouteConnectorChange: state.runtimeRouteState.handleRouteConnectorChange,
        onRouteModelChange: state.runtimeRouteState.handleRouteModelChange,
        onClearRouteBinding: state.runtimeRouteState.clearRouteBinding,
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
            scenario: 'audio.synthesize',
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
            scenario: 'audio.transcribe',
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
            scenario: 'image.generate',
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
            scenario: 'video.generate',
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
      handleVoiceIdChange,
      handleDefaultSettingChange,
      handleDefaultVoiceNameChange,
    ],
  );

  const modelLabel = state.runtimeRouteState.routeSnapshot?.model || '-';
  const canSend = Boolean(state.targetsState.selectedTarget)
    && !state.turnSendState.isSending
    && state.speechTranscribeState.voiceInputState !== 'transcribing';

  return {
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
