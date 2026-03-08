import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { createSessionForTarget } from '../services/view/sessions.js';
import { toChatMessagesFromSession } from '../services/view/messages.js';
import type { LocalChatTarget } from '../data/index.js';
import {
  clearLocalChatSessionHistory,
  getLatestLocalChatArtifacts,
  getLocalChatSession,
  getLocalChatSessionUpdatedEventName,
  listLocalChatSessions,
  type LocalChatPromptTrace,
  type LocalChatSession,
  type LocalChatTurnAudit,
} from '../state/index.js';
import type { ChatMessage } from '../types.js';

type UseLocalChatSessionsInput = {
  viewerId: string;
  selectedTargetId: string;
  selectedTarget: LocalChatTarget | null;
  targets: LocalChatTarget[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLatestPromptTrace: (trace: LocalChatPromptTrace | null) => void;
  setLatestTurnAudit: (audit: LocalChatTurnAudit | null) => void;
};

async function applySessionArtifacts(input: {
  session: LocalChatSession | null;
  viewerId: string;
  setLatestPromptTrace: (trace: LocalChatPromptTrace | null) => void;
  setLatestTurnAudit: (audit: LocalChatTurnAudit | null) => void;
}): Promise<void> {
  if (!input.session) {
    input.setLatestPromptTrace(null);
    input.setLatestTurnAudit(null);
    return;
  }
  const latestArtifacts = await getLatestLocalChatArtifacts(input.session.id, input.viewerId);
  input.setLatestPromptTrace(latestArtifacts.promptTrace);
  input.setLatestTurnAudit(latestArtifacts.audit);
}

export function useLocalChatSessions(input: UseLocalChatSessionsInput) {
  const [sessions, setSessions] = useState<LocalChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(false);

  const applySessionToView = useCallback(async (session: LocalChatSession | null) => {
    input.setMessages(toChatMessagesFromSession(session));
    await applySessionArtifacts({
      session,
      viewerId: input.viewerId,
      setLatestPromptTrace: input.setLatestPromptTrace,
      setLatestTurnAudit: input.setLatestTurnAudit,
    });
  }, [input.setLatestPromptTrace, input.setLatestTurnAudit, input.setMessages, input.viewerId]);

  useEffect(() => {
    let cancelled = false;
    if (!input.selectedTargetId) {
      setSessions([]);
      setSelectedSessionId('');
      setLoadingSessions(false);
      input.setMessages([]);
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setLoadingSessions(true);
      setSessions([]);
      setSelectedSessionId('');
      input.setMessages([]);
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      const target = input.targets.find((item) => item.id === input.selectedTargetId) || null;
      const found = await listLocalChatSessions(input.selectedTargetId, input.viewerId);
      if (cancelled) return;
      if (found.length === 0) {
        const created = await createSessionForTarget({
          targetId: input.selectedTargetId,
          viewerId: input.viewerId,
          target,
        });
        if (cancelled) return;
        setSessions([created]);
        setSelectedSessionId(created.id);
        return;
      }
      const [firstSession] = found;
      if (!firstSession) return;
      setSessions([firstSession]);
      setSelectedSessionId(firstSession.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    input.selectedTargetId,
    input.targets,
    input.viewerId,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
    input.setMessages,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSessionId) {
      input.setMessages([]);
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      if (!input.selectedTargetId) {
        setLoadingSessions(false);
      }
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      setLoadingSessions(true);
      const session = await getLocalChatSession(selectedSessionId, input.viewerId);
      if (cancelled) return;
      await applySessionToView(session);
      if (!cancelled) {
        setLoadingSessions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applySessionToView,
    input.selectedTargetId,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
    input.setMessages,
    input.viewerId,
    selectedSessionId,
  ]);

  useEffect(() => {
    if (!input.selectedTargetId) return undefined;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const eventName = getLocalChatSessionUpdatedEventName();
    const onSessionUpdated = (event: Event) => {
      void (async () => {
        const custom = event as CustomEvent<{ targetId?: string; sessionId?: string }>;
        const targetId = String(custom.detail?.targetId || '').trim();
        if (!targetId || targetId !== input.selectedTargetId) return;
        const session = selectedSessionId
          ? await getLocalChatSession(selectedSessionId, input.viewerId)
          : null;
        await applySessionToView(session);
      })();
    };
    window.addEventListener(eventName, onSessionUpdated);
    return () => {
      window.removeEventListener(eventName, onSessionUpdated);
    };
  }, [applySessionToView, input.selectedTargetId, input.viewerId, selectedSessionId]);

  const handleClearHistory = useCallback(() => {
    if (!selectedSessionId) return;
    void (async () => {
      await clearLocalChatSessionHistory(selectedSessionId);
      input.setMessages([]);
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
    })();
  }, [
    selectedSessionId,
    input.setMessages,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
  ]);

  return {
    loadingSessions,
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    handleClearHistory,
  };
}
