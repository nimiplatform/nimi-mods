import { useCallback, useMemo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { LocalChatBooleanSettingKey } from '../../default-settings-store.js';
import type { ChatMessage } from '../../types.js';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';
import type { RuntimeStatusSidebarProps } from '../../components/sidebar/types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { resolveModelsForScenario } from '../../services/route/connector-model-capabilities.js';

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

      const capabilityMatchedFromSnapshot = (capability: 'chat' | 'tts' | 'stt'): boolean => {
        const dependencyRows = dependencySnapshot?.dependencies || [];
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
      const dependencyCapabilities: RuntimeStatusSidebarProps['dependencyCapabilities'] = [
        { capability: 'chat', matched: capabilityMatchedFromSnapshot('chat'), required: true },
        {
          capability: 'tts',
          matched: capabilityMatchedFromSnapshot('tts'),
          required: isVoiceEnabled,
        },
        {
          capability: 'stt',
          matched: capabilityMatchedFromSnapshot('stt'),
          required: isVoiceEnabled,
        },
      ];
      const dependencyRepairActions = (dependencySnapshot?.repairActions || []).filter((action) => {
        if (isLocalSnapshotFailure) return false;
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
        return true;
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
        routeOverride: state.runtimeRouteState.routeOverride,
        speechProviders: state.speechSettingsState.speechProviders,
        speechVoices: state.speechSettingsState.speechVoices,
        selectedSpeechProviderId: state.speechSettingsState.selectedSpeechProviderId,
        selectedVoiceId: state.speechSettingsState.defaultSettings.voiceName,
        ttsRouteSource: state.speechSettingsState.defaultSettings.ttsRouteSource,
        sttRouteSource: state.speechSettingsState.defaultSettings.sttRouteSource,
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
        onTtsRouteSourceChange: state.speechSettingsState.handleTtsRouteSourceChange,
        onTtsConnectorChange: state.speechSettingsState.handleTtsConnectorChange,
        onTtsModelChange: state.speechSettingsState.handleTtsModelChange,
        onSttRouteSourceChange: state.speechSettingsState.handleSttRouteSourceChange,
        onSttConnectorChange: state.speechSettingsState.handleSttConnectorChange,
        onSttModelChange: state.speechSettingsState.handleSttModelChange,
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
      handleSpeechProviderChange,
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
