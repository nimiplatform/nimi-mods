import type {
  LocalChatPromptTrace,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
} from '../../state/index.js';
import type { ChatMessage, ChatMessageMeta } from '../../types.js';

export function toChatMessagesFromSession(session: LocalChatSession | null): ChatMessage[] {
  if (!session) return [];
  return (session.turns || [])
    .filter((turn) => turn && typeof turn === 'object')
    .map((turn) => ({
      id: String(turn.id || `msg-${Math.random().toString(36).slice(2, 8)}`),
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      kind: turn.kind === 'voice' ? 'voice' : 'text',
      content: String(turn.content || ''),
      timestamp: new Date(String(turn.timestamp || new Date().toISOString())),
      latencyMs: typeof turn.latencyMs === 'number' ? turn.latencyMs : undefined,
      meta: turn.meta && typeof turn.meta === 'object'
        ? (turn.meta as ChatMessageMeta)
        : undefined,
    }));
}

export function createSessionTurn(input: {
  message: ChatMessage;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
}): LocalChatTurn {
  return {
    id: input.message.id,
    role: input.message.role,
    kind: input.message.kind,
    content: input.message.content,
    timestamp: input.message.timestamp.toISOString(),
    latencyMs: input.message.latencyMs,
    meta: input.message.meta,
    promptTrace: input.promptTrace || undefined,
    audit: input.audit || undefined,
  };
}
