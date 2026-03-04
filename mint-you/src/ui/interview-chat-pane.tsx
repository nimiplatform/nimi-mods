import React, { useEffect, useRef, useState } from 'react';
import type { InterviewMessage, InterviewStatus } from '../types.js';

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="animate-bounce text-gray-400" style={{ animationDelay: '0ms' }}>.</span>
      <span className="animate-bounce text-gray-400" style={{ animationDelay: '150ms' }}>.</span>
      <span className="animate-bounce text-gray-400" style={{ animationDelay: '300ms' }}>.</span>
    </span>
  );
}

function TypewriterText(props: { text: string; onDone: () => void }) {
  const { text, onDone } = props;
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(interval);
        onDone();
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, 20);

    return () => clearInterval(interval);
  }, [text, onDone]);

  return <>{displayed}<span className="animate-pulse">|</span></>;
}

export function InterviewChatPane(props: {
  messages: InterviewMessage[];
  status: InterviewStatus;
  typingText: string | null;
  onTypingDone: () => void;
}) {
  const { messages, status, typingText, onTypingDone } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, status, typingText]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#4ECCA3] text-white'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {/* Typing animation for AI reply */}
      {status === 'typing' && typingText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-800">
            <TypewriterText text={typingText} onDone={onTypingDone} />
          </div>
        </div>
      )}

      {/* Thinking indicator */}
      {status === 'ai-thinking' && (
        <div className="flex justify-start">
          <div className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
            <TypingDots />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
