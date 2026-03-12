import React, { useState, useRef, useCallback } from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
export function InterviewInput(props: {
    disabled: boolean;
    onSend: (message: string) => void;
}) {
    const { disabled, onSend } = props;
    const { t } = useModTranslation('mint-you');
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || disabled)
            return;
        onSend(trimmed);
        setText('');
        inputRef.current?.focus();
    }, [text, disabled, onSend]);
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);
    return (<div className="flex items-end gap-2 border-t border-gray-200 bg-white px-4 py-3">
      <div className="ui-sync-input-shell flex-1 p-2">
        <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} disabled={disabled} placeholder={t('Interview.inputPlaceholder')} className="max-h-24 min-h-[40px] w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-[#4ECCA3] focus:outline-none focus:ring-1 focus:ring-[#4ECCA3] disabled:bg-gray-50 disabled:text-gray-400" rows={1}/>
      </div>
      <button onClick={handleSend} disabled={disabled || !text.trim()} className="ui-sync-btn ui-sync-btn-primary rounded-xl bg-[#4ECCA3] px-4 py-2 text-sm font-medium text-white hover:bg-[#3DBB92] disabled:opacity-50">
        {t('Interview.send')}
      </button>
    </div>);
}
