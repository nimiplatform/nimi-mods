import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runLocalChatTurnSend } from './turn-send/send-flow.js';
import type { TurnDeliveryScheduleHandle } from './turn-send/session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './turn-send/types.js';
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
  const [isSending, setIsSending] = useState(false);
  const activeScheduleRef = useRef<TurnDeliveryScheduleHandle | null>(null);
  const activeScheduleContextRef = useRef<LocalChatTurnContextSnapshot | null>(null);
  const inputRef = useRef(input);
  const isSendingRef = useRef(isSending);

  useEffect(() => {
    inputRef.current = input;
  });
  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

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

  const getCurrentContextKey = useCallback(() => {
    return buildTurnSendContextKey(inputRef.current, activeScheduleContextRef.current);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_UNMOUNT');
  }, []);

  const handleSend = useCallback(async () => {
    const currentInput = inputRef.current;
    if (currentInput.isTranscribing) {
      return;
    }
    cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_NEW_USER_TURN');
    await runLocalChatTurnSend({
      context: currentInput,
      isSending: isSendingRef.current,
      setIsSending,
      getCurrentContextKey,
      registerSchedule,
      clearScheduleByTxn,
    });
  }, [cancelPendingSchedule, clearScheduleByTxn, getCurrentContextKey, registerSchedule]);

  return {
    isSending,
    handleSend,
    cancelPendingSchedule,
    getActiveScheduleContext: () => activeScheduleContextRef.current,
    contextKey,
  };
}
