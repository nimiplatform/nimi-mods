import React, { useRef, useEffect } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod';
import type { ChatMessage } from '../services/dialogue-engine.js';
import { stripEmotionTags } from '../services/dialogue-engine.js';

interface ChatOverlayProps {
  messages: ChatMessage[];
  streamingText: string;
  voiceModeEnabled: boolean;
  isGenerating: boolean;
  isRecording: boolean;
  input: string;
  activeAudioMessageId: string | null;
  audioStatusByMessageId: Record<string, 'idle' | 'loading' | 'ready' | 'error'>;
  audioErrorByMessageId: Record<string, string>;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent) => void;
  onPlayAssistantMessageAudio: (messageId: string) => void;
  inputActions: React.ReactNode;
}

function presentAudioError(raw: string, t: (key: string) => string): string {
  const text = String(raw || '').trim();
  if (!text) return t('Errors.audioGeneric');
  if (text.includes('AI_MEDIA_OPTION_UNSUPPORTED') || text.includes('adjust_tts_voice_or_audio_options')) {
    return t('Errors.audioUnsupported');
  }
  if (text.includes('AI_PROVIDER_INTERNAL')) {
    return t('Errors.audioProvider');
  }
  return text;
}

function isGenerationFailureMessage(text: string): boolean {
  const value = String(text || '').trim();
  return value.includes('生成失败') || value.includes('请重试') || value.includes('failed') || value.includes('retry');
}

export function ChatOverlay({
  messages,
  streamingText,
  voiceModeEnabled,
  isGenerating,
  isRecording,
  input,
  activeAudioMessageId,
  audioStatusByMessageId,
  audioErrorByMessageId,
  onInputChange,
  onInputKeyDown,
  onSubmit,
  onPlayAssistantMessageAudio,
  inputActions,
}: ChatOverlayProps) {
  const { t } = useModTranslation('buddy');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const visibleMessages = messages.slice(-6);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[34px] border border-white/55 bg-white/42 shadow-[0_22px_70px_rgba(148,163,184,0.16)] backdrop-blur-2xl">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-5"
      >
        {visibleMessages.length === 0 && !streamingText && !isGenerating && (
          <div className="flex h-full min-h-0 items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/55 px-6 text-center text-sm leading-7 text-slate-500">
            {t('ChatOverlay.emptyState')}
          </div>
        )}

        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-5 flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-teal-500 shadow-sm">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 16.7A6.7 6.7 0 1 1 18.7 12 6.71 6.71 0 0 1 12 18.7Zm-1.2-9.9h2.4v4.9h-2.4Zm0 6.4h2.4v2h-2.4Z" />
                </svg>
              </div>
            )}

            <div className={`max-w-[84%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              <div
                className={`rounded-[22px] px-4 py-3 text-sm shadow-[0_8px_24px_rgba(31,38,135,0.05)] ${
                  msg.role === 'user'
                    ? 'rounded-tr-md bg-[#bce3d8] text-slate-700'
                    : isGenerationFailureMessage(msg.content)
                      ? 'rounded-tl-md border border-rose-200 bg-rose-50 text-rose-700'
                      : 'rounded-tl-md border border-slate-100 bg-white text-slate-700'
                }`}
              >
                <div className="leading-7">{stripEmotionTags(msg.content)}</div>
                {msg.role === 'assistant' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPlayAssistantMessageAudio(msg.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                        activeAudioMessageId === msg.id
                          ? 'border-teal-200 bg-teal-50 text-teal-700'
                          : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-teal-200 hover:text-teal-700'
                      }`}
                    >
                      {activeAudioMessageId === msg.id
                        ? t('ChatOverlay.playingAudio')
                        : audioStatusByMessageId[msg.id] === 'loading'
                          ? t('ChatOverlay.generatingAudio')
                          : t('ChatOverlay.playAudio')}
                    </button>
                    {msg.emotion && (
                      <span className="rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.08em] text-teal-600">
                        {msg.emotion}
                      </span>
                    )}
                    {audioStatusByMessageId[msg.id] === 'loading' && (
                      <span className="text-xs text-slate-400">
                        {t('ChatOverlay.audioPreparing')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'assistant' && audioStatusByMessageId[msg.id] === 'error' && (
                <div className="mt-2 text-xs text-rose-500">
                  {presentAudioError(audioErrorByMessageId[msg.id] || '', t)}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="order-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-500 shadow-sm">
                You
              </div>
            )}
          </div>
        ))}

        {streamingText && (
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-teal-500 shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 16.7A6.7 6.7 0 1 1 18.7 12 6.71 6.71 0 0 1 12 18.7Zm-1.2-9.9h2.4v4.9h-2.4Zm0 6.4h2.4v2h-2.4Z" />
              </svg>
            </div>
            <div className="max-w-[84%] rounded-[22px] rounded-tl-md border border-slate-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_8px_24px_rgba(31,38,135,0.05)]">
              {stripEmotionTags(streamingText)}
              <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400 align-middle" />
            </div>
          </div>
        )}

        {isGenerating && !streamingText && (
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-teal-500 shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 16.7A6.7 6.7 0 1 1 18.7 12 6.71 6.71 0 0 1 12 18.7Zm-1.2-9.9h2.4v4.9h-2.4Zm0 6.4h2.4v2h-2.4Z" />
              </svg>
            </div>
            <div className="flex items-center gap-1 rounded-[22px] rounded-tl-md border border-slate-100 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(31,38,135,0.05)]">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.1s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-white/40 bg-white/28 px-4 py-4 backdrop-blur-xl"
      >
        <div className="rounded-[24px] border border-teal-200/60 bg-white/78 p-1 shadow-inner shadow-slate-100 backdrop-blur">
          <input
            type="text"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={isRecording ? t('BuddyPage.recordingPlaceholder') : t('BuddyPage.placeholder')}
            disabled={isGenerating}
            className="w-full bg-transparent px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50"
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            {inputActions}
            <div className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500">
              {voiceModeEnabled ? t('ChatOverlay.autoVoiceEnabled') : t('ChatOverlay.manualPlay')}
            </div>
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="rounded-full bg-teal-500 px-6 py-2.5 text-sm font-medium text-white shadow-[0_12px_24px_rgba(20,184,166,0.22)] transition hover:bg-teal-600 disabled:opacity-40"
          >
            {isGenerating ? t('BuddyPage.responding') : t('BuddyPage.send')}
          </button>
        </div>
      </form>
    </div>
  );
}
