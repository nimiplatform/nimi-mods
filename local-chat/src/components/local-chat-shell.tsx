import React from 'react';
import { LocalChatHeader } from './layout/local-chat-header.js';
import { LocalChatMessagePane } from './layout/local-chat-message-pane.js';
import { LocalChatRightSidebar } from './layout/local-chat-right-sidebar.js';
import { LocalChatTargetPane } from './layout/local-chat-target-pane.js';
import { ICON_CHEVRON_DOWN, ICON_SEARCH, ICON_SIDEBAR_HIDE, ICON_SIDEBAR_SHOW } from './layout/icons.js';
import type { LocalChatShellProps } from './layout/shell-props.js';

export type { LocalChatShellProps } from './layout/shell-props.js';

export function LocalChatShell(props: LocalChatShellProps) {
  const {
    visibleTargets,
    loadingTargets,
    selectedTargetId,
    setSelectedTargetId,
    targetSearchText,
    setTargetSearchText,
    onRefresh,
    selectedTarget,
    selectedTargetAvatarUrl,
    selectedTargetInitial,
    onOpenSelectedTargetProfile,
    loadingTargetDetail,
    modelLabel,
    sessions,
    selectedSessionId,
    onCreateSession,
    onSelectSession,
    onDeleteSession,
    isSessionMenuOpen,
    setIsSessionMenuOpen,
    sessionMenuAnchorRef,
    sessionMenuPanelRef,
    isRuntimeSidebarOpen,
    setIsRuntimeSidebarOpen,
    runtimeSidebarProps,
    messages,
    isSending,
    currentUserDisplayName,
    currentUserAvatarUrl,
    playingVoiceMessageId,
    voiceTranscriptVisibleById,
    onPlayVoiceMessage,
    onVoiceContextMenu,
    messagesEndRef,
    inputRef,
    inputText,
    setInputText,
    onInputKeyDown,
    voiceInputState,
    onToggleVoiceInput,
    onCancelVoiceInput,
    onSend,
    canSend,
    voiceContextMenu,
    onToggleVoiceTranscript,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <LocalChatTargetPane
        visibleTargets={visibleTargets}
        loadingTargets={loadingTargets}
        selectedTargetId={selectedTargetId}
        setSelectedTargetId={setSelectedTargetId}
        targetSearchText={targetSearchText}
        setTargetSearchText={setTargetSearchText}
        onRefresh={onRefresh}
        searchIcon={ICON_SEARCH}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LocalChatHeader
          selectedTarget={selectedTarget}
          selectedTargetAvatarUrl={selectedTargetAvatarUrl}
          selectedTargetInitial={selectedTargetInitial}
          onOpenSelectedTargetProfile={onOpenSelectedTargetProfile}
          selectedTargetId={selectedTargetId}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          isSessionMenuOpen={isSessionMenuOpen}
          setIsSessionMenuOpen={setIsSessionMenuOpen}
          sessionMenuAnchorRef={sessionMenuAnchorRef}
          sessionMenuPanelRef={sessionMenuPanelRef}
          isRuntimeSidebarOpen={isRuntimeSidebarOpen}
          setIsRuntimeSidebarOpen={setIsRuntimeSidebarOpen}
          chevronIcon={ICON_CHEVRON_DOWN}
          sidebarHideIcon={ICON_SIDEBAR_HIDE}
          sidebarShowIcon={ICON_SIDEBAR_SHOW}
        />

        <LocalChatMessagePane
          selectedTarget={selectedTarget}
          selectedTargetAvatarUrl={selectedTargetAvatarUrl}
          loadingTargetDetail={loadingTargetDetail}
          modelLabel={modelLabel}
          messages={messages}
          isSending={isSending}
          currentUserDisplayName={currentUserDisplayName}
          currentUserAvatarUrl={currentUserAvatarUrl}
          playingVoiceMessageId={playingVoiceMessageId}
          voiceTranscriptVisibleById={voiceTranscriptVisibleById}
          onPlayVoiceMessage={onPlayVoiceMessage}
          onVoiceContextMenu={onVoiceContextMenu}
          messagesEndRef={messagesEndRef}
          inputRef={inputRef}
          inputText={inputText}
          setInputText={setInputText}
          onInputKeyDown={onInputKeyDown}
          voiceInputState={voiceInputState}
          onToggleVoiceInput={onToggleVoiceInput}
          onCancelVoiceInput={onCancelVoiceInput}
          onSend={onSend}
          canSend={canSend}
        />
      </div>

      <LocalChatRightSidebar
        isRuntimeSidebarOpen={isRuntimeSidebarOpen}
        runtimeSidebarProps={runtimeSidebarProps}
        voiceContextMenu={voiceContextMenu}
        voiceTranscriptVisibleById={voiceTranscriptVisibleById}
        onToggleVoiceTranscript={onToggleVoiceTranscript}
      />
    </div>
  );
}
