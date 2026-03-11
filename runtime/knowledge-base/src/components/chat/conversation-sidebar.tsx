// ---------------------------------------------------------------------------
// Conversation sidebar — search, rename, delete confirmation support
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { KBConversation } from '../../types.js';
import { Button } from '../ui/button.js';

type ConversationSidebarProps = {
  conversations: KBConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, title: string) => void;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function ConversationItem(props: {
  conv: KBConversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename?: (title: string) => void;
}) {
  const { t } = useModTranslation('knowledge-base');
  const { conv, isActive, onSelect, onDelete, onRename } = props;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const turnCount = conv.turns.length;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRename) return;
    setEditValue(conv.title);
    setEditing(true);
  }, [conv.title, onRename]);

  const handleCommitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename?.(trimmed);
    }
    setEditing(false);
  }, [editValue, conv.title, onRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitRename();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }, [handleCommitRename]);

  return (
    <div
      className={`group flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors ${
        isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommitRename}
          onKeyDown={handleRenameKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="truncate rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-900 outline-none ring-1 ring-indigo-300"
        />
      ) : (
        <p
          className={`truncate text-xs font-medium ${
            isActive ? 'text-gray-900' : 'text-gray-700'
          }`}
          onDoubleClick={handleStartRename}
          title={t('chat.doubleClickRename')}
        >
          {conv.title}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">{formatDate(conv.updatedAt)}</span>
        <div className="flex items-center gap-1">
          {turnCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {turnCount}
            </span>
          )}
          {onRename && (
            <button
              type="button"
              onClick={handleStartRename}
              className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
              title={t('common.rename')}
            >
              <PencilIcon />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            title={t('common.delete')}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const { t } = useModTranslation('knowledge-base');
  const { conversations, activeId, onSelect, onCreate, onDelete, onRename } = props;
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex flex-col gap-2 p-4">
        <Button size="sm" className="w-full" onClick={onCreate}>
          <PlusIcon />
          {t('chat.newChat')}
        </Button>
        {conversations.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('chat.searchPlaceholder')}
              className="w-full bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <svg className="h-10 w-10 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="mt-2 text-xs text-gray-400">{t('chat.noConversations')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-gray-400">{t('chat.noMatches', { query: searchQuery })}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={activeId === conv.id}
                onSelect={() => onSelect(conv.id)}
                onDelete={() => onDelete(conv.id)}
                onRename={onRename ? (title) => onRename(conv.id, title) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
