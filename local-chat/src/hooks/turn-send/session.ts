import type { LocalChatTarget } from '../../data/index.js';
import { createSessionForTarget } from '../../services/view/sessions.js';
import { getLocalChatSession, type LocalChatSession } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';

export async function ensureWorkingSession(input: {
  selectedSessionId: string;
  viewerId: string;
  selectedTarget: LocalChatTarget;
  setSelectedSessionId: (sessionId: string) => void;
}): Promise<LocalChatSession> {
  let workingSession = input.selectedSessionId
    ? await getLocalChatSession(input.selectedSessionId, input.viewerId)
    : null;
  if (!workingSession || workingSession.targetId !== input.selectedTarget.id) {
    workingSession = await createSessionForTarget({
      targetId: input.selectedTarget.id,
      viewerId: input.viewerId,
      target: input.selectedTarget,
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
