import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatConversationViewMode } from '../../hooks/controller/use-local-chat-conversation-view-mode.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

type ConversationComposerProps = {
  mode: LocalChatConversationViewMode;
  selectedTarget: LocalChatTargetItem | null;
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

const MIN_TEXTAREA_HEIGHT_PX = 48;
const MAX_TEXTAREA_HEIGHT_PX = 128;

export const ConversationComposer = React.memo(function ConversationComposer({
  mode,
  selectedTarget,
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
}: ConversationComposerProps) {
  const { t } = useModTranslation('local-chat');
  const isRecording = voiceInputState === 'recording';
  const isTranscribing = voiceInputState === 'transcribing';
  const voiceBusy = isRecording || isTranscribing;
  const [showMediaQuickActions, setShowMediaQuickActions] = useState(false);
  const textareaResizeFrameRef = useRef<number | null>(null);
  const lastTextareaHeightRef = useRef(MIN_TEXTAREA_HEIGHT_PX);
  const showRuntimeInlineHint = Boolean(selectedTarget) && !runtimeReady;

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
    scheduleTextareaResize(event.target);
  }, [scheduleTextareaResize, setInputText]);

  useEffect(() => cancelScheduledTextareaResize, [cancelScheduledTextareaResize]);

  useEffect(() => {
    scheduleTextareaResize(inputRef.current);
  }, [hasInputText, isSending, voiceInputState, inputRef, scheduleTextareaResize, selectedTarget?.id]);

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

  return (
    <div className={`shrink-0 px-5 pb-5 ${mode === 'stage' ? 'pt-1' : 'pt-2'}`}>
      <div className={`mx-auto max-w-[860px] ${isRecording ? 'rounded-[28px] border border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.94))] shadow-[0_18px_40px_rgba(244,63,94,0.12)]' : ''}`}>
        {showRuntimeInlineHint ? (
          <div className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-2 text-sm text-amber-800 shadow-[0_12px_24px_rgba(217,119,6,0.08)]">
            {t('MessagePane.runtimeInlinePending')}
          </div>
        ) : null}

        <div className={`lc-card lc-input-shell ${mode === 'stage' ? 'rounded-[28px] border-white/90 bg-white/84 shadow-[0_24px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl' : 'rounded-[24px]'} p-3`}>
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
              className={`min-h-[48px] max-h-32 min-w-0 flex-1 resize-none rounded-[20px] border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 disabled:bg-slate-100 ${
                mode === 'stage'
                  ? 'border-white/80 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus:border-mint-300'
                  : 'border-slate-200 focus:border-mint-300'
              }`}
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
              disabled={!canSend || !hasInputText || voiceBusy}
              className={`lc-btn lc-btn-primary h-12 w-12 shrink-0 rounded-[20px] ${mode === 'stage' ? 'shadow-[0_18px_36px_rgba(78,204,163,0.3)]' : ''}`}
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
  );
});
