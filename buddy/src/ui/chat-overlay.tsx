import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../services/dialogue-engine.js';

interface ChatOverlayProps {
  messages: ChatMessage[];
  streamingText: string;
  isGenerating: boolean;
  voiceModeEnabled: boolean;
  activeAudioMessageId: string | null;
  audioStatusByMessageId: Record<string, 'idle' | 'loading' | 'ready' | 'error'>;
  audioErrorByMessageId: Record<string, string>;
  onSend: (text: string) => void;
  onPlayAssistantMessageAudio: (messageId: string) => void;
}

function presentAudioError(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '语音生成失败';
  if (text.includes('AI_MEDIA_OPTION_UNSUPPORTED') || text.includes('adjust_tts_voice_or_audio_options')) {
    return '当前 TTS voice 不支持这个模型，请在右侧控制台切换 TTS Voice。';
  }
  if (text.includes('AI_PROVIDER_INTERNAL')) {
    return 'TTS provider 内部错误，先换一个 voice 或稍后再试。';
  }
  return text;
}

export function ChatOverlay({
  messages,
  streamingText,
  isGenerating,
  voiceModeEnabled,
  activeAudioMessageId,
  audioStatusByMessageId,
  audioErrorByMessageId,
  onSend,
  onPlayAssistantMessageAudio,
}: ChatOverlayProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isGenerating) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Show last 5 messages to keep overlay compact
  const visibleMessages = messages.slice(-8);

  return (
    <div className="flex min-h-0 flex-col rounded-[30px] border border-white/70 bg-white/88 shadow-[0_20px_60px_rgba(148,163,184,0.18)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">对话台</div>
          <div className="text-xs text-slate-500">
            {voiceModeEnabled ? '语音模式已开启，助手回复后会自动播报' : '语音模式关闭，可手动点击助手消息播放'}
          </div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-slate-500">
          最近 {visibleMessages.length} 条
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {visibleMessages.length === 0 && !streamingText && (
          <div className="flex h-full min-h-40 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center text-sm text-slate-500">
            先打个招呼，或者按住下方按钮直接说话。
          </div>
        )}

        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 text-white'
                  : 'border border-slate-100 bg-white text-slate-800'
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
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    {activeAudioMessageId === msg.id
                      ? '角色播报中...'
                      : audioStatusByMessageId[msg.id] === 'loading'
                        ? '生成语音中...'
                        : '播放语音'}
                  </button>
                  {msg.emotion && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                      {msg.emotion}
                    </span>
                  )}
                  {audioStatusByMessageId[msg.id] === 'error' && (
                    <span className="max-w-full break-all text-[11px] text-rose-500">
                      {presentAudioError(audioErrorByMessageId[msg.id] || '')}
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
            <div className="max-w-[85%] rounded-[24px] border border-slate-100 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
              {streamingText.replace(/\[emotion:\w+\]/, '')}
              <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 border-t border-slate-100 px-4 py-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="说点什么吧..."
          disabled={isGenerating}
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-400 focus:bg-white disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isGenerating}
          className="rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)] transition-opacity disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </div>
  );
}
