import { useCallback, useMemo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { LocalChatBooleanSettingKey } from '../../default-settings-store.js';
import type { ChatMessage } from '../../types.js';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';
import type { RuntimeStatusSidebarProps } from '../../components/sidebar/types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { findLocalRuntimeModelForBinding, hasReadyLocalRuntimeModelForScenario, isLocalRuntimeModelReady, resolveModelsForScenario, } from '../../services/route/connector-model-capabilities.js';
import { type RuntimeCanonicalCapability } from "@nimiplatform/sdk/mod";
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
    if (!input.isVoiceEnabled && (input.capability === 'audio.synthesize'
        || input.capability === 'audio.transcribe')) {
        return false;
    }
    return true;
}
export function useLocalChatPageActions(state: LocalChatPageState) {
    const handleVoiceIdChange = useCallback((voiceId: string) => {
        state.speechPlaybackState.stopVoicePlayback();
        state.speechSettingsState.handleVoiceIdChange(voiceId);
    }, [state.speechPlaybackState, state.speechSettingsState]);
    const handleDefaultSettingChange = useCallback((key: LocalChatBooleanSettingKey, value: boolean) => {
        state.speechSettingsState.handleDefaultSettingChange(key, value);
    }, [state.speechSettingsState]);
    const handleDefaultVoiceNameChange = useCallback((value: string) => {
        state.speechPlaybackState.stopVoicePlayback();
        state.speechSettingsState.handleDefaultVoiceNameChange(value);
    }, [state.speechPlaybackState, state.speechSettingsState]);
    const handleMediaAutonomyChange = useCallback((value: 'off' | 'explicit-only' | 'natural') => {
        state.speechSettingsState.handleMediaAutonomyChange(value);
    }, [state.speechSettingsState]);
    const handleVoiceAutonomyChange = useCallback((value: 'off' | 'explicit-only' | 'natural') => {
        state.speechSettingsState.handleVoiceAutonomyChange(value);
    }, [state.speechSettingsState]);
    const handleVoiceConversationModeChange = useCallback((value: 'off' | 'on') => {
        state.speechSettingsState.handleVoiceConversationModeChange(value);
    }, [state.speechSettingsState]);
    const handleVisualComfortLevelChange = useCallback((value: 'text-only' | 'restrained-visuals' | 'natural-visuals') => {
        state.speechSettingsState.handleVisualComfortLevelChange(value);
    }, [state.speechSettingsState]);
    const handleVoiceContextMenu = useCallback((message: ChatMessage, event: MouseEvent<HTMLButtonElement>) => {
        if (message.kind !== 'voice')
            return;
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
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleSendAndFocus();
        }
    }, [handleSendAndFocus]);
    const runtimeSidebarProps = useMemo<RuntimeStatusSidebarProps>(() => {
        const resolvedDefaultSource = state.runtimeRouteState.chatRouteOptions?.resolvedDefault?.source;
        const dependencySnapshot = state.dependencySnapshot;
        const autoBoundSource: RuntimeStatusSidebarProps['autoBoundSource'] = (dependencySnapshot?.routeSource === 'local'
            || dependencySnapshot?.routeSource === 'cloud'
            || dependencySnapshot?.routeSource === 'mixed')
            ? dependencySnapshot.routeSource
            : (resolvedDefaultSource === 'local' || resolvedDefaultSource === 'cloud')
                ? resolvedDefaultSource
                : 'unknown';
        const localChatRuntimeModels = state.runtimeRouteState.chatRouteOptions?.local?.models || [];
        const localTtsRuntimeModels = state.runtimeRouteState.ttsRouteOptions?.local?.models || localChatRuntimeModels;
        const localSttRuntimeModels = state.runtimeRouteState.sttRouteOptions?.local?.models || localChatRuntimeModels;
        const localTtsRouteAvailable = hasReadyLocalRuntimeModelForScenario({
            models: localTtsRuntimeModels,
            scenario: 'audio.synthesize',
        });
        const localSttRouteAvailable = hasReadyLocalRuntimeModelForScenario({
            models: localSttRuntimeModels,
            scenario: 'audio.transcribe',
        });
        const chatCapabilityMatched = (() => {
            const dependencyRows = dependencySnapshot?.dependencies || [];
            const chatRows = dependencyRows.filter((item) => item.capability === 'text.generate');
            if (chatRows.length > 0) {
                return chatRows.some((item) => item.selected);
            }
            const selected = state.runtimeRouteState.routeBinding || state.runtimeRouteState.chatRouteOptions?.selected || null;
            if (!selected || selected.source !== 'local')
                return true;
            const localModel = findLocalRuntimeModelForBinding({
                models: localChatRuntimeModels,
                binding: {
                    model: selected.model,
                    localModelId: selected.localModelId,
                    goRuntimeLocalModelId: selected.goRuntimeLocalModelId,
                },
            });
            if (!isLocalRuntimeModelReady(localModel)) {
                return false;
            }
            const capabilities = Array.isArray(localModel?.capabilities) ? localModel?.capabilities : [];
            return capabilities.includes('text.generate');
        })();
        const chatRouteReady = (() => {
            const resolvedSnapshot = state.runtimeRouteState.routeSnapshot;
            if (resolvedSnapshot?.source === 'cloud') {
                return true;
            }
            const selectedBinding = state.runtimeRouteState.routeBinding
                || state.runtimeRouteState.chatRouteOptions?.selected
                || null;
            if (selectedBinding?.source === 'cloud') {
                return true;
            }
            const localModel = findLocalRuntimeModelForBinding({
                models: localChatRuntimeModels,
                binding: {
                    model: resolvedSnapshot?.model || selectedBinding?.model,
                    localModelId: resolvedSnapshot?.localModelId || selectedBinding?.localModelId,
                    goRuntimeLocalModelId: resolvedSnapshot?.goRuntimeLocalModelId || selectedBinding?.goRuntimeLocalModelId,
                },
            });
            if (localModel) {
                return isLocalRuntimeModelReady(localModel);
            }
            if (resolvedSnapshot?.source === 'local' && resolvedSnapshot.goRuntimeStatus) {
                return String(resolvedSnapshot.goRuntimeStatus).trim().toLowerCase() === 'active';
            }
            return false;
        })();
        const isLocalSnapshotFailure = autoBoundSource === 'cloud'
            && dependencySnapshot?.reasonCode === ReasonCode.LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED;
        const capabilityMatchedFromSnapshot = (capability: 'text.generate' | 'audio.synthesize' | 'audio.transcribe'): boolean => {
            const dependencyRows = dependencySnapshot?.dependencies || [];
            const rows = dependencyRows.filter((item) => item.capability === capability);
            if (rows.length === 0) {
                if (capability === 'text.generate')
                    return chatCapabilityMatched;
                if (capability === 'audio.synthesize') {
                    if (state.speechSettingsState.defaultSettings.ttsRouteSource === 'cloud')
                        return true;
                    if (state.speechSettingsState.defaultSettings.ttsRouteSource === 'auto'
                        && state.runtimeRouteState.ttsRouteOptions?.selected?.source === 'cloud') {
                        return true;
                    }
                    return localTtsRouteAvailable;
                }
                if (state.speechSettingsState.defaultSettings.sttRouteSource === 'cloud')
                    return true;
                if (state.speechSettingsState.defaultSettings.sttRouteSource === 'auto'
                    && state.runtimeRouteState.sttRouteOptions?.selected?.source === 'cloud') {
                    return true;
                }
                return localSttRouteAvailable;
            }
            return rows.some((item) => item.selected);
        };
        const isVoiceEnabled = Boolean(state.speechSettingsState.defaultSettings.enableVoice);
        const dependencyCapabilities: RuntimeStatusSidebarProps['dependencyCapabilities'] = [
            {
                capability: 'text.generate',
                matched: capabilityMatchedFromSnapshot('text.generate'),
                required: true,
                resolved: true,
            },
            {
                capability: 'audio.synthesize',
                matched: capabilityMatchedFromSnapshot('audio.synthesize'),
                required: isVoiceEnabled,
                resolved: true,
            },
            {
                capability: 'audio.transcribe',
                matched: capabilityMatchedFromSnapshot('audio.transcribe'),
                required: isVoiceEnabled,
                resolved: true,
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
            if (snapshotStatus === 'unknown')
                return 'unknown';
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
            if (!raw || dependencyStatus === 'ready')
                return undefined;
            if (!isVoiceEnabled) {
                const normalized = raw.toLowerCase();
                if (normalized.includes('tts')
                    || normalized.includes('stt')
                    || normalized.includes('speech')) {
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
            routeSnapshot: state.runtimeRouteState.routeSnapshot,
            routeBinding: state.runtimeRouteState.routeBinding,
            speechVoices: state.speechSettingsState.speechVoices,
            selectedVoiceId: state.speechSettingsState.defaultSettings.voiceName,
            ttsRouteSource: state.speechSettingsState.defaultSettings.ttsRouteSource,
            sttRouteSource: state.speechSettingsState.defaultSettings.sttRouteSource,
            imageRouteSource: state.speechSettingsState.defaultSettings.imageRouteSource,
            videoRouteSource: state.speechSettingsState.defaultSettings.videoRouteSource,
            localTtsRouteAvailable,
            localSttRouteAvailable,
            enableVoice: state.speechSettingsState.defaultSettings.enableVoice,
            autoBoundSource,
            autoBoundModel: state.runtimeRouteState.chatRouteOptions?.resolvedDefault?.model || '',
            chatRouteReady,
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
            inspectSettings: state.speechSettingsState.inspectSettings,
            imageResolvedRoute: state.imageResolvedRoute,
            videoResolvedRoute: state.videoResolvedRoute,
            isMediaRuntimeSidebarLoading: false,
            isImageRouteProbeLoading: false,
            isVideoRouteProbeLoading: false,
            onRefreshMediaDependencies: () => {
                void state.runtimeRouteState.loadAllRuntimeRouteOptions();
                void state.refreshAllDependencySnapshots();
            },
            onSidebarBootstrap: () => {
                void state.runtimeRouteState.loadAllRuntimeRouteOptions();
                void state.refreshAllDependencySnapshots();
            },
            onOpenChatPanel: () => { },
            onOpenVoicePanel: () => { },
            onOpenMediaPanel: () => { },
            onOpenRuntimeSetup: () => {
                state.setActiveTab('runtime');
            },
            onHealthCheck: () => {
                void state.runtimeRouteState.handleHealthCheck();
            },
        };
    }, [
        state.runtimeRouteState,
        state.speechSettingsState,
        state.latestPromptTrace,
        state.latestTurnAudit,
        state.dependencySnapshot,
        state.imageResolvedRoute,
        state.videoResolvedRoute,
        state.refreshAllDependencySnapshots,
        state.runtimeRouteState.routeSnapshot,
        handleVoiceIdChange,
    ]);
    const canSend = Boolean(state.targetsState.selectedTarget)
        && state.speechTranscribeState.voiceInputState !== 'transcribing';
    return {
        handleVoiceIdChange,
        handleDefaultSettingChange,
        handleDefaultVoiceNameChange,
        handleMediaAutonomyChange,
        handleVoiceAutonomyChange,
        handleVoiceConversationModeChange,
        handleVisualComfortLevelChange,
        handleVoiceContextMenu,
        handleToggleVoiceTranscript,
        handleSendAndFocus,
        handleKeyDown,
        runtimeSidebarProps,
        handleToggleVoiceInput,
        handleCancelVoiceInput,
        canSend,
    };
}
