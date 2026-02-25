import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createSessionForTarget,
} from '../services/view/sessions.js';
import { toChatMessagesFromSession } from '../services/view/messages.js';
import type { LocalChatTarget } from '../data/index.js';
import {
  deleteLocalChatSession,
  getLocalChatSession,
  getLocalChatSessionUpdatedEventName,
  listLocalChatSessions,
  type LocalChatPromptTrace,
  type LocalChatSession,
  type LocalChatTurnAudit,
} from '../state/index.js';
import type { ChatMessage } from '../types.js';

type UseLocalChatSessionsInput = {
  selectedTargetId: string;
  selectedTarget: LocalChatTarget | null;
  targets: LocalChatTarget[];
  allowProactiveContact: boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLatestPromptTrace: (trace: LocalChatPromptTrace | null) => void;
  setLatestTurnAudit: (audit: LocalChatTurnAudit | null) => void;
};

export function useLocalChatSessions(input: UseLocalChatSessionsInput) {
  const [sessions, setSessions] = useState<LocalChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const applySessionToView = useCallback((session: LocalChatSession | null) => {
    input.setMessages(toChatMessagesFromSession(session));
    const assistantTurns = (session?.turns || []).filter((turn) => turn.role === 'assistant');
    const latestAssistant = assistantTurns[assistantTurns.length - 1] || null;
    input.setLatestPromptTrace((latestAssistant?.promptTrace as LocalChatPromptTrace | undefined) || null);
    input.setLatestTurnAudit((latestAssistant?.audit as LocalChatTurnAudit | undefined) || null);
  }, [input.setLatestPromptTrace, input.setLatestTurnAudit, input.setMessages]);

  useEffect(() => {
    if (!input.selectedTargetId) {
      setSessions([]);
      setSelectedSessionId('');
      input.setMessages([]);
      return;
    }
    const target = input.targets.find((item) => item.id === input.selectedTargetId) || null;
    const found = listLocalChatSessions(input.selectedTargetId);
    if (found.length === 0) {
      const created = createSessionForTarget({
        targetId: input.selectedTargetId,
        target,
        allowProactiveContact: input.allowProactiveContact,
      });
      setSessions([created]);
      setSelectedSessionId(created.id);
      input.setMessages(toChatMessagesFromSession(created));
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      return;
    }
    setSessions(found);
    setSelectedSessionId((previous) => {
      if (previous && found.some((session) => session.id === previous)) {
        return previous;
      }
      return found[0]?.id || '';
    });
  }, [
    input.allowProactiveContact,
    input.selectedTargetId,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
    input.setMessages,
    input.targets,
  ]);

  useEffect(() => {
    if (!selectedSessionId) {
      input.setMessages([]);
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      return;
    }
    const session = getLocalChatSession(selectedSessionId);
    applySessionToView(session);
  }, [applySessionToView, input.setLatestPromptTrace, input.setLatestTurnAudit, input.setMessages, selectedSessionId]);

  useEffect(() => {
    if (!input.selectedTargetId) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const eventName = getLocalChatSessionUpdatedEventName();
    const onSessionUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ targetId?: string; sessionId?: string }>;
      const targetId = String(custom.detail?.targetId || '').trim();
      if (!targetId || targetId !== input.selectedTargetId) return;
      const nextSessions = listLocalChatSessions(input.selectedTargetId);
      setSessions(nextSessions);
      const selectedStillExists = Boolean(
        selectedSessionId && nextSessions.some((session) => session.id === selectedSessionId),
      );
      const nextSelectedSessionId = selectedStillExists
        ? selectedSessionId
        : (nextSessions[0]?.id || '');
      if (nextSelectedSessionId !== selectedSessionId) {
        setSelectedSessionId(nextSelectedSessionId);
      }
      applySessionToView(nextSelectedSessionId ? getLocalChatSession(nextSelectedSessionId) : null);
    };
    window.addEventListener(eventName, onSessionUpdated);
    return () => {
      window.removeEventListener(eventName, onSessionUpdated);
    };
  }, [applySessionToView, input.selectedTargetId, selectedSessionId]);

  const handleCreateSession = useCallback(() => {
    if (!input.selectedTargetId) return;
    const target = input.selectedTarget
      || input.targets.find((item) => item.id === input.selectedTargetId)
      || null;
    const created = createSessionForTarget({
      targetId: input.selectedTargetId,
      target,
      allowProactiveContact: input.allowProactiveContact,
    });
    const nextSessions = listLocalChatSessions(input.selectedTargetId);
    setSessions(nextSessions);
    setSelectedSessionId(created.id);
    input.setMessages(toChatMessagesFromSession(created));
    input.setLatestPromptTrace(null);
    input.setLatestTurnAudit(null);
  }, [
    input.allowProactiveContact,
    input.selectedTarget,
    input.selectedTargetId,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
    input.setMessages,
    input.targets,
  ]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (!input.selectedTargetId) return;
    deleteLocalChatSession(sessionId);
    const nextSessions = listLocalChatSessions(input.selectedTargetId);
    if (nextSessions.length === 0) {
      const target = input.selectedTarget
        || input.targets.find((item) => item.id === input.selectedTargetId)
        || null;
      const created = createSessionForTarget({
        targetId: input.selectedTargetId,
        target,
        allowProactiveContact: input.allowProactiveContact,
      });
      setSessions([created]);
      setSelectedSessionId(created.id);
      input.setMessages(toChatMessagesFromSession(created));
      input.setLatestPromptTrace(null);
      input.setLatestTurnAudit(null);
      return;
    }
    setSessions(nextSessions);
    if (sessionId === selectedSessionId) {
      setSelectedSessionId(nextSessions[0]?.id || '');
    }
  }, [
    input.allowProactiveContact,
    input.selectedTarget,
    input.selectedTargetId,
    input.setLatestPromptTrace,
    input.setLatestTurnAudit,
    input.setMessages,
    input.targets,
    selectedSessionId,
  ]);

  return {
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    handleCreateSession,
    handleDeleteSession,
  };
}
