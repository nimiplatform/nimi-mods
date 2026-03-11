import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatTurnSendPhase } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { ChatBubble } from '../chat-bubbles.js';
import { ConversationTypingBubble } from './conversation-typing-bubble.js';
import type { LocalChatPresenceTheme } from './presence-theme.js';

type StageDialogueCardProps = {
  agentAvatarUrl: string | null;
  agentName: string;
  theme: LocalChatPresenceTheme;
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const parsed = Number.parseInt(full, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STAGE_CARD_MINT_SOFT = '#d1fae5';
const STAGE_CARD_MINT = '#86efac';
const STAGE_CARD_MINT_STRONG = '#34d399';

function resolveStageDialogueBreathingDurationMs(sendPhase: LocalChatTurnSendPhase): number {
  if (sendPhase === 'streaming-first-beat') {
    return 3400;
  }
  if (sendPhase === 'delivering-tail') {
    return 3800;
  }
  if (sendPhase === 'awaiting-first-beat' || sendPhase === 'planning-tail') {
    return 4300;
  }
  return 5400;
}

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
  theme: _theme,
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
  const shellStyle = React.useMemo(() => ({
    '--lc-stage-card-breathe-duration': `${resolveStageDialogueBreathingDurationMs(sendPhase)}ms`,
    '--lc-stage-card-glow-soft': withAlpha(STAGE_CARD_MINT_SOFT, 0.96),
    '--lc-stage-card-glow-strong': withAlpha(STAGE_CARD_MINT_STRONG, 0.28),
    '--lc-stage-card-border-idle': withAlpha(STAGE_CARD_MINT, 0.36),
    '--lc-stage-card-border-peak': withAlpha(STAGE_CARD_MINT_STRONG, 0.44),
  }) as React.CSSProperties, [sendPhase]);

  return (
    <div
      className="lc-stage-dialogue-shell w-full rounded-[30px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.92))] p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      style={shellStyle}
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mint-700/70">
            {t('MessagePane.stageMomentLabel')}
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
        className="max-h-[44vh] overflow-y-auto overscroll-contain rounded-[24px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] px-4 py-4 backdrop-blur-sm"
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
                displayContext="stage"
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
                displayContext="stage"
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
