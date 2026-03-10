import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runLocalChatTurnSend } from './turn-send/send-flow.js';
import type { TurnDeliveryScheduleHandle } from './turn-send/session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './turn-send/types.js';
import type { LocalChatTurnSendPhase } from '../state/index.js';
import {
  buildLocalChatTurnContextKey,
  type LocalChatTurnContextSnapshot,
} from './turn-send/context-key.js';

export function buildTurnSendContextKey(
  input: UseLocalChatTurnSendInput,
  activeSchedule?: LocalChatTurnContextSnapshot | null,
): string {
  return buildLocalChatTurnContextKey({
    targetId: input.selectedTarget?.id,
    sessionId: input.selectedSessionId,
    routeBinding: input.routeBinding || null,
    activeSchedule: activeSchedule || null,
  });
}

export function useLocalChatTurnSend(input: UseLocalChatTurnSendInput) {
  const [sendPhase, setSendPhaseState] = useState<LocalChatTurnSendPhase>('idle');
  const activeScheduleRef = useRef<TurnDeliveryScheduleHandle | null>(null);
  const activeScheduleContextRef = useRef<LocalChatTurnContextSnapshot | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunPromiseRef = useRef<Promise<void> | null>(null);
  const activeRunTokenRef = useRef<symbol | null>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  });

  const contextKey = useMemo(() => buildTurnSendContextKey(input), [
    input.selectedTarget?.id,
    input.selectedSessionId,
  ]);

  const registerSchedule = useCallback((inputValue: {
    handle: TurnDeliveryScheduleHandle;
    context: LocalChatTurnContextSnapshot;
  }) => {
    activeScheduleRef.current = inputValue.handle;
    activeScheduleContextRef.current = inputValue.context;
  }, []);

  const clearScheduleByTxn = useCallback((turnTxnId: string) => {
    const active = activeScheduleRef.current;
    if (!active || active.turnTxnId !== turnTxnId) return;
    activeScheduleRef.current = null;
    activeScheduleContextRef.current = null;
  }, []);

  const cancelPendingSchedule = useCallback((reason: LocalChatScheduleCancelReason) => {
    const active = activeScheduleRef.current;
    if (!active) return;
    console.warn(`[turn-send] CANCELLING schedule: reason=${reason}, turnTxnId=${active.turnTxnId}`);
    console.trace('[turn-send] cancel stack trace');
    active.cancel(reason);
    activeScheduleRef.current = null;
    activeScheduleContextRef.current = null;
  }, []);

  const cancelActiveTurn = useCallback((reason: LocalChatScheduleCancelReason) => {
    cancelPendingSchedule(reason);
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    const activeToken = activeRunTokenRef.current;
    if (activeToken) {
      setSendPhaseState('idle');
    }
  }, [cancelPendingSchedule]);

  const getCurrentContextKey = useCallback(() => {
    return buildTurnSendContextKey(inputRef.current, activeScheduleContextRef.current);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    cancelActiveTurn('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_UNMOUNT');
  }, []);

  const handleSend = useCallback(async () => {
    if (inputRef.current.isTranscribing) {
      return;
    }
    cancelActiveTurn('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_NEW_USER_TURN');
    const previousRun = activeRunPromiseRef.current;
    if (previousRun) {
      try {
        await previousRun;
      } catch {
        // Cancellation should not block the next send attempt.
      }
    }
    const runToken = Symbol('local-chat-turn-send');
    const abortController = new AbortController();
    activeRunTokenRef.current = runToken;
    activeAbortControllerRef.current = abortController;
    const guardedSetSendPhase = (next: LocalChatTurnSendPhase) => {
      if (activeRunTokenRef.current !== runToken) {
        return;
      }
      setSendPhaseState(next);
    };
    let runPromise: Promise<void>;
    runPromise = runLocalChatTurnSend({
      context: inputRef.current,
      abortSignal: abortController.signal,
      setSendPhase: guardedSetSendPhase,
      getCurrentContextKey,
      registerSchedule,
      clearScheduleByTxn,
    }).finally(() => {
      if (activeRunTokenRef.current === runToken) {
        activeRunTokenRef.current = null;
        activeAbortControllerRef.current = null;
        setSendPhaseState('idle');
      }
      if (activeRunPromiseRef.current === runPromise) {
        activeRunPromiseRef.current = null;
      }
    });
    activeRunPromiseRef.current = runPromise;
    await runPromise;
  }, [cancelActiveTurn, clearScheduleByTxn, getCurrentContextKey, registerSchedule]);

  return {
    isSending: sendPhase !== 'idle',
    sendPhase,
    handleSend,
    cancelPendingSchedule: cancelActiveTurn,
    getActiveScheduleContext: () => activeScheduleContextRef.current,
    contextKey,
  };
}
