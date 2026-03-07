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
    modelLabel: actions.modelLabel,
    sessions: state.sessionsState.sessions,
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
    onInputKeyDown: actions.handleKeyDown,
    voiceInputState: state.speechTranscribeState.voiceInputState,
    onToggleVoiceInput: actions.handleToggleVoiceInput,
    onCancelVoiceInput: actions.handleCancelVoiceInput,
    onSend: () => {
      void actions.handleSendAndFocus();
    },
    canSend: actions.canSend,
    voiceContextMenu: state.voiceContextMenu,
    onToggleVoiceTranscript: actions.handleToggleVoiceTranscript,
  };
}
