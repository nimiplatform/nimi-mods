import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatTurnSendPhase } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { ChatBubble } from '../chat-bubbles.js';
import { ConversationTypingBubble } from './conversation-typing-bubble.js';

type StageDialogueCardProps = {
  agentAvatarUrl: string | null;
  agentName: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  messages: ChatMessage[];
  sendPhase: LocalChatTurnSendPhase;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
};

type StageConversationSlice = {
  userMessage: ChatMessage | null;
  assistantMessages: ChatMessage[];
  pendingFirstBeat: boolean;
};

export function resolveStageConversationSlice(input: {
  messages: ChatMessage[];
  sendPhase: LocalChatTurnSendPhase;
}): StageConversationSlice {
  const latestUserMessage = [...input.messages].reverse().find((message) => message.role === 'user') || null;
  const lastMessage = input.messages[input.messages.length - 1] || null;
  const shouldShowPendingUserTurn = (
    input.sendPhase === 'awaiting-first-beat' || input.sendPhase === 'streaming-first-beat'
  ) && lastMessage?.role === 'user';
  if (shouldShowPendingUserTurn) {
    return {
      userMessage: latestUserMessage,
      assistantMessages: [],
      pendingFirstBeat: true,
    };
  }

  const messages = input.messages;
  const lastAssistantIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find((entry) => entry.message.role === 'assistant' && String(entry.message.meta?.turnId || '').trim())?.index ?? -1;

  if (lastAssistantIndex < 0) {
    return {
      userMessage: latestUserMessage,
      assistantMessages: [],
      pendingFirstBeat: input.sendPhase === 'awaiting-first-beat' || input.sendPhase === 'streaming-first-beat',
    };
  }

  const lastAssistant = messages[lastAssistantIndex]!;
  const latestAssistantTurnId = String(lastAssistant.meta?.turnId || '').trim();
  const assistantMessages = messages.filter(
    (message) => message.role === 'assistant' && String(message.meta?.turnId || '').trim() === latestAssistantTurnId,
  );
  let userMessage: ChatMessage | null = null;
  for (let index = lastAssistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      userMessage = messages[index] || null;
      break;
    }
  }

  return {
    userMessage,
    assistantMessages,
    pendingFirstBeat: false,
  };
}

export const StageDialogueCard = React.memo(function StageDialogueCard({
  agentAvatarUrl,
  agentName,
  currentUserDisplayName,
  currentUserAvatarUrl,
  messages,
  sendPhase,
  playingVoiceMessageId,
  voiceTranscriptVisibleById,
  onPlayVoiceMessage,
  onVoiceContextMenu,
  messagesEndRef,
  scrollRootRef,
}: StageDialogueCardProps) {
  const { t } = useModTranslation('local-chat');
  const { userMessage, assistantMessages, pendingFirstBeat } = React.useMemo(
    () => resolveStageConversationSlice({
      messages,
      sendPhase,
    }),
    [messages, sendPhase],
  );
  const showPendingFirstBeat = pendingFirstBeat && assistantMessages.length === 0;
  const showEmptyState = !userMessage && assistantMessages.length === 0 && !showPendingFirstBeat;

  return (
    <div className="lc-stage-dialogue-shell rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(244,249,249,0.82))] p-3 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mint-700/70">
            {t('MessagePane.stageLabel')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {assistantMessages.length > 0
              ? t('MessagePane.stageWithBeats', { count: assistantMessages.length })
              : t('MessagePane.stageHint')}
          </p>
        </div>
      </div>

      <div
        ref={scrollRootRef}
        data-local-chat-scroll-root="true"
        className="max-h-[38vh] overflow-y-auto overscroll-contain rounded-[24px] border border-white/70 bg-white/72 px-3 py-3"
      >
        {showEmptyState ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="h-14 w-14 rounded-full bg-[radial-gradient(circle,_rgba(94,234,212,0.28),_rgba(255,255,255,0.96))] shadow-[0_14px_28px_rgba(20,184,166,0.18)]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {t('MessagePane.stageEmptyTitle', { name: agentName })}
              </p>
              <p className="text-sm leading-6 text-slate-500">
                {t('MessagePane.stageEmptyHint', { name: agentName })}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {userMessage ? (
              <ChatBubble
                message={userMessage}
                agentAvatarUrl={agentAvatarUrl}
                agentName={agentName}
                userAvatarUrl={currentUserAvatarUrl}
                userName={currentUserDisplayName}
                voicePlayingMessageId={playingVoiceMessageId}
                isVoiceTranscriptVisible={Boolean(voiceTranscriptVisibleById[userMessage.id])}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onVoiceContextMenu={onVoiceContextMenu}
                showAvatar
                showTimestamp
                position="single"
              />
            ) : null}

            {assistantMessages.map((message, index) => (
              <ChatBubble
                key={message.id}
                message={message}
                agentAvatarUrl={agentAvatarUrl}
                agentName={agentName}
                userAvatarUrl={currentUserAvatarUrl}
                userName={currentUserDisplayName}
                voicePlayingMessageId={playingVoiceMessageId}
                isVoiceTranscriptVisible={Boolean(voiceTranscriptVisibleById[message.id])}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onVoiceContextMenu={onVoiceContextMenu}
                showAvatar={index === 0 || index === assistantMessages.length - 1}
                showTimestamp={index === assistantMessages.length - 1}
                position={assistantMessages.length <= 1 ? 'single' : index === 0 ? 'start' : index === assistantMessages.length - 1 ? 'end' : 'middle'}
              />
            ))}

            {showPendingFirstBeat ? (
              <ConversationTypingBubble
                agentAvatarUrl={agentAvatarUrl}
                agentName={agentName}
                agentRoleLabel={t('ChatBubble.agentPending')}
                thinkingLabel={t('Header.presenceThinking')}
              />
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
});
