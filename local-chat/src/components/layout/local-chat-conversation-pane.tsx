import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import type { LocalChatTurnSendPhase } from '../../state/index.js';
import type { LocalChatConversationViewMode } from '../../hooks/controller/use-local-chat-conversation-view-mode.js';
import { ChatTranscriptView } from './chat-transcript-view.js';
import { LOCAL_CHAT_STAGE_SURFACE_WIDTH_CLASS } from './chat-layout-width.js';
import { ConversationComposer } from './conversation-composer.js';
import type { LocalChatPresenceTheme } from './presence-theme.js';
import { StageConversationPanel } from './stage-conversation-panel.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

type LocalChatConversationPaneProps = {
  selectedTarget: LocalChatTargetItem;
  selectedTargetAvatarUrl: string | null;
  theme: LocalChatPresenceTheme;
  stageAnchorViewportRef?: React.RefObject<HTMLDivElement | null>;
  stageCardAnchorOffsetPx?: number | null;
  loadingTargetDetail: boolean;
  loadingSessions: boolean;
  sendPhase: LocalChatTurnSendPhase;
  messages: ChatMessage[];
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  hasConversationHistory: boolean;
  onSeedFirstTurnComposer: () => void;
  onTranscriptNearBottomChange: (value: boolean) => void;
  conversationViewMode: LocalChatConversationViewMode;
  onOpenHistory: () => void;
  onReturnToStage: () => void;
  onOpenSettings: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputTextRef: React.RefObject<string>;
  hasInputText: boolean;
  setInputText: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  voiceInputState: VoiceInputState;
  onToggleVoiceInput: () => void;
  onCancelVoiceInput: () => void;
  enableVoice: boolean;
  isSending: boolean;
  onSend: () => void;
  canSend: boolean;
  runtimeReady: boolean;
};

const ICON_SETTINGS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ICON_HISTORY = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 6.3L3 8" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const ICON_STAGE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 18v2" />
  </svg>
);

export const LocalChatConversationPane = React.memo(function LocalChatConversationPane({
  selectedTarget,
  selectedTargetAvatarUrl,
  theme,
  stageAnchorViewportRef,
  stageCardAnchorOffsetPx,
  loadingTargetDetail,
  loadingSessions,
  sendPhase,
  messages,
  currentUserDisplayName,
  currentUserAvatarUrl,
  playingVoiceMessageId,
  voiceTranscriptVisibleById,
  onPlayVoiceMessage,
  onVoiceContextMenu,
  messagesEndRef,
  hasConversationHistory,
  onSeedFirstTurnComposer,
  onTranscriptNearBottomChange,
  conversationViewMode,
  onOpenHistory,
  onReturnToStage,
  onOpenSettings,
  inputRef,
  inputTextRef,
  hasInputText,
  setInputText,
  onInputKeyDown,
  voiceInputState,
  onToggleVoiceInput,
  onCancelVoiceInput,
  enableVoice,
  isSending,
  onSend,
  canSend,
  runtimeReady,
}: LocalChatConversationPaneProps) {
  const { t } = useModTranslation('local-chat');

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: theme.roomSurface }}
    >
      <div className="relative overflow-hidden border-b border-white/70 px-6 py-3">
        <div className="absolute inset-0 opacity-80" style={{ background: theme.roomAura }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/70" />

        <div className="relative z-10 flex items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            {conversationViewMode === 'stage' ? (
              <button
                type="button"
                onClick={onOpenHistory}
                className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
                aria-label={t('Header.openHistory')}
                title={t('Header.openHistory')}
              >
                {ICON_HISTORY}
              </button>
            ) : (
              <button
                type="button"
                onClick={onReturnToStage}
                className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
                aria-label={t('Header.returnToStage')}
                title={t('Header.returnToStage')}
              >
                {ICON_STAGE}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
              aria-label={t('Header.openSettings')}
              title={t('Header.openSettings')}
            >
              {ICON_SETTINGS}
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {conversationViewMode === 'stage' ? (
          <>
            <StageConversationPanel
              selectedTarget={selectedTarget}
              selectedTargetAvatarUrl={selectedTargetAvatarUrl}
              theme={theme}
              widthClassName={LOCAL_CHAT_STAGE_SURFACE_WIDTH_CLASS}
              anchorViewportRef={stageAnchorViewportRef}
              cardAnchorOffsetPx={stageCardAnchorOffsetPx}
              sendPhase={sendPhase}
              messages={messages}
              currentUserDisplayName={currentUserDisplayName}
              currentUserAvatarUrl={currentUserAvatarUrl}
              playingVoiceMessageId={playingVoiceMessageId}
              voiceTranscriptVisibleById={voiceTranscriptVisibleById}
              onPlayVoiceMessage={onPlayVoiceMessage}
              onVoiceContextMenu={onVoiceContextMenu}
              messagesEndRef={messagesEndRef}
              onOpenHistory={onOpenHistory}
            />

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
              runtimeReady={runtimeReady}
              widthClassName={LOCAL_CHAT_STAGE_SURFACE_WIDTH_CLASS}
            />
          </>
        ) : (
          <>
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
              onSeedFirstTurnComposer={onSeedFirstTurnComposer}
              onTranscriptNearBottomChange={onTranscriptNearBottomChange}
            />

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
              runtimeReady={runtimeReady}
            />
          </>
        )}
      </div>
    </section>
  );
});
