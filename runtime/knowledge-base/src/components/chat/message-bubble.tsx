// ---------------------------------------------------------------------------
// Message bubble — redesigned with rounded corners and shadow
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import type { KBTurn } from '../../types.js';
import { CitationInline } from './citation-inline.js';

type MessageBubbleProps = {
  turn: KBTurn;
  onCitationClick?: (chunkId: string) => void;
  isStreaming?: boolean;
  streamingText?: string;
};

function renderContentWithCitations(
  content: string,
  citations: KBTurn['citations'],
  onCitationClick?: (chunkId: string) => void,
): React.ReactNode[] {
  if (citations.length === 0) return [content];

  const parts: React.ReactNode[] = [];
  const pattern = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const refIndex = Number(match[1]);
    const citation = citations.find((c) => c.refIndex === refIndex);

    if (citation) {
      parts.push(
        <CitationInline
          key={`cit-${key++}`}
          refIndex={refIndex}
          onClick={() => onCitationClick?.(citation.chunkId)}
        />,
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export function MessageBubble(props: MessageBubbleProps) {
  const { turn, onCitationClick, isStreaming, streamingText } = props;
  const isUser = turn.role === 'user';

  const displayContent = isStreaming && streamingText !== undefined
    ? streamingText
    : turn.content;

  const renderedContent = useMemo(
    () => renderContentWithCitations(displayContent, turn.citations, onCitationClick),
    [displayContent, turn.citations, onCitationClick],
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? 'rounded-2xl rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-2xl rounded-bl-sm border border-gray-100 bg-white text-gray-800 shadow-sm'
        }`}
      >
        <div className="whitespace-pre-wrap">{renderedContent}</div>
        {isStreaming && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
        )}
      </div>
    </div>
  );
}
