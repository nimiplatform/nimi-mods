import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { ChatAnimationStyles } from './chat-animations.js';
import { ChatTranscriptView } from './layout/chat-transcript-view.js';
import { ConversationComposer } from './layout/conversation-composer.js';
import { CompactConversationHeader } from './layout/local-chat-header.js';
import { LocalChatProfileDrawer } from './layout/local-chat-profile-drawer.js';
import { LocalChatRightSidebar } from './layout/local-chat-right-sidebar.js';
import { LocalChatSettingsDrawer } from './layout/local-chat-settings-drawer.js';
import { StageConversationView } from './layout/stage-conversation-view.js';
import { LocalChatTargetPane } from './layout/local-chat-target-pane.js';
import { ICON_SEARCH } from './layout/icons.js';
import { resolvePresenceTheme } from './layout/presence-theme.js';
import type { LocalChatShellProps } from './layout/shell-props.js';

export type { LocalChatShellProps } from './layout/shell-props.js';

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
    onToggleProductSetting,
    onDefaultMediaAutonomyChange,
    onDefaultVoiceAutonomyChange,
    onDefaultVoiceConversationModeChange,
    onVisualComfortLevelChange,
    onClearMemory,
    hasConversationHistory,
    onInputKeyDown,
    voiceInputState,
    onToggleVoiceInput,
    onCancelVoiceInput,
    enableVoice,
    conversationViewMode,
    setConversationViewMode,
    setIsTranscriptNearBottom,
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
  const focusComposer = React.useCallback(() => {
    requestAnimationFrame(() => {
      props.inputRef.current?.focus();
    });
  }, [props.inputRef]);
  const seedFirstTurnComposer = React.useCallback(() => {
    if (!selectedTarget) {
      return;
    }
    if (!inputTextRef.current.trim()) {
      setInputText(t('MessagePane.onboardingStarterPrompt', { name: selectedTarget.displayName }));
    }
    focusComposer();
  }, [focusComposer, inputTextRef, selectedTarget, setInputText, t]);

  React.useEffect(() => {
    if (!selectedTarget || conversationViewMode !== 'stage' || loadingTargetDetail || messages.length > 0) {
      return;
    }
    focusComposer();
  }, [conversationViewMode, focusComposer, loadingTargetDetail, messages.length, selectedTarget]);

  return (
    <div className="local-chat-root relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_38%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(241,245,249,0.94))]" data-ui-version="v5-room">
      <ChatAnimationStyles />

      <div className="flex min-h-0 w-full min-w-0 flex-1">
        <div
          className="relative flex min-h-0 flex-1 overflow-hidden"
          style={selectedTarget ? { background: selectedTheme.roomSurface } : undefined}
        >
          {!selectedTarget ? (
            <LocalChatTargetPane
              visibleTargets={visibleTargets}
              loadingTargets={loadingTargets}
              selectedTargetId={selectedTargetId}
              setSelectedTargetId={setSelectedTargetId}
              targetSearchText={targetSearchText}
              setTargetSearchText={setTargetSearchText}
              onOpenSettings={() => setIsSettingsDrawerOpen(true)}
              searchIcon={ICON_SEARCH}
            />
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {conversationViewMode === 'chat' ? (
                <CompactConversationHeader
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
                  onReturnToStage={() => setConversationViewMode('stage')}
                />
              ) : null}

              {conversationViewMode === 'stage' ? (
                <StageConversationView
                  selectedTarget={selectedTarget}
                  selectedTargetAvatarUrl={selectedTargetAvatarUrl}
                  selectedTargetInitial={selectedTargetInitial}
                  loadingTargetDetail={loadingTargetDetail}
                  interactionSnapshot={activeInteractionSnapshot}
                  hasInputText={hasInputText}
                  isSending={isSending}
                  sendPhase={sendPhase}
                  messages={messages}
                  currentUserDisplayName={currentUserDisplayName}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                  playingVoiceMessageId={playingVoiceMessageId}
                  voiceTranscriptVisibleById={voiceTranscriptVisibleById}
                  onPlayVoiceMessage={onPlayVoiceMessage}
                  onVoiceContextMenu={onVoiceContextMenu}
                  messagesEndRef={messagesEndRef}
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
                  onOpenHistory={() => setConversationViewMode('chat')}
                />
              ) : (
                <ChatTranscriptView
                  selectedTarget={selectedTarget}
                  selectedTargetAvatarUrl={selectedTargetAvatarUrl}
                  loadingTargetDetail={loadingTargetDetail}
                  messages={messages}
                  loadingSessions={loadingSessions}
                  sendPhase={sendPhase}
                  currentUserDisplayName={currentUserDisplayName}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                  playingVoiceMessageId={playingVoiceMessageId}
                  voiceTranscriptVisibleById={voiceTranscriptVisibleById}
                  onPlayVoiceMessage={onPlayVoiceMessage}
                  onVoiceContextMenu={onVoiceContextMenu}
                  messagesEndRef={messagesEndRef}
                  hasConversationHistory={hasConversationHistory}
                  onSeedFirstTurnComposer={seedFirstTurnComposer}
                  onTranscriptNearBottomChange={setIsTranscriptNearBottom}
                />
              )}

              <ConversationComposer
                mode={conversationViewMode}
                selectedTarget={selectedTarget}
                inputRef={inputRef}
                inputTextRef={inputTextRef}
                hasInputText={hasInputText}
                setInputText={setInputText}
                onInputKeyDown={onInputKeyDown}
                voiceInputState={voiceInputState}
                onToggleVoiceInput={onToggleVoiceInput}
                onCancelVoiceInput={onCancelVoiceInput}
                enableVoice={enableVoice}
                isSending={isSending}
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
        onClose={() => setIsProfileDrawerOpen(false)}
        onOpenSelectedTargetProfile={onOpenSelectedTargetProfile}
        onClearChatHistory={onClearChatHistory}
        onClearMemory={onClearMemory}
      />
    </div>
  );
}
