import { useCallback, useEffect, useRef } from 'react';
import type { LocalChatShellProps } from '../components/index.js';
import type { ChatMessage } from '../types.js';
import { useLocalChatPageActions } from './controller/use-local-chat-page-actions.js';
import { useLocalChatPageEffects } from './controller/use-local-chat-page-effects.js';
import { useLocalChatPageState } from './controller/use-local-chat-page-state.js';

export function useLocalChatPageController(): LocalChatShellProps {
  const state = useLocalChatPageState();
  const actions = useLocalChatPageActions(state);
  useLocalChatPageEffects(state);

  // Keep refs to latest state/actions for stable callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const onRefresh = useCallback(() => {
    const s = stateRef.current;
    void s.targetsState.loadTargets();
    void s.runtimeRouteState.refreshRouteSnapshot();
    if (s.isRuntimeSidebarOpen) {
      void s.refreshAllDependencySnapshots();
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const handleWindowFocus = () => {
      void onRefresh();
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [onRefresh]);

  const onOpenSelectedTargetProfile = useCallback(() => {
    const s = stateRef.current;
    const target = s.targetsState.selectedTarget;
    if (!target?.id) return;
    const isAgent = target.isAgent === true
      || String(target.handle || '').startsWith('~')
      || String(target.id || '').startsWith('~');
    const preferredIdentifier = isAgent
      ? (String(target.handle || '').trim() || target.id)
      : target.id;
    s.navigateToProfile(preferredIdentifier, isAgent ? 'agent-detail' : 'profile');
  }, []);

  const onPlayVoiceMessage = useCallback((message: ChatMessage) => {
    void stateRef.current.speechPlaybackState.playVoiceMessage(message);
  }, []);

  const onMemoryOverrideChange = useCallback((slotId: string, override: Parameters<LocalChatShellProps['onMemoryOverrideChange']>[1]) => {
    void stateRef.current.updateRelationMemorySlotOverride(slotId, override);
  }, []);

  const onDeleteMemorySlot = useCallback((slotId: string) => {
    void stateRef.current.deleteRelationMemorySlot(slotId);
  }, []);

  const onSend = useCallback(() => {
    void actionsRef.current.handleSendAndFocus();
  }, []);

  return {
    visibleTargets: state.targetsState.visibleTargets,
    loadingTargets: state.targetsState.loadingTargets,
    selectedTargetId: state.targetsState.selectedTargetId,
    setSelectedTargetId: state.targetsState.setSelectedTargetId,
    targetSearchText: state.targetsState.targetSearchText,
    setTargetSearchText: state.targetsState.setTargetSearchText,
    selectedTarget: state.targetsState.selectedTarget,
    selectedTargetAvatarUrl: state.selectedTargetAvatarUrl,
    selectedTargetInitial: state.selectedTargetInitial,
    selectedTargetInteractionProfile: state.selectedTargetInteractionProfile,
    onOpenSelectedTargetProfile,
    loadingTargetDetail: state.targetsState.loadingTargetDetail,
    loadingSessions: state.sessionsState.loadingSessions,
    onClearChatHistory: state.sessionsState.handleClearHistory,
    isRuntimeSidebarOpen: state.isRuntimeSidebarOpen,
    setIsRuntimeSidebarOpen: state.setIsRuntimeSidebarOpen,
    runtimeSidebarProps: actions.runtimeSidebarProps,
    messages: state.messages,
    isSending: state.turnSendState.isSending,
    sendPhase: state.turnSendState.sendPhase,
    currentUserDisplayName: state.currentUserDisplayName,
    currentUserAvatarUrl: state.currentUserAvatarUrl,
    playingVoiceMessageId: state.speechPlaybackState.playingVoiceMessageId,
    voiceTranscriptVisibleById: state.voiceTranscriptVisibleById,
    onPlayVoiceMessage,
    onVoiceContextMenu: actions.handleVoiceContextMenu,
    messagesEndRef: state.messagesEndRef,
    inputRef: state.inputRef,
    inputTextRef: state.inputTextRef,
    hasInputText: state.hasInputText,
    setInputText: state.setInputText,
    productSettings: state.speechSettingsState.productSettings,
    activeInteractionSnapshot: state.activeInteractionSnapshot,
    activeRelationMemorySlots: state.activeRelationMemorySlots,
    memorySyncStatus: state.memorySyncStatus,
    onToggleProductSetting: actions.handleDefaultSettingChange,
    onDefaultMediaAutonomyChange: actions.handleMediaAutonomyChange,
    onDefaultVoiceAutonomyChange: actions.handleVoiceAutonomyChange,
    onDefaultVoiceConversationModeChange: actions.handleVoiceConversationModeChange,
    onVisualComfortLevelChange: actions.handleVisualComfortLevelChange,
    onMemoryOverrideChange,
    onDeleteMemorySlot,
    hasConversationHistory: state.messages.length > 0,
    onInputKeyDown: actions.handleKeyDown,
    voiceInputState: state.speechTranscribeState.voiceInputState,
    onToggleVoiceInput: actions.handleToggleVoiceInput,
    onCancelVoiceInput: actions.handleCancelVoiceInput,
    enableVoice: state.speechSettingsState.defaultSettings.enableVoice,
    voiceConversationMode: state.activeVoiceConversationMode,
    onVoiceConversationModeChange: state.setVoiceConversationMode,
    conversationViewMode: state.conversationViewMode,
    setConversationViewMode: state.setConversationViewMode,
    isTranscriptNearBottom: state.isTranscriptNearBottom,
    setIsTranscriptNearBottom: state.setIsTranscriptNearBottom,
    onSend,
    canSend: actions.canSend,
    voiceContextMenu: state.voiceContextMenu,
    onToggleVoiceTranscript: actions.handleToggleVoiceTranscript,
  };
}
