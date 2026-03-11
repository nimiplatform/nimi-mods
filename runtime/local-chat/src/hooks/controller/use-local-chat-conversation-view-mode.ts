import { useCallback, useEffect, useMemo, useState } from 'react';

export type LocalChatConversationViewMode = 'stage' | 'chat';

const LOCAL_CHAT_VIEW_MODE_STORAGE_KEY = 'nimi.local-chat.view-mode.v1';

function buildStorageKey(viewerId: string, targetId: string): string {
  return `${LOCAL_CHAT_VIEW_MODE_STORAGE_KEY}:${viewerId}:${targetId}`;
}

function readStoredViewMode(viewerId: string, targetId: string): LocalChatConversationViewMode | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedViewerId || !normalizedTargetId) {
    return null;
  }
  try {
    const raw = String(window.localStorage.getItem(buildStorageKey(normalizedViewerId, normalizedTargetId)) || '').trim();
    return raw === 'chat' ? 'chat' : raw === 'stage' ? 'stage' : null;
  } catch {
    return null;
  }
}

function writeStoredViewMode(viewerId: string, targetId: string, mode: LocalChatConversationViewMode): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedViewerId || !normalizedTargetId) {
    return;
  }
  try {
    window.localStorage.setItem(buildStorageKey(normalizedViewerId, normalizedTargetId), mode);
  } catch {
    // Ignore persistence failures; mode still lives in memory.
  }
}

export function useLocalChatConversationViewMode(input: {
  viewerId: string;
  targetId: string;
}) {
  const viewerId = String(input.viewerId || '').trim();
  const targetId = String(input.targetId || '').trim();
  const storageKey = useMemo(
    () => (viewerId && targetId ? buildStorageKey(viewerId, targetId) : ''),
    [targetId, viewerId],
  );
  const [conversationViewMode, setConversationViewModeState] = useState<LocalChatConversationViewMode>('stage');

  useEffect(() => {
    if (!storageKey) {
      setConversationViewModeState('stage');
      return;
    }
    const stored = readStoredViewMode(viewerId, targetId);
    setConversationViewModeState(stored || 'stage');
  }, [storageKey, targetId, viewerId]);

  const setConversationViewMode = useCallback((mode: LocalChatConversationViewMode) => {
    setConversationViewModeState(mode);
    if (!storageKey) {
      return;
    }
    writeStoredViewMode(viewerId, targetId, mode);
  }, [storageKey, targetId, viewerId]);

  return {
    conversationViewMode,
    setConversationViewMode,
  };
}
