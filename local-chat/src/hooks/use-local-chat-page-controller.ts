import type { LocalChatShellProps } from '../components/index.js';
import type { ChatMessage } from '../types.js';
import { useLocalChatPageActions } from './controller/use-local-chat-page-actions.js';
import { useLocalChatPageEffects } from './controller/use-local-chat-page-effects.js';
import { useLocalChatPageState } from './controller/use-local-chat-page-state.js';

export function useLocalChatPageController(): LocalChatShellProps {
  const state = useLocalChatPageState();
  const actions = useLocalChatPageActions(state);
  useLocalChatPageEffects(state);

  return {
    visibleTargets: state.targetsState.visibleTargets,
    loadingTargets: state.targetsState.loadingTargets,
    selectedTargetId: state.targetsState.selectedTargetId,
    setSelectedTargetId: state.targetsState.setSelectedTargetId,
    targetSearchText: state.targetsState.targetSearchText,
    setTargetSearchText: state.targetsState.setTargetSearchText,
    onRefresh: () => {
      void state.targetsState.loadTargets();
      void state.runtimeRouteState.refreshRouteSnapshot();
      if (state.isRuntimeSidebarOpen) {
        void state.refreshDependencySnapshot();
      }
    },
    selectedTarget: state.targetsState.selectedTarget,
    selectedTargetAvatarUrl: state.selectedTargetAvatarUrl,
    selectedTargetInitial: state.selectedTargetInitial,
    selectedTargetInteractionProfile: state.selectedTargetInteractionProfile,
    onOpenSelectedTargetProfile: () => {
      const target = state.targetsState.selectedTarget;
      if (!target?.id) {
        return;
      }
      const isAgent = target.isAgent === true
        || String(target.handle || '').startsWith('~')
        || String(target.id || '').startsWith('~');
      const preferredIdentifier = isAgent
        ? (String(target.handle || '').trim() || target.id)
        : target.id;
      state.navigateToProfile(preferredIdentifier, isAgent ? 'agent-detail' : 'profile');
    },
    loadingTargetDetail: state.targetsState.loadingTargetDetail,
    sessions: state.sessionsState.sessions,
    loadingSessions: state.sessionsState.loadingSessions,
    selectedSessionId: state.sessionsState.selectedSessionId,
    onCreateSession: state.sessionsState.handleCreateSession,
    onSelectSession: state.sessionsState.setSelectedSessionId,
    onDeleteSession: state.sessionsState.handleDeleteSession,
    isSessionMenuOpen: state.isSessionMenuOpen,
    setIsSessionMenuOpen: state.setIsSessionMenuOpen,
    sessionMenuAnchorRef: state.sessionMenuAnchorRef,
    sessionMenuPanelRef: state.sessionMenuPanelRef,
    isRuntimeSidebarOpen: state.isRuntimeSidebarOpen,
    setIsRuntimeSidebarOpen: state.setIsRuntimeSidebarOpen,
    runtimeSidebarProps: actions.runtimeSidebarProps,
    messages: state.messages,
    isSending: state.turnSendState.isSending,
    currentUserDisplayName: state.currentUserDisplayName,
    currentUserAvatarUrl: state.currentUserAvatarUrl,
    playingVoiceMessageId: state.speechPlaybackState.playingVoiceMessageId,
    voiceTranscriptVisibleById: state.voiceTranscriptVisibleById,
    onPlayVoiceMessage: (message: ChatMessage) => {
      void state.speechPlaybackState.playVoiceMessage(message);
    },
    onVoiceContextMenu: actions.handleVoiceContextMenu,
    messagesEndRef: state.messagesEndRef,
    inputRef: state.inputRef,
    inputText: state.inputText,
    setInputText: state.setInputText,
    productSettings: state.speechSettingsState.productSettings,
    activeInteractionSnapshot: state.activeInteractionSnapshot,
    activeRelationMemorySlots: state.activeRelationMemorySlots,
    memorySyncStatus: state.memorySyncStatus,
    onToggleProductSetting: actions.handleDefaultSettingChange,
    onDefaultMediaAutonomyChange: actions.handleMediaAutonomyChange,
    onDefaultVoiceConversationModeChange: actions.handleVoiceConversationModeChange,
    onVisualComfortLevelChange: actions.handleVisualComfortLevelChange,
    onMemoryOverrideChange: (slotId, override) => {
      void state.updateRelationMemorySlotOverride(slotId, override);
    },
    onDeleteMemorySlot: (slotId) => {
      void state.deleteRelationMemorySlot(slotId);
    },
    hasConversationHistory: state.sessionsState.sessions.some((session) => session.turnCount > 0),
    onInputKeyDown: actions.handleKeyDown,
    voiceInputState: state.speechTranscribeState.voiceInputState,
    onToggleVoiceInput: actions.handleToggleVoiceInput,
    onCancelVoiceInput: actions.handleCancelVoiceInput,
    enableVoice: state.speechSettingsState.defaultSettings.enableVoice,
    voiceConversationMode: state.activeVoiceConversationMode,
    onVoiceConversationModeChange: state.setVoiceConversationMode,
    onSend: () => {
      void actions.handleSendAndFocus();
    },
    canSend: actions.canSend,
    voiceContextMenu: state.voiceContextMenu,
    onToggleVoiceTranscript: actions.handleToggleVoiceTranscript,
  };
}
