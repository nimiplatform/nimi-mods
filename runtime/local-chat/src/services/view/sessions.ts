import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatSession } from '../../state/index.js';
import { createLocalChatSession } from '../../state/index.js';

export async function createSessionForTarget(input: {
  targetId: string;
  viewerId: string;
  target: LocalChatTarget | null;
}): Promise<LocalChatSession> {
  return createLocalChatSession({
    targetId: input.targetId,
    viewerId: input.viewerId,
    worldId: input.target?.worldId || null,
    title: input.target?.displayName || 'Session',
  });
}
