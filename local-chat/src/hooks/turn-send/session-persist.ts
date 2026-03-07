import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage, ChatMessageKind } from '../../types.js';
import {
  appendSegmentToLocalChatBundle,
  appendTurnsToSession,
  createLocalChatTurnBundle,
  listLocalChatSessions,
  type LocalChatPromptTrace,
  type LocalChatSession,
  type LocalChatTurnAudit,
} from '../../state/index.js';
import { createSessionTurn } from '../../services/view/messages.js';
import type { LocalChatScheduleCancelReason } from './types.js';

const MAX_SEGMENT_DELAY_MS = 8_000;

type PersistedAssistantMessageKind = Exclude<ChatMessageKind, 'streaming' | 'image-pending' | 'video-pending'>;

export type TurnDeliveryScheduleHandle = {
  turnTxnId: string;
  assistantBundleId: string;
  done: Promise<void>;
  cancel: (reason: LocalChatScheduleCancelReason) => void;
};

function normalizeSegmentDelayMs(value: number, index: number): number {
  if (index === 0) return 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_SEGMENT_DELAY_MS, Math.round(value));
}

function waitForDelivery(ms: number, signal: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('LOCAL_CHAT_SCHEDULE_ABORTED'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function refreshSessions(input: {
  targetId: string;
  viewerId: string;
  setSessions: (sessions: LocalChatSession[]) => void;
}): Promise<void> {
  input.setSessions(await listLocalChatSessions(input.targetId, input.viewerId));
}

function buildSegmentContextText(message: ChatMessage): string {
  if (message.kind === 'image' || message.kind === 'video') {
    const shadowText = String(message.meta?.mediaShadow?.shadowText || '').trim();
    const mediaPrompt = String(message.meta?.mediaPrompt || '').trim();
    const status = String(message.meta?.mediaStatus || '').trim();
    const statusLabel = status ? `${status} ` : '';
    if (shadowText) {
      return shadowText;
    }
    if (mediaPrompt) {
      return `${statusLabel}${message.kind}: ${mediaPrompt}`.trim();
    }
    if (message.content.trim()) {
      return `${statusLabel}${message.kind}: ${message.content}`.trim();
    }
    return `${statusLabel}${message.kind}`.trim();
  }
  return String(message.content || '');
}

function buildSegmentSemanticSummary(message: ChatMessage): string | null {
  if (message.kind !== 'image' && message.kind !== 'video') {
    return null;
  }
  const shadowText = String(message.meta?.mediaShadow?.shadowText || '').trim();
  if (shadowText) return shadowText;
  const mediaPrompt = String(message.meta?.mediaPrompt || '').trim();
  if (mediaPrompt) return mediaPrompt;
  const content = String(message.content || '').trim();
  return content || null;
}

function toPersistedKind(kind: ChatMessageKind): PersistedAssistantMessageKind {
  return kind === 'voice' || kind === 'image' || kind === 'video' ? kind : 'text';
}

export async function persistSuccessfulTurn(input: {
  sessionId: string;
  targetId: string;
  viewerId: string;
  turnTxnId: string;
  userMessage: ChatMessage;
  assistantDeliveries: Array<{
    id: string;
    kind: PersistedAssistantMessageKind;
    content: string;
    media?: ChatMessage['media'];
    delayMs: number;
    meta: ChatMessage['meta'];
  }>;
  latencyMs: number;
  promptTrace: LocalChatPromptTrace;
  turnAudit: LocalChatTurnAudit;
  replaceFirstMessageId?: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  onScheduleCancelled?: (input: {
    turnTxnId: string;
    reason: LocalChatScheduleCancelReason;
    deliveredCount: number;
    pendingCount: number;
  }) => void;
}): Promise<TurnDeliveryScheduleHandle> {
  await appendTurnsToSession(input.sessionId, [createSessionTurn({ message: input.userMessage })]);
  await refreshSessions({
    targetId: input.targetId,
    viewerId: input.viewerId,
    setSessions: input.setSessions,
  });

  const assistantBundle = await createLocalChatTurnBundle({
    conversationId: input.sessionId,
    role: 'assistant',
    turnTxnId: input.turnTxnId,
  });

  const abortController = new AbortController();
  let cancelReason: LocalChatScheduleCancelReason | null = null;
  let deliveredCount = 0;

  const cancel = (reason: LocalChatScheduleCancelReason) => {
    if (cancelReason) return;
    cancelReason = reason;
    abortController.abort();
  };

  const done = (async () => {
    for (let index = 0; index < input.assistantDeliveries.length; index += 1) {
      if (cancelReason) break;
      const delivery = input.assistantDeliveries[index];
      if (!delivery) continue;
      const delayMs = normalizeSegmentDelayMs(delivery.delayMs, index);
      try {
        await waitForDelivery(delayMs, abortController.signal);
      } catch {
        break;
      }
      if (cancelReason) break;
      const message: ChatMessage = {
        id: delivery.id,
        role: 'assistant',
        kind: delivery.kind,
        content: delivery.content,
        media: delivery.media,
        timestamp: new Date(),
        latencyMs: index === 0 ? input.latencyMs : undefined,
        meta: {
          ...(delivery.meta || {}),
          scheduledDelayMs: delayMs,
        },
      };
      input.setMessages((prev) => {
        if (index === 0 && input.replaceFirstMessageId) {
          let replaced = false;
          const next = prev.map((item) => {
            if (item.id === input.replaceFirstMessageId) {
              replaced = true;
              return message;
            }
            return item;
          });
          return replaced ? next : [...prev, message];
        }
        return [...prev, message];
      });
      await appendSegmentToLocalChatBundle({
        conversationId: input.sessionId,
        bundleId: assistantBundle.id,
        role: 'assistant',
        kind: delivery.kind,
        content: message.content,
        contextText: buildSegmentContextText(message),
        semanticSummary: buildSegmentSemanticSummary(message),
        mediaSpec: message.meta?.mediaSpec,
        mediaShadow: message.meta?.mediaShadow,
        media: message.media,
        timestamp: message.timestamp.toISOString(),
        latencyMs: message.latencyMs,
        meta: message.meta,
        promptTrace: index === 0 ? input.promptTrace : null,
        audit: index === 0 ? input.turnAudit : null,
        deliveryStatus: 'ready',
        segmentId: message.id,
      });
      await refreshSessions({
        targetId: input.targetId,
        viewerId: input.viewerId,
        setSessions: input.setSessions,
      });
      deliveredCount += 1;
    }

    if (!cancelReason || !input.onScheduleCancelled) return;
    input.onScheduleCancelled({
      turnTxnId: input.turnTxnId,
      reason: cancelReason,
      deliveredCount,
      pendingCount: Math.max(0, input.assistantDeliveries.length - deliveredCount),
    });
  })();

  return {
    turnTxnId: input.turnTxnId,
    assistantBundleId: assistantBundle.id,
    done,
    cancel,
  };
}

export async function persistFailedTurn(input: {
  sessionId: string;
  targetId: string;
  viewerId: string;
  userMessage: ChatMessage;
  errorMessage: ChatMessage;
  turnAudit: LocalChatTurnAudit;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
}) {
  input.setMessages((prev) => [...prev, input.errorMessage]);
  await appendTurnsToSession(input.sessionId, [
    createSessionTurn({ message: input.userMessage }),
    createSessionTurn({ message: input.errorMessage, audit: input.turnAudit }),
  ]);
  await refreshSessions({
    targetId: input.targetId,
    viewerId: input.viewerId,
    setSessions: input.setSessions,
  });
}

export async function commitAssistantMessage(input: {
  sessionId: string;
  targetId: string;
  viewerId: string;
  assistantBundleId: string;
  messageId: string;
  message: ChatMessage;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  promptTrace?: LocalChatPromptTrace | null;
  turnAudit?: LocalChatTurnAudit | null;
}) {
  const kind = input.message.kind;
  if (kind === 'streaming' || kind === 'image-pending' || kind === 'video-pending') {
    return;
  }
  input.setMessages((prev) => {
    let replaced = false;
    const next = prev.map((item) => {
      if (item.id !== input.messageId) {
        return item;
      }
      replaced = true;
      return input.message;
    });
    return replaced ? next : [...prev, input.message];
  });
  await appendSegmentToLocalChatBundle({
    conversationId: input.sessionId,
    bundleId: input.assistantBundleId,
    role: 'assistant',
    kind: toPersistedKind(input.message.kind),
    content: input.message.content,
    contextText: buildSegmentContextText(input.message),
    semanticSummary: buildSegmentSemanticSummary(input.message),
    mediaSpec: input.message.meta?.mediaSpec,
    mediaShadow: input.message.meta?.mediaShadow,
    media: input.message.media,
    timestamp: input.message.timestamp.toISOString(),
    latencyMs: input.message.latencyMs,
    meta: input.message.meta,
    promptTrace: input.promptTrace || null,
    audit: input.turnAudit || null,
    deliveryStatus: input.message.meta?.mediaStatus === 'failed'
      ? 'failed'
      : input.message.meta?.mediaStatus === 'blocked'
        ? 'blocked'
        : 'ready',
    segmentId: input.message.id,
  });
  await refreshSessions({
    targetId: input.targetId,
    viewerId: input.viewerId,
    setSessions: input.setSessions,
  });
}

export async function replacePendingAssistantMessage(input: {
  sessionId: string;
  targetId: string;
  viewerId: string;
  assistantBundleId: string;
  pendingMessageId: string;
  message: ChatMessage;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  promptTrace?: LocalChatPromptTrace | null;
  turnAudit?: LocalChatTurnAudit | null;
}) {
  return commitAssistantMessage({
    sessionId: input.sessionId,
    targetId: input.targetId,
    viewerId: input.viewerId,
    assistantBundleId: input.assistantBundleId,
    messageId: input.pendingMessageId,
    message: input.message,
    setMessages: input.setMessages,
    setSessions: input.setSessions,
    promptTrace: input.promptTrace,
    turnAudit: input.turnAudit,
  });
}
