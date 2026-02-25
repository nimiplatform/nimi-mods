import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage } from '../../types.js';
import {
  appendTurnsToSession,
  listLocalChatSessions,
  type LocalChatPromptTrace,
  type LocalChatSession,
  type LocalChatTurnAudit,
} from '../../state/index.js';
import { createSessionTurn } from '../../services/view/messages.js';
import type { LocalChatScheduleCancelReason } from './types.js';

const MAX_SEGMENT_DELAY_MS = 8_000;

export type TurnDeliveryScheduleHandle = {
  turnTxnId: string;
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

export function persistSuccessfulTurn(input: {
  sessionId: string;
  targetId: string;
  turnTxnId: string;
  userMessage: ChatMessage;
  assistantDeliveries: Array<{
    id: string;
    kind: 'text' | 'voice';
    content: string;
    delayMs: number;
    meta: ChatMessage['meta'];
  }>;
  latencyMs: number;
  promptTrace: LocalChatPromptTrace;
  turnAudit: LocalChatTurnAudit;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  onScheduleCancelled?: (input: {
    turnTxnId: string;
    reason: LocalChatScheduleCancelReason;
    deliveredCount: number;
    pendingCount: number;
  }) => void;
}): TurnDeliveryScheduleHandle {
  appendTurnsToSession(input.sessionId, [createSessionTurn({ message: input.userMessage })]);
  input.setSessions(listLocalChatSessions(input.targetId));

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
        timestamp: new Date(),
        latencyMs: index === 0 ? input.latencyMs : undefined,
        meta: {
          ...(delivery.meta || {}),
          scheduledDelayMs: delayMs,
        },
      };
      input.setMessages((prev) => [...prev, message]);
      appendTurnsToSession(input.sessionId, [
        createSessionTurn({
          message,
          promptTrace: index === 0 ? input.promptTrace : null,
          audit: index === 0 ? input.turnAudit : null,
        }),
      ]);
      input.setSessions(listLocalChatSessions(input.targetId));
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
    done,
    cancel,
  };
}

export function persistFailedTurn(input: {
  sessionId: string;
  targetId: string;
  userMessage: ChatMessage;
  errorMessage: ChatMessage;
  turnAudit: LocalChatTurnAudit;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
}) {
  input.setMessages((prev) => [...prev, input.errorMessage]);
  appendTurnsToSession(input.sessionId, [
    createSessionTurn({ message: input.userMessage }),
    createSessionTurn({ message: input.errorMessage, audit: input.turnAudit }),
  ]);
  input.setSessions(listLocalChatSessions(input.targetId));
}
