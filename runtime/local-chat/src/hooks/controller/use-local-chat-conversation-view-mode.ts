import { useCallback, useEffect, useMemo, useState } from 'react';
import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod';
import { LOCAL_CHAT_MOD_ID } from '../../contracts.js';

export type LocalChatConversationViewMode = 'stage' | 'chat';

const LOCAL_CHAT_VIEW_MODE_STORAGE_KEY = 'nimi.local-chat.view-mode.v1';
const conversationViewModeStore = createModKvStore({
  storage: createModStorageClient(LOCAL_CHAT_MOD_ID),
  namespace: 'local-chat.view-mode',
});

function buildStorageKey(viewerId: string, targetId: string): string {
  return `${LOCAL_CHAT_VIEW_MODE_STORAGE_KEY}:${viewerId}:${targetId}`;
}

async function readStoredViewMode(viewerId: string, targetId: string): Promise<LocalChatConversationViewMode | null> {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedViewerId || !normalizedTargetId) {
    return null;
  }
  try {
    const raw = String(await conversationViewModeStore.get(buildStorageKey(normalizedViewerId, normalizedTargetId)) || '').trim();
    return raw === 'chat' ? 'chat' : raw === 'stage' ? 'stage' : null;
  } catch {
    return null;
  }
}

async function writeStoredViewMode(viewerId: string, targetId: string, mode: LocalChatConversationViewMode): Promise<void> {
  const normalizedViewerId = String(viewerId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedViewerId || !normalizedTargetId) {
    return;
  }
  try {
    await conversationViewModeStore.set(buildStorageKey(normalizedViewerId, normalizedTargetId), mode);
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
    void readStoredViewMode(viewerId, targetId).then((stored) => {
      setConversationViewModeState(stored || 'stage');
    });
  }, [storageKey, targetId, viewerId]);

  const setConversationViewMode = useCallback((mode: LocalChatConversationViewMode) => {
    setConversationViewModeState(mode);
    if (!storageKey) {
      return;
    }
    void writeStoredViewMode(viewerId, targetId, mode);
  }, [storageKey, targetId, viewerId]);

  return {
    conversationViewMode,
    setConversationViewMode,
  };
}
