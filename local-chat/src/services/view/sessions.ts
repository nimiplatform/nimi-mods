import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatSession, LocalChatTurn } from '../../state/index.js';
import {
  appendTurnsToSession,
  createLocalChatSession,
} from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { createSessionTurn } from './messages.js';

export function createProactiveGreetingTurn(target: LocalChatTarget | null): LocalChatTurn {
  const message: ChatMessage = {
    id: `msg-${Date.now().toString(36)}-proactive`,
    role: 'assistant',
    kind: 'text',
    content: `你好，我是${target?.displayName || '你的 Agent'}。如果你愿意，我们可以先从你现在最想推进的一件事开始。`,
    timestamp: new Date(),
  };
  return createSessionTurn({ message });
}

export async function createSessionForTarget(input: {
  targetId: string;
  viewerId: string;
  target: LocalChatTarget | null;
  allowProactiveContact: boolean;
}): Promise<LocalChatSession> {
  const createdRaw = await createLocalChatSession({
    targetId: input.targetId,
    viewerId: input.viewerId,
    worldId: input.target?.worldId || null,
    title: input.target?.displayName || 'Session',
  });
  if (!input.allowProactiveContact) {
    return createdRaw;
  }
  return (
    await appendTurnsToSession(
    createdRaw.id,
    [createProactiveGreetingTurn(input.target)],
    )
  ) || createdRaw;
}
