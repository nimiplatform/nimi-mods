import React from 'react';
import type { ChatMessage } from '../../types.js';
import type { LocalChatTurnSendPhase } from '../../state/index.js';
import type { LocalChatPresenceTheme } from './presence-theme.js';
import { StageDialogueCard } from './stage-dialogue-card.js';
import type { LocalChatTargetItem } from './types.js';

type StageConversationPanelProps = {
  selectedTarget: LocalChatTargetItem;
  selectedTargetAvatarUrl: string | null;
  theme: LocalChatPresenceTheme;
  widthClassName: string;
  anchorViewportRef?: React.RefObject<HTMLDivElement | null>;
  cardAnchorOffsetPx?: number | null;
  sendPhase: LocalChatTurnSendPhase;
  messages: ChatMessage[];
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  playingVoiceMessageId: string | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onOpenHistory: () => void;
};

const STAGE_SWITCH_DELTA_THRESHOLD = 120;
const STAGE_SWITCH_WINDOW_MS = 400;
const STAGE_CARD_VISUAL_ANCHOR_TOP = '44%';

export const StageConversationPanel = React.memo(function StageConversationPanel({
  selectedTarget,
  selectedTargetAvatarUrl,
  theme,
  widthClassName,
  anchorViewportRef,
  cardAnchorOffsetPx,
  sendPhase,
  messages,
  currentUserDisplayName,
  currentUserAvatarUrl,
  playingVoiceMessageId,
  voiceTranscriptVisibleById,
  onPlayVoiceMessage,
  onVoiceContextMenu,
  messagesEndRef,
  onOpenHistory,
}: StageConversationPanelProps) {
  const stageCardScrollRef = React.useRef<HTMLDivElement | null>(null);
  const upwardIntentRef = React.useRef({ distance: 0, lastAt: 0 });

  const handleWheelCapture = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const now = performance.now();
    const scrollRoot = stageCardScrollRef.current;
    const cardAtTop = !scrollRoot || scrollRoot.scrollTop <= 4;
    if (event.deltaY >= 0 || !cardAtTop) {
      upwardIntentRef.current = { distance: 0, lastAt: now };
      return;
    }
    const previous = upwardIntentRef.current;
    const nextDistance = now - previous.lastAt > STAGE_SWITCH_WINDOW_MS
      ? Math.abs(event.deltaY)
      : previous.distance + Math.abs(event.deltaY);
    upwardIntentRef.current = { distance: nextDistance, lastAt: now };
    if (nextDistance >= STAGE_SWITCH_DELTA_THRESHOLD) {
      upwardIntentRef.current = { distance: 0, lastAt: now };
      onOpenHistory();
    }
  }, [onOpenHistory]);

  return (
    <div
      ref={anchorViewportRef}
      className="relative min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-5"
      onWheelCapture={handleWheelCapture}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[58%]" style={{ background: theme.roomAura, opacity: 0.9 }} />

      <div className="relative z-10 h-full min-h-0">
        <div
          className={`absolute left-1/2 w-full -translate-x-1/2 -translate-y-1/2 ${widthClassName}`}
          style={{ top: cardAnchorOffsetPx === null || cardAnchorOffsetPx === undefined ? STAGE_CARD_VISUAL_ANCHOR_TOP : `${cardAnchorOffsetPx}px` }}
        >
          <StageDialogueCard
            agentAvatarUrl={selectedTargetAvatarUrl}
            agentName={selectedTarget.displayName}
            theme={theme}
            currentUserDisplayName={currentUserDisplayName}
            currentUserAvatarUrl={currentUserAvatarUrl}
            messages={messages}
            sendPhase={sendPhase}
            playingVoiceMessageId={playingVoiceMessageId}
            voiceTranscriptVisibleById={voiceTranscriptVisibleById}
            onPlayVoiceMessage={onPlayVoiceMessage}
            onVoiceContextMenu={onVoiceContextMenu}
            messagesEndRef={messagesEndRef}
            scrollRootRef={stageCardScrollRef}
          />
        </div>
      </div>
    </div>
  );
});
