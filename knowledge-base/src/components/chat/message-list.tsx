// ---------------------------------------------------------------------------
// Message list — scrollable turn list (redesigned spacing)
// ---------------------------------------------------------------------------

import React, { useEffect, useRef } from 'react';
import type { KBTurn } from '../../types.js';
import { MessageBubble } from './message-bubble.js';

type MessageListProps = {
  turns: KBTurn[];
  onCitationClick?: (chunkId: string) => void;
  isSending: boolean;
  streamingText: string;
};

export function MessageList(props: MessageListProps) {
  const { turns, onCitationClick, isSending, streamingText } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns.length, streamingText]);

  if (turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-400">Ask a question about your documents</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex flex-col gap-4">
        {turns.map((turn, idx) => {
          const isLastAssistant = idx === turns.length - 1 && turn.role === 'assistant';
          const isStreamingTurn = isLastAssistant && isSending;

          return (
            <MessageBubble
              key={turn.id}
              turn={turn}
              onCitationClick={onCitationClick}
              isStreaming={isStreamingTurn}
              streamingText={isStreamingTurn ? streamingText : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
