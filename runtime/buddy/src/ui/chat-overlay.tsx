import React, { useRef, useEffect } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../services/dialogue-engine.js';

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
    <div className="flex min-h-0 max-h-[23rem] flex-col overflow-hidden rounded-[30px] border border-white/18 bg-white/8 shadow-[0_20px_50px_rgba(148,163,184,0.05)]">
      <div className="flex items-center justify-between border-b border-white/18 bg-white/6 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t('ChatOverlay.title')}</div>
          <div className="text-xs text-slate-500">
            {voiceModeEnabled ? t('ChatOverlay.autoVoiceEnabled') : t('ChatOverlay.manualPlay')}
          </div>
        </div>
        <div className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-slate-500">
          {t('ChatOverlay.recentCount', { count: visibleMessages.length })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {visibleMessages.length === 0 && !streamingText && (
          <div className="flex h-full min-h-28 items-center justify-center rounded-[22px] border border-dashed border-white/18 bg-white/6 px-6 text-center text-sm text-slate-500">
            {t('ChatOverlay.emptyState')}
          </div>
        )}

        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 text-white'
                  : isGenerationFailureMessage(msg.content)
                    ? 'border border-rose-200 bg-rose-50/90 text-rose-700'
                    : 'border border-white/18 bg-white/12 text-slate-800'
              }`}
            >
              <div className="leading-6">{msg.content}</div>
              {msg.role === 'assistant' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayAssistantMessageAudio(msg.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      activeAudioMessageId === msg.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200/45 bg-white/22 text-slate-700 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    {activeAudioMessageId === msg.id
                      ? t('ChatOverlay.playingAudio')
                      : audioStatusByMessageId[msg.id] === 'loading'
                        ? t('ChatOverlay.generatingAudio')
                        : t('ChatOverlay.playAudio')}
                  </button>
                  {audioStatusByMessageId[msg.id] === 'loading' && (
                    <span className="text-[11px] text-slate-500">
                      {t('ChatOverlay.audioPreparing')}
                    </span>
                  )}
                  {msg.emotion && (
                    <span className="rounded-full bg-emerald-50/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                      {msg.emotion}
                    </span>
                  )}
                  {audioStatusByMessageId[msg.id] === 'error' && (
                    <span className="max-w-full break-all text-[11px] text-rose-500">
                      {presentAudioError(audioErrorByMessageId[msg.id] || '', t)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="mb-3 flex justify-start">
            <div className="max-w-[88%] rounded-[22px] border border-white/18 bg-white/12 px-4 py-3 text-sm text-slate-800 shadow-sm">
              {streamingText.replace(/\[emotion:\w+\]/, '')}
              <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-3 border-t border-white/18 bg-white/8 px-4 py-4"
      >
        {inputActions}
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={isRecording ? t('BuddyPage.recordingPlaceholder') : t('BuddyPage.placeholder')}
          disabled={isGenerating}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isGenerating}
          className="rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-6 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)] transition-opacity disabled:opacity-40"
        >
          {isGenerating ? t('BuddyPage.responding') : t('BuddyPage.send')}
        </button>
      </form>
    </div>
  );
}
