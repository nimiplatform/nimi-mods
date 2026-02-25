import type { LocalChatTarget } from '../../data/index.js';
import { createSessionForTarget } from '../../services/view/sessions.js';
import { getLocalChatSession, type LocalChatSession } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';

export function ensureWorkingSession(input: {
  selectedSessionId: string;
  selectedTarget: LocalChatTarget;
  setSelectedSessionId: (sessionId: string) => void;
}): LocalChatSession {
  let workingSession = input.selectedSessionId ? getLocalChatSession(input.selectedSessionId) : null;
  if (!workingSession || workingSession.targetId !== input.selectedTarget.id) {
    workingSession = createSessionForTarget({
      targetId: input.selectedTarget.id,
      target: input.selectedTarget,
      allowProactiveContact: false,
    });
    input.setSelectedSessionId(workingSession.id);
  }
  return workingSession;
}

export function createUserMessage(text: string): ChatMessage {
  return {
    id: `msg-${Date.now().toString(36)}-user`,
    role: 'user',
    kind: 'text',
    content: text,
    timestamp: new Date(),
  };
}
