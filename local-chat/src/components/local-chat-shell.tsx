import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { ChatAnimationStyles } from './chat-animations.js';
import { LocalChatHeader } from './layout/local-chat-header.js';
import { LocalChatMessagePane } from './layout/local-chat-message-pane.js';
import { LocalChatProfileDrawer } from './layout/local-chat-profile-drawer.js';
import { LocalChatRightSidebar } from './layout/local-chat-right-sidebar.js';
import { LocalChatSettingsDrawer } from './layout/local-chat-settings-drawer.js';
import { LocalChatTargetPane } from './layout/local-chat-target-pane.js';
import { ICON_SEARCH } from './layout/icons.js';
import { resolvePresenceTheme } from './layout/presence-theme.js';
import type { LocalChatShellProps } from './layout/shell-props.js';

export type { LocalChatShellProps } from './layout/shell-props.js';

const ICON_SETTINGS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export function LocalChatShell(props: LocalChatShellProps) {
  const { t } = useModTranslation('local-chat');
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = React.useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = React.useState(false);
  const closeSettingsDrawer = React.useCallback(() => setIsSettingsDrawerOpen(false), []);
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
    selectedTargetInteractionProfile,
    onOpenSelectedTargetProfile,
    loadingTargetDetail,
    loadingSessions,
    onClearChatHistory,
    isRuntimeSidebarOpen,
    setIsRuntimeSidebarOpen,
    runtimeSidebarProps,
    messages,
    isSending,
    sendPhase,
    currentUserDisplayName,
    currentUserAvatarUrl,
    playingVoiceMessageId,
    voiceTranscriptVisibleById,
    onPlayVoiceMessage,
    onVoiceContextMenu,
    messagesEndRef,
    inputRef,
    inputTextRef,
    hasInputText,
    setInputText,
    productSettings,
    activeInteractionSnapshot,
    activeRelationMemorySlots,
    memorySyncStatus,
    onToggleProductSetting,
    onDefaultMediaAutonomyChange,
    onDefaultVoiceAutonomyChange,
    onDefaultVoiceConversationModeChange,
    onVisualComfortLevelChange,
    onMemoryOverrideChange,
    onDeleteMemorySlot,
    hasConversationHistory,
    onInputKeyDown,
    voiceInputState,
    onToggleVoiceInput,
    onCancelVoiceInput,
    enableVoice,
    onSend,
    canSend,
    voiceContextMenu,
    onToggleVoiceTranscript,
  } = props;

  const overlayVisible = isRuntimeSidebarOpen || isSettingsDrawerOpen || isProfileDrawerOpen;
  const selectedTheme = resolvePresenceTheme({
    seed: selectedTarget?.id || selectedTarget?.displayName || 'local-chat',
    emotionalTemperature: activeInteractionSnapshot?.emotionalTemperature || 'low',
  });

  return (
    <div className="local-chat-root relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_38%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(241,245,249,0.94))]" data-ui-version="v5-room">
      <ChatAnimationStyles />

      <div className="mx-auto flex min-h-0 w-full max-w-[1580px] min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4">
        <div
          className="relative flex min-h-0 flex-1 overflow-hidden rounded-[32px] border border-white/70 bg-white/78 shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
          style={selectedTarget ? { background: selectedTheme.roomSurface } : undefined}
        >
          {!selectedTarget ? (
            <>
              <div className="absolute right-5 top-5 z-20">
                <button
                  type="button"
                  onClick={() => setIsSettingsDrawerOpen(true)}
                  className="lc-btn lc-btn-secondary h-10 rounded-full px-4 text-sm font-semibold text-slate-700"
                  aria-label={t('Header.openSettings')}
                  title={t('Header.openSettings')}
                >
                  {ICON_SETTINGS}
                  <span>{t('Header.openSettings')}</span>
                </button>
              </div>
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
            </>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <LocalChatHeader
                selectedTarget={selectedTarget}
                selectedTargetAvatarUrl={selectedTargetAvatarUrl}
                selectedTargetInitial={selectedTargetInitial}
                loadingTargetDetail={loadingTargetDetail}
                interactionSnapshot={activeInteractionSnapshot}
                hasInputText={hasInputText}
                isSending={isSending}
                sendPhase={sendPhase}
                messages={messages}
                playingVoiceMessageId={playingVoiceMessageId}
                onBackToTargetStage={() => {
                  setSelectedTargetId('');
                  setIsSettingsDrawerOpen(false);
                  setIsProfileDrawerOpen(false);
                  if (isRuntimeSidebarOpen) {
                    setIsRuntimeSidebarOpen(() => false);
                  }
                }}
                onOpenSelectedTargetProfile={() => {
                  setIsProfileDrawerOpen(true);
                  setIsSettingsDrawerOpen(false);
                  if (isRuntimeSidebarOpen) {
                    setIsRuntimeSidebarOpen(() => false);
                  }
                }}
                onOpenSettings={() => {
                  setIsSettingsDrawerOpen(true);
                  setIsProfileDrawerOpen(false);
                  if (isRuntimeSidebarOpen) {
                    setIsRuntimeSidebarOpen(() => false);
                  }
                }}
                onClearChatHistory={onClearChatHistory}
              />

              <LocalChatMessagePane
                selectedTarget={selectedTarget}
                selectedTargetAvatarUrl={selectedTargetAvatarUrl}
                loadingTargetDetail={loadingTargetDetail}
                messages={messages}
                loadingSessions={loadingSessions}
                isSending={isSending}
                sendPhase={sendPhase}
                currentUserDisplayName={currentUserDisplayName}
                currentUserAvatarUrl={currentUserAvatarUrl}
                playingVoiceMessageId={playingVoiceMessageId}
                voiceTranscriptVisibleById={voiceTranscriptVisibleById}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onVoiceContextMenu={onVoiceContextMenu}
                messagesEndRef={messagesEndRef}
                inputRef={inputRef}
                inputTextRef={inputTextRef}
                setInputText={setInputText}
                productSettings={productSettings}
                hasConversationHistory={hasConversationHistory}
                onInputKeyDown={onInputKeyDown}
                voiceInputState={voiceInputState}
                onToggleVoiceInput={onToggleVoiceInput}
                onCancelVoiceInput={onCancelVoiceInput}
                enableVoice={enableVoice}
                onSend={onSend}
                canSend={canSend}
                runtimeReady={runtimeSidebarProps.chatRouteReady}
              />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label={t('Shell.dismissOverlay')}
        className={`absolute inset-0 z-20 bg-slate-900/28 transition-opacity duration-200 ${
          overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        tabIndex={overlayVisible ? 0 : -1}
        onClick={() => {
          setIsSettingsDrawerOpen(false);
          setIsProfileDrawerOpen(false);
          if (isRuntimeSidebarOpen) {
            setIsRuntimeSidebarOpen(() => false);
          }
        }}
      />

      <div className="absolute inset-y-0 right-0 z-30">
        <LocalChatRightSidebar
          isRuntimeSidebarOpen={isRuntimeSidebarOpen}
          runtimeSidebarProps={runtimeSidebarProps}
          voiceContextMenu={voiceContextMenu}
          voiceTranscriptVisibleById={voiceTranscriptVisibleById}
          onToggleVoiceTranscript={onToggleVoiceTranscript}
          onCloseSidebar={() => setIsRuntimeSidebarOpen(() => false)}
        />
      </div>

      <LocalChatSettingsDrawer
        open={isSettingsDrawerOpen}
        onClose={closeSettingsDrawer}
        productSettings={productSettings}
        enableVoice={enableVoice}
        onToggleProductSetting={onToggleProductSetting}
        onMediaAutonomyChange={onDefaultMediaAutonomyChange}
        onVoiceAutonomyChange={onDefaultVoiceAutonomyChange}
        onVoiceConversationModeChange={onDefaultVoiceConversationModeChange}
        onVisualComfortLevelChange={onVisualComfortLevelChange}
        runtimeSidebarProps={runtimeSidebarProps}
      />

      <LocalChatProfileDrawer
        open={isProfileDrawerOpen}
        selectedTarget={selectedTarget}
        selectedTargetAvatarUrl={selectedTargetAvatarUrl}
        selectedTargetInitial={selectedTargetInitial}
        interactionProfile={selectedTargetInteractionProfile}
        interactionSnapshot={activeInteractionSnapshot}
        relationMemorySlots={activeRelationMemorySlots}
        memorySyncStatus={memorySyncStatus}
        onClose={() => setIsProfileDrawerOpen(false)}
        onOpenSelectedTargetProfile={onOpenSelectedTargetProfile}
        onMemoryOverrideChange={onMemoryOverrideChange}
        onDeleteMemorySlot={onDeleteMemorySlot}
      />
    </div>
  );
}
