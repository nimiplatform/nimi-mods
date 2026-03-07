import React, { useCallback, useEffect } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import { ChatBubble, TypingBubble } from '../chat-bubbles.js';
import { buildMessageVisualGroups } from './message-grouping.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

type LocalChatMessagePaneProps = {
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  loadingTargetDetail: boolean;
  modelLabel: string;
  messages: ChatMessage[];
  isSending: boolean;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputText: string;
  setInputText: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  voiceInputState: VoiceInputState;
  onToggleVoiceInput: () => void;
  onCancelVoiceInput: () => void;
  onSend: () => void;
  canSend: boolean;
};

function formatDateLabel(date: Date, t: (key: string) => string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - messageDay.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return t('MessagePane.today');
  if (diffDays === 1) return t('MessagePane.yesterday');
  return date.toLocaleDateString();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function LocalChatMessagePane({
  selectedTarget,
  selectedTargetAvatarUrl,
  loadingTargetDetail,
  modelLabel,
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
}: LocalChatMessagePaneProps) {
  const { t } = useModTranslation('local-chat');
  const isRecording = voiceInputState === 'recording';
  const isTranscribing = voiceInputState === 'transcribing';
  const voiceBusy = isRecording || isTranscribing;
  const hasStreamingMessage = messages.some((message) => message.kind === 'streaming' && message.role === 'assistant');
  const visualGroups = buildMessageVisualGroups(messages);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);
  const handleTextareaInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    resizeTextarea(event.currentTarget);
  }, [resizeTextarea]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    resizeTextarea(textarea);
  }, [inputRef, inputText, resizeTextarea]);

  const messageElements: React.ReactNode[] = [];
  let lastDate: Date | null = null;
  for (const group of visualGroups) {
    const groupNodes: React.ReactNode[] = [];
    for (const item of group.items) {
      if (!lastDate || !isSameDay(lastDate, item.message.timestamp)) {
        groupNodes.push(
          <div key={`date-${item.message.id}`} className="flex items-center gap-3 py-2">
            <div className="h-px flex-1 bg-gray-200/70" />
            <span className="lc-pill-divider shrink-0 px-3 py-1 text-[11px] font-semibold">
              {formatDateLabel(item.message.timestamp, t)}
            </span>
            <div className="h-px flex-1 bg-gray-200/70" />
          </div>,
        );
        lastDate = item.message.timestamp;
      }
      groupNodes.push(
        <ChatBubble
          key={item.message.id}
          message={item.message}
          agentAvatarUrl={selectedTargetAvatarUrl}
          agentName={selectedTarget?.displayName || 'Agent'}
          userAvatarUrl={currentUserAvatarUrl}
          userName={currentUserDisplayName}
          voicePlayingMessageId={playingVoiceMessageId}
          isVoiceTranscriptVisible={Boolean(voiceTranscriptVisibleById[item.message.id])}
          onPlayVoiceMessage={onPlayVoiceMessage}
          onVoiceContextMenu={onVoiceContextMenu}
          showAvatar={item.showAvatar}
          showTimestamp={item.showTimestamp}
          position={item.position}
        />,
      );
    }
    messageElements.push(
      <div key={`group-${group.groupIndex}`} className="space-y-1.5">
        {groupNodes}
      </div>,
    );
  }

  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 pb-4 pt-5"
        style={{ background: 'radial-gradient(ellipse at top, #eafaf5 0%, rgba(234,250,245,0) 48%), linear-gradient(180deg, #f8fbfb 0%, #f2f7f8 52%, #eef4f5 100%)' }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="lc-card w-full max-w-md rounded-3xl px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-mint-100 to-brand-100">
                <span className="text-xl text-mint-600">&#9672;</span>
              </div>
              <p className="text-base font-semibold text-gray-800">{t('MessagePane.emptyTitle')}</p>
              <p className="mt-1 text-sm text-gray-500">
                {selectedTarget
                  ? t('MessagePane.emptyDescTarget', { name: selectedTarget.displayName, model: modelLabel })
                  : t('MessagePane.emptyDescNoTarget')}
              </p>
              {loadingTargetDetail ? (
                <p className="mt-2 text-xs text-gray-400">{t('MessagePane.resolvingAgent')}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-3">
            {messageElements}
            {isSending && !hasStreamingMessage ? (
              <TypingBubble
                agentAvatarUrl={selectedTargetAvatarUrl}
                agentName={selectedTarget?.displayName || 'Agent'}
              />
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="lc-card lc-input-shell rounded-[22px] p-3">
          {voiceInputState === 'recording' ? (
            <p className="mb-2 text-[11px] font-semibold text-rose-700">{t('MessagePane.voiceRecording')}</p>
          ) : null}
          {voiceInputState === 'transcribing' ? (
            <p className="mb-2 text-[11px] font-semibold text-gray-600">{t('MessagePane.voiceTranscribing')}</p>
          ) : null}
          {voiceInputState === 'failed' ? (
            <p className="mb-2 text-[11px] text-amber-700">{t('MessagePane.voiceFailed')}</p>
          ) : null}
          <div className="flex items-end gap-2.5 transition-all duration-200">
            <button
              type="button"
              onClick={onToggleVoiceInput}
              disabled={!canSend || isTranscribing}
              title={isRecording ? t('MessagePane.stopVoiceInput') : t('MessagePane.startVoiceInput')}
              className={`lc-btn h-10 w-10 shrink-0 ${
                isRecording
                  ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-[0_8px_16px_rgba(244,63,94,0.12)]'
                  : 'lc-btn-secondary text-gray-700'
              }`}
              style={isRecording ? { animation: 'recording-pulse 1.5s ease-in-out infinite' } : undefined}
            >
              {isTranscribing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
              ) : isRecording ? (
                <span className="h-2.5 w-2.5 rounded-sm bg-current" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1v11" />
                  <path d="M8 5a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0z" />
                  <path d="M19 11a7 7 0 0 1-14 0" />
                  <path d="M12 19v4" />
                  <path d="M8 23h8" />
                </svg>
              )}
            </button>
            {isRecording ? (
              <button
                type="button"
                onClick={onCancelVoiceInput}
                className="lc-btn lc-btn-secondary h-10 px-3 text-xs font-medium"
              >
                {t('MessagePane.cancelVoiceInput')}
              </button>
            ) : null}
            <button
              type="button"
              disabled
              title={t('MessagePane.attachmentPlaceholder')}
              className="lc-btn lc-btn-secondary h-10 w-10 shrink-0 text-gray-400"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              className="min-h-[44px] max-h-32 min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-mint-300 disabled:bg-gray-100"
              placeholder={selectedTarget ? t('MessagePane.inputPlaceholder') : t('MessagePane.noAgentPlaceholder')}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onInput={handleTextareaInput}
              onKeyDown={onInputKeyDown}
              disabled={!canSend || isTranscribing}
            />
            <button
              type="button"
              onClick={(event) => {
                const el = event.currentTarget;
                el.style.animation = 'send-press 0.2s ease-out';
                el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
                onSend();
              }}
              disabled={!canSend || !inputText.trim() || voiceBusy}
              className="lc-btn lc-btn-primary h-11 w-11 shrink-0 rounded-2xl"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
