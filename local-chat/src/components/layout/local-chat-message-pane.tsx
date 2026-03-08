import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatProductSettings } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { ChatBubble, TypingBubble } from '../chat-bubbles.js';
import { buildMessageVisualGroups } from './message-grouping.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

type LocalChatMessagePaneProps = {
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  loadingTargetDetail: boolean;
  messages: ChatMessage[];
  loadingSessions: boolean;
  isSending: boolean;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputTextRef: React.RefObject<string>;
  setInputText: (value: string) => void;
  productSettings: LocalChatProductSettings;
  hasConversationHistory: boolean;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  voiceInputState: VoiceInputState;
  onToggleVoiceInput: () => void;
  onCancelVoiceInput: () => void;
  enableVoice: boolean;
  onSend: () => void;
  canSend: boolean;
  runtimeReady: boolean;
};

function formatDateLabel(date: Date, t: (key: string, values?: Record<string, unknown>) => string): string {
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

type MessageListProps = {
  messages: ChatMessage[];
  selectedTargetAvatarUrl: string | null;
  selectedTargetName: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  isSending: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
};

const MessageList = React.memo(function MessageList({
  messages,
  selectedTargetAvatarUrl,
  selectedTargetName,
  currentUserDisplayName,
  currentUserAvatarUrl,
  playingVoiceMessageId,
  voiceTranscriptVisibleById,
  onPlayVoiceMessage,
  onVoiceContextMenu,
  isSending,
  t,
}: MessageListProps) {
  const visualGroups = useMemo(() => buildMessageVisualGroups(messages), [messages]);
  const messageElements: React.ReactNode[] = [];
  let lastDate: Date | null = null;
  for (const group of visualGroups) {
    const groupNodes: React.ReactNode[] = [];
    for (const item of group.items) {
      if (!lastDate || !isSameDay(lastDate, item.message.timestamp)) {
        groupNodes.push(
          <div key={`date-${item.message.id}`} className="flex items-center gap-3 py-4">
            <div className="h-px flex-1 bg-slate-200/70" />
            <span className="lc-pill-divider shrink-0 px-3 py-1 text-[11px] font-semibold">
              {formatDateLabel(item.message.timestamp, t)}
            </span>
            <div className="h-px flex-1 bg-slate-200/70" />
          </div>,
        );
        lastDate = item.message.timestamp;
      }
      groupNodes.push(
        <ChatBubble
          key={item.message.id}
          message={item.message}
          agentAvatarUrl={selectedTargetAvatarUrl}
          agentName={selectedTargetName}
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
      <div key={`group-${group.groupIndex}`} className="space-y-2.5">
        {groupNodes}
      </div>,
    );
  }
  return (
    <>
      {messageElements}
      {isSending ? (
        <TypingBubble
          agentAvatarUrl={selectedTargetAvatarUrl}
          agentName={selectedTargetName}
        />
      ) : null}
    </>
  );
});

export const LocalChatMessagePane = React.memo(function LocalChatMessagePane({
  selectedTarget,
  selectedTargetAvatarUrl,
  loadingTargetDetail,
  messages,
  loadingSessions,
  isSending,
  currentUserDisplayName,
  currentUserAvatarUrl,
  playingVoiceMessageId,
  voiceTranscriptVisibleById,
  onPlayVoiceMessage,
  onVoiceContextMenu,
  messagesEndRef,
  inputRef,
  inputTextRef,
  setInputText,
  productSettings,
  hasConversationHistory,
  onInputKeyDown,
  voiceInputState,
  onToggleVoiceInput,
  onCancelVoiceInput,
  enableVoice,
  onSend,
  canSend,
  runtimeReady,
}: LocalChatMessagePaneProps) {
  const { t } = useModTranslation('local-chat');
  const isRecording = voiceInputState === 'recording';
  const isTranscribing = voiceInputState === 'transcribing';
  const voiceBusy = isRecording || isTranscribing;
  const [showMediaQuickActions, setShowMediaQuickActions] = useState(false);
  const [localHasText, setLocalHasText] = useState(() => Boolean(inputTextRef.current.trim()));

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setInputText(value);
    const hasText = Boolean(value.trim());
    setLocalHasText((prev) => prev === hasText ? prev : hasText);
    resizeTextarea(event.target);
  }, [resizeTextarea, setInputText]);

  // Sync localHasText + textarea size when external code modifies input (send clears, speech fills)
  useEffect(() => {
    setLocalHasText(Boolean(inputTextRef.current.trim()));
    if (inputRef.current) {
      resizeTextarea(inputRef.current);
    }
  }, [isSending, voiceInputState, inputRef, inputTextRef, resizeTextarea]);

  const appendMediaPrompt = useCallback((kind: 'image' | 'video') => {
    const prompt = kind === 'image'
      ? t('MessagePane.quickImagePrompt')
      : t('MessagePane.quickVideoPrompt');
    const current = inputTextRef.current.trim();
    const nextValue = current ? `${current}\n${prompt}` : prompt;
    setInputText(nextValue);
    setShowMediaQuickActions(false);
    requestAnimationFrame(() => {
      const textarea = inputRef.current;
      if (textarea) {
        textarea.focus();
        resizeTextarea(textarea);
      }
    });
  }, [inputRef, inputTextRef, resizeTextarea, setInputText, t]);

  const seedFirstTurnComposer = useCallback(() => {
    if (!selectedTarget) {
      return;
    }
    if (!inputTextRef.current.trim()) {
      setInputText(t('MessagePane.onboardingStarterPrompt', { name: selectedTarget.displayName }));
    }
    requestAnimationFrame(() => {
      const textarea = inputRef.current;
      if (textarea) {
        textarea.focus();
        resizeTextarea(textarea);
      }
    });
  }, [inputRef, inputTextRef, resizeTextarea, selectedTarget, setInputText, t]);

  const selectedTargetName = selectedTarget?.displayName || 'Agent';

  const showLoadingState = loadingSessions && Boolean(selectedTarget);
  const showFreshEmptyState = !showLoadingState && messages.length === 0;
  const showRuntimeInlineHint = Boolean(selectedTarget) && !runtimeReady;
  const shouldShowWelcomeCard = showFreshEmptyState && Boolean(selectedTarget) && !loadingTargetDetail;
  const shouldShowHistoryIntro = hasConversationHistory && messages.length > 0;
  const welcomeTarget = shouldShowWelcomeCard ? selectedTarget : null;

  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 pb-4 pt-6"
        style={{ background: 'linear-gradient(180deg, rgba(250,252,252,0.88) 0%, rgba(243,247,248,0.92) 100%)' }}
      >
        {showLoadingState ? (
          <div className="mx-auto flex h-full max-w-[820px] items-center justify-center">
            <div className="w-full rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(237,247,247,0.86))] px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="lc-skeleton-pill h-4 w-28" />
              <div className="mt-4 lc-skeleton-card h-24 w-full" />
              <div className="mt-4 lc-skeleton-card h-24 w-full" />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[820px] space-y-5">
            {welcomeTarget ? (
              <section className="lc-card rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,247,247,0.88))] px-6 py-7 text-center shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mint-700/70">
                  {t('MessagePane.welcomeEyebrow')}
                </p>
                <h2 className="mt-3 text-[30px] font-black tracking-tight text-slate-950">
                  {t('MessagePane.welcomeTitle', { name: welcomeTarget.displayName })}
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  {t('MessagePane.welcomeDescription', {
                    name: welcomeTarget.displayName,
                    deliveryStyle: productSettings.deliveryStyle,
                  })}
                </p>
                <button
                  type="button"
                  onClick={seedFirstTurnComposer}
                  className="lc-btn lc-btn-primary mt-5 h-11 rounded-full px-5 text-sm font-semibold"
                >
                  {t('MessagePane.onboardingStart')}
                </button>
              </section>
            ) : null}

            {shouldShowHistoryIntro ? (
              <div className="rounded-full border border-white/80 bg-white/72 px-4 py-2 text-center text-[11px] font-medium text-slate-500 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                {t('MessagePane.historyIntro')}
              </div>
            ) : null}

            <section className="space-y-4">
              <MessageList
                messages={messages}
                selectedTargetAvatarUrl={selectedTargetAvatarUrl}
                selectedTargetName={selectedTargetName}
                currentUserDisplayName={currentUserDisplayName}
                currentUserAvatarUrl={currentUserAvatarUrl}
                playingVoiceMessageId={playingVoiceMessageId}
                voiceTranscriptVisibleById={voiceTranscriptVisibleById}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onVoiceContextMenu={onVoiceContextMenu}
                isSending={isSending}
                t={t}
              />
              <div ref={messagesEndRef} />
            </section>
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <div className={`mx-auto max-w-[860px] ${isRecording ? 'rounded-[28px] border border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.94))] shadow-[0_18px_40px_rgba(244,63,94,0.12)]' : ''}`}>
          {showRuntimeInlineHint ? (
            <div className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-2 text-sm text-amber-800 shadow-[0_12px_24px_rgba(217,119,6,0.08)]">
              {t('MessagePane.runtimeInlinePending')}
            </div>
          ) : null}

          <div className="lc-card lc-input-shell rounded-[24px] p-3">
            {voiceInputState === 'recording' ? (
              <p className="mb-2 text-[11px] font-semibold text-rose-700">{t('MessagePane.voiceRecording')}</p>
            ) : null}
            {voiceInputState === 'transcribing' ? (
              <p className="mb-2 text-[11px] font-semibold text-slate-600">{t('MessagePane.voiceTranscribing')}</p>
            ) : null}
            {voiceInputState === 'failed' ? (
              <p className="mb-2 text-[11px] text-amber-700">{t('MessagePane.voiceFailed')}</p>
            ) : null}
            {showMediaQuickActions ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => appendMediaPrompt('image')}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700"
                >
                  {t('MessagePane.insertImageRequest')}
                </button>
                <button
                  type="button"
                  onClick={() => appendMediaPrompt('video')}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700"
                >
                  {t('MessagePane.insertVideoRequest')}
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2.5 transition-all duration-200">
              <button
                type="button"
                onClick={onToggleVoiceInput}
                disabled={!enableVoice || !canSend || isTranscribing}
                title={isRecording ? t('MessagePane.stopVoiceInput') : t('MessagePane.startVoiceInput')}
                className={`lc-btn h-11 w-11 shrink-0 rounded-2xl ${
                  isRecording
                    ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-[0_8px_16px_rgba(244,63,94,0.12)]'
                    : enableVoice
                      ? 'lc-btn-secondary text-slate-700'
                      : 'border border-slate-200 bg-slate-100 text-slate-400'
                }`}
                style={isRecording ? { animation: 'recording-pulse 1.5s ease-in-out infinite' } : undefined}
              >
                {isTranscribing ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
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
                  className="lc-btn lc-btn-secondary h-11 rounded-2xl px-3 text-xs font-medium"
                >
                  {t('MessagePane.cancelVoiceInput')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowMediaQuickActions((previous) => !previous)}
                title={t('MessagePane.openMediaPrompts')}
                className={`lc-btn h-11 w-11 shrink-0 rounded-2xl ${
                  showMediaQuickActions ? 'border-sky-200 bg-sky-50 text-sky-700' : 'lc-btn-secondary text-slate-600'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                className="min-h-[48px] max-h-32 min-w-0 flex-1 resize-none rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-mint-300 disabled:bg-slate-100"
                placeholder={selectedTarget ? t('MessagePane.inputPlaceholder') : t('MessagePane.noAgentPlaceholder')}
                defaultValue={inputTextRef.current}
                onChange={handleTextareaChange}
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
                disabled={!canSend || !localHasText || voiceBusy}
                className="lc-btn lc-btn-primary h-12 w-12 shrink-0 rounded-[20px]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
