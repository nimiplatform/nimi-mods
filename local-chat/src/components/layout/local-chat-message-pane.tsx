import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatProductSettings, LocalChatTurnSendPhase } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { ChatBubble } from '../chat-bubbles.js';
import { buildMessageVisualGroups } from './message-grouping.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

type LocalChatMessagePaneProps = {
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  loadingTargetDetail: boolean;
  messages: ChatMessage[];
  loadingSessions: boolean;
  isSending: boolean;
  sendPhase: LocalChatTurnSendPhase;
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

const MIN_TEXTAREA_HEIGHT_PX = 48;
const MAX_TEXTAREA_HEIGHT_PX = 128;

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
  sendPhase: LocalChatTurnSendPhase;
  t: (key: string, values?: Record<string, unknown>) => string;
};

function CurrentTurnTypingBubble(props: {
  agentAvatarUrl: string | null;
  agentName: string;
  t: (key: string, values?: Record<string, unknown>) => string;
}) {
  const agentInitial = (String(props.agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  return (
    <div className="flex gap-2" role="status" aria-live="polite" aria-label={props.t('ChatBubble.agentPending')}>
      {props.agentAvatarUrl ? (
        <img
          src={props.agentAvatarUrl}
          alt={props.agentName || props.t('ChatBubble.roleAgent')}
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/5"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-semibold text-white ring-1 ring-black/5">
          {agentInitial}
        </div>
      )}
      <div className="max-w-[72%]">
        <div className="lc-typing-bubble px-4 py-3">
          <div className="lc-typing-row flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className="lc-typing-dot h-2.5 w-2.5 rounded-full" style={{ animation: 'typing-dot-bounce 1.15s ease-in-out 0ms infinite' }} />
              <span className="lc-typing-dot h-2.5 w-2.5 rounded-full" style={{ animation: 'typing-dot-bounce 1.15s ease-in-out 120ms infinite' }} />
              <span className="lc-typing-dot h-2.5 w-2.5 rounded-full" style={{ animation: 'typing-dot-bounce 1.15s ease-in-out 240ms infinite' }} />
            </div>
            <span className="lc-typing-label text-sm font-medium">
              {props.t('Header.presenceThinking')}
            </span>
            <span className="lc-typing-trail" aria-hidden>
              <span />
              <span />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  sendPhase,
  t,
}: MessageListProps) {
  const visualGroups = useMemo(() => buildMessageVisualGroups(messages), [messages]);
  const showPendingCard = sendPhase === 'awaiting-first-beat';
  const focusGroupIndex = !showPendingCard && visualGroups.length > 0 && visualGroups[visualGroups.length - 1]?.role === 'assistant'
    ? visualGroups[visualGroups.length - 1]!.groupIndex
    : -1;
  const messageElements: React.ReactNode[] = [];
  let lastDate: Date | null = null;
  for (const group of visualGroups) {
    const groupNodes: React.ReactNode[] = [];
    for (const item of group.items) {
      const inFocusedAssistantGroup = group.groupIndex === focusGroupIndex;
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
          showAvatar={inFocusedAssistantGroup ? true : item.showAvatar}
          showTimestamp={inFocusedAssistantGroup ? true : item.showTimestamp}
          position={inFocusedAssistantGroup ? 'single' : item.position}
        />,
      );
    }
    const isFocusedGroup = group.groupIndex === focusGroupIndex;
    const hasPendingVisual = group.items.some((item) => item.message.kind === 'image-pending' || item.message.kind === 'video-pending');
    const isVoicePlaying = group.items.some((item) => item.message.id === playingVoiceMessageId);
    const focusSummary = hasPendingVisual
      ? t('Header.presencePainting')
      : isVoicePlaying
        ? t('Header.presenceSpeaking')
        : '';
    messageElements.push(
      isFocusedGroup ? (
        <section
          key={`group-${group.groupIndex}`}
          className="lc-message-group lc-current-turn-shell"
        >
          <div className="lc-current-turn-halo" aria-hidden />
          <div className="lc-current-turn-card rounded-[28px] border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,247,247,0.9))] px-4 py-4">
            {focusSummary ? (
              <div className="mb-3 flex justify-end">
                <span className="lc-current-turn-chip text-[11px] font-medium text-mint-700">{focusSummary}</span>
              </div>
            ) : null}
            <div className="space-y-2.5">
              {groupNodes}
            </div>
          </div>
        </section>
      ) : (
        <section
          key={`group-${group.groupIndex}`}
          className="lc-message-group lc-message-group-history space-y-2.5"
        >
          {groupNodes}
        </section>
      ),
    );
  }
  return (
    <>
      {messageElements}
      {showPendingCard ? (
        <section className="lc-message-group lc-current-turn-shell">
          <div className="lc-current-turn-halo lc-current-turn-halo-pending" aria-hidden />
          <div className="lc-current-turn-card lc-current-turn-card-pending min-h-[112px] rounded-[26px] border border-dashed border-mint-200/80 bg-white/88 px-4 py-4">
            <CurrentTurnTypingBubble
              agentAvatarUrl={selectedTargetAvatarUrl}
              agentName={selectedTargetName}
              t={t}
            />
          </div>
        </section>
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
  const textareaResizeFrameRef = useRef<number | null>(null);
  const lastTextareaHeightRef = useRef(MIN_TEXTAREA_HEIGHT_PX);

  const resizeTextareaNow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT_PX), MAX_TEXTAREA_HEIGHT_PX);
    lastTextareaHeightRef.current = nextHeight;
    el.style.height = `${nextHeight}px`;
  }, []);

  const cancelScheduledTextareaResize = useCallback(() => {
    if (textareaResizeFrameRef.current === null || typeof window === 'undefined') {
      return;
    }
    window.cancelAnimationFrame(textareaResizeFrameRef.current);
    textareaResizeFrameRef.current = null;
  }, []);

  const scheduleTextareaResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) {
      return;
    }
    if (typeof window === 'undefined') {
      resizeTextareaNow(el);
      return;
    }
    cancelScheduledTextareaResize();
    textareaResizeFrameRef.current = window.requestAnimationFrame(() => {
      textareaResizeFrameRef.current = null;
      resizeTextareaNow(el);
    });
  }, [cancelScheduledTextareaResize, resizeTextareaNow]);

  const handleTextareaChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setInputText(value);
    const hasText = Boolean(value.trim());
    setLocalHasText((prev) => prev === hasText ? prev : hasText);
    scheduleTextareaResize(event.target);
  }, [scheduleTextareaResize, setInputText]);

  useEffect(() => cancelScheduledTextareaResize, [cancelScheduledTextareaResize]);

  // Sync localHasText + textarea size when external code modifies input (send clears, speech fills)
  useEffect(() => {
    setLocalHasText(Boolean(inputTextRef.current.trim()));
    scheduleTextareaResize(inputRef.current);
  }, [isSending, voiceInputState, inputRef, inputTextRef, scheduleTextareaResize]);

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
        scheduleTextareaResize(textarea);
      }
    });
  }, [inputRef, inputTextRef, scheduleTextareaResize, setInputText, t]);

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
        scheduleTextareaResize(textarea);
      }
    });
  }, [inputRef, inputTextRef, scheduleTextareaResize, selectedTarget, setInputText, t]);

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
        data-local-chat-scroll-root="true"
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6"
        style={{
          background: 'linear-gradient(180deg, rgba(250,252,252,0.88) 0%, rgba(243,247,248,0.92) 100%)',
          overflowAnchor: 'none',
        }}
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
                sendPhase={sendPhase}
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
                style={{ height: `${lastTextareaHeightRef.current}px` }}
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
