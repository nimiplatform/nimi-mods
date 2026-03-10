import type { ChatMessage } from '../../types.js';
import type { LocalChatTurnSendPhase } from '../../state/index.js';

export type PresenceStatusInput = {
  loadingTargetDetail: boolean;
  hasInputText: boolean;
  isSending: boolean;
  sendPhase: LocalChatTurnSendPhase;
  messages: ChatMessage[];
  playingVoiceMessageId: string | null;
  t: (key: string) => string;
};

export function resolvePresenceStatus(input: PresenceStatusInput): { label: string; busy: boolean } {
  if (input.loadingTargetDetail) {
    return { label: input.t('Header.presenceArriving'), busy: false };
  }
  if (input.playingVoiceMessageId) {
    return { label: input.t('Header.presenceSpeaking'), busy: true };
  }
  const lastAssistantMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === 'assistant') || null;
  if (lastAssistantMessage?.kind === 'image-pending') {
    return { label: input.t('Header.presencePainting'), busy: true };
  }
  if (lastAssistantMessage?.kind === 'video-pending') {
    return { label: input.t('Header.presenceFilming'), busy: true };
  }
  if (input.sendPhase === 'awaiting-first-beat' || input.sendPhase === 'streaming-first-beat') {
    return { label: input.t('Header.presenceThinking'), busy: true };
  }
  if (input.hasInputText) {
    return { label: input.t('Header.presenceListening'), busy: false };
  }
  return { label: input.t('Header.presenceIdle'), busy: false };
}
