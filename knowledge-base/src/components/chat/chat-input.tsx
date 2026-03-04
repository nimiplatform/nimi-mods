// ---------------------------------------------------------------------------
// Chat input — redesigned with scope indicator and styled send button
// ---------------------------------------------------------------------------

import React, { useCallback, useState } from 'react';

type ChatInputProps = {
  onSend: (query: string) => void;
  disabled: boolean;
  placeholder?: string;
};

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatInput(props: ChatInputProps) {
  const { onSend, disabled, placeholder } = props;
  const [value, setValue] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim() || disabled) return;
      onSend(value.trim());
      setValue('');
    }
  }, [value, disabled, onSend]);

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white px-5 py-3">
      <div className="flex items-end gap-3">
        <div className="flex min-h-[40px] flex-1 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-300">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Ask a question about your documents...'}
            disabled={disabled}
            rows={1}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-200 disabled:text-indigo-400"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}
