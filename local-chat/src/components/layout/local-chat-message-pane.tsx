import type React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import { ChatBubble, TypingBubble } from '../chat-bubbles.js';
import type { LocalChatTargetItem, VoiceInputState } from './types.js';

const C = {
  green100: '#dcfce7',
  green200: '#bbf7d0',
  green600: '#16a34a',
  gray50: '#f9fafb',
} as const;

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

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" style={{ backgroundColor: C.gray50 }}>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${C.green100}, ${C.green200})` }}>
                <span style={{ color: C.green600, fontSize: 20 }}>&#9672;</span>
              </div>
              <p className="text-sm font-medium text-gray-700">{t('MessagePane.emptyTitle')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedTarget
                  ? t('MessagePane.emptyDescTarget', { name: selectedTarget.displayName, model: modelLabel })
                  : t('MessagePane.emptyDescNoTarget')}
              </p>
              {loadingTargetDetail ? (
                <p className="mt-1 text-[11px] text-gray-400">{t('MessagePane.resolvingAgent')}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                agentAvatarUrl={selectedTargetAvatarUrl}
                agentName={selectedTarget?.displayName || 'Agent'}
                userAvatarUrl={currentUserAvatarUrl}
                userName={currentUserDisplayName}
                voicePlayingMessageId={playingVoiceMessageId}
                isVoiceTranscriptVisible={Boolean(voiceTranscriptVisibleById[message.id])}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onVoiceContextMenu={onVoiceContextMenu}
              />
            ))}
            {isSending ? (
              <TypingBubble
                agentAvatarUrl={selectedTargetAvatarUrl}
                agentName={selectedTarget?.displayName || 'Agent'}
              />
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        {voiceInputState === 'recording' ? (
          <p className="mb-2 text-[11px] font-medium text-rose-700">{t('MessagePane.voiceRecording')}</p>
        ) : null}
        {voiceInputState === 'transcribing' ? (
          <p className="mb-2 text-[11px] font-medium text-gray-600">{t('MessagePane.voiceTranscribing')}</p>
        ) : null}
        {voiceInputState === 'failed' ? (
          <p className="mb-2 text-[11px] text-amber-700">{t('MessagePane.voiceFailed')}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleVoiceInput}
            disabled={!canSend || isTranscribing}
            title={isRecording ? t('MessagePane.stopVoiceInput') : t('MessagePane.startVoiceInput')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
              isRecording
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
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
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('MessagePane.cancelVoiceInput')}
            </button>
          ) : null}
          <textarea
            ref={inputRef}
            rows={1}
            className="min-h-[42px] max-h-32 min-w-0 flex-1 resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white disabled:bg-gray-100"
            placeholder={selectedTarget ? t('MessagePane.inputPlaceholder') : t('MessagePane.noAgentPlaceholder')}
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={!canSend || isTranscribing}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || !inputText.trim() || voiceBusy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: C.green600 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
