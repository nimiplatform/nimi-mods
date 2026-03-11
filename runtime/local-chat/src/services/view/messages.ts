import type {
  LocalChatPromptTrace,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
} from '../../state/index.js';
import type { ChatMessage, ChatMessageMeta } from '../../types.js';

function normalizeTurnKind(value: unknown): ChatMessage['kind'] {
  return value === 'voice'
    || value === 'image'
    || value === 'video'
    || value === 'streaming'
    || value === 'text'
    ? value
    : 'text';
}

function normalizeTurnMedia(value: unknown): ChatMessage['media'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const media = value as Record<string, unknown>;
  const normalized: ChatMessage['media'] = {};
  const uri = String(media.uri || '').trim();
  if (uri) normalized.uri = uri;
  const mimeType = String(media.mimeType || '').trim();
  if (mimeType) normalized.mimeType = mimeType;
  const width = Number(media.width);
  if (Number.isFinite(width) && width > 0) normalized.width = Math.round(width);
  const height = Number(media.height);
  if (Number.isFinite(height) && height > 0) normalized.height = Math.round(height);
  const durationSeconds = Number(media.durationSeconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    normalized.durationSeconds = durationSeconds;
  }
  const previewUri = String(media.previewUri || '').trim();
  if (previewUri) normalized.previewUri = previewUri;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function toChatMessagesFromSession(session: LocalChatSession | null): ChatMessage[] {
  if (!session) return [];
  return (session.turns || [])
    .filter((turn) => turn && typeof turn === 'object')
    .map((turn) => ({
      id: String(turn.id || `msg-${Math.random().toString(36).slice(2, 8)}`),
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      kind: normalizeTurnKind(turn.kind),
      content: String(turn.content || ''),
      media: normalizeTurnMedia(turn.media),
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
  const kind = input.message.kind === 'voice'
    || input.message.kind === 'image'
    || input.message.kind === 'video'
    ? input.message.kind
    : 'text';
  const turnId = String(input.message.meta?.turnId || input.message.id);
  const beatIndex = Number.isFinite(input.message.meta?.beatIndex)
    ? Math.max(0, Number(input.message.meta?.beatIndex))
    : 0;
  const beatCount = Number.isFinite(input.message.meta?.beatCount) && Number(input.message.meta?.beatCount) > 0
    ? Math.floor(Number(input.message.meta?.beatCount))
    : 1;
  return {
    id: input.message.id,
    turnId,
    turnSeq: 0,
    beatIndex,
    beatCount,
    role: input.message.role,
    kind,
    content: input.message.content,
    contextText: input.message.content,
    semanticSummary: null,
    media: input.message.media,
    timestamp: input.message.timestamp.toISOString(),
    latencyMs: input.message.latencyMs,
    meta: input.message.meta,
    promptTrace: input.promptTrace || undefined,
    audit: input.audit || undefined,
  };
}
