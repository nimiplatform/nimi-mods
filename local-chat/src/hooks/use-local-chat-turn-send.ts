import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runLocalChatTurnSend } from './turn-send/send-flow.js';
import type { TurnDeliveryScheduleHandle } from './turn-send/session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './turn-send/types.js';

function buildTurnSendContextKey(input: UseLocalChatTurnSendInput): string {
  const targetId = String(input.selectedTarget?.id || '').trim();
  const sessionId = String(input.selectedSessionId || '').trim();
  const routeOverrideSource = String(input.routeOverride?.source || '').trim();
  const routeOverrideConnector = String(input.routeOverride?.connectorId || '').trim();
  const routeOverrideModel = String(input.routeOverride?.model || '').trim();
  const routeSnapshotSource = String(input.routeSnapshot?.source || '').trim();
  const routeSnapshotModel = String(input.routeSnapshot?.model || '').trim();
  return [
    targetId,
    sessionId,
    routeOverrideSource,
    routeOverrideConnector,
    routeOverrideModel,
    routeSnapshotSource,
    routeSnapshotModel,
  ].join('|');
}

export function useLocalChatTurnSend(input: UseLocalChatTurnSendInput) {
  const [isSending, setIsSending] = useState(false);
  const activeScheduleRef = useRef<TurnDeliveryScheduleHandle | null>(null);

  const contextKey = useMemo(() => buildTurnSendContextKey(input), [
    input.routeOverride?.connectorId,
    input.routeOverride?.model,
    input.routeOverride?.source,
    input.routeSnapshot?.model,
    input.routeSnapshot?.source,
    input.selectedSessionId,
    input.selectedTarget?.id,
  ]);
  const contextKeyRef = useRef(contextKey);

  useEffect(() => {
    contextKeyRef.current = contextKey;
  }, [contextKey]);

  const registerSchedule = useCallback((handle: TurnDeliveryScheduleHandle) => {
    activeScheduleRef.current = handle;
  }, []);

  const clearScheduleByTxn = useCallback((turnTxnId: string) => {
    const active = activeScheduleRef.current;
    if (!active || active.turnTxnId !== turnTxnId) return;
    activeScheduleRef.current = null;
  }, []);

  const cancelPendingSchedule = useCallback((reason: LocalChatScheduleCancelReason) => {
    const active = activeScheduleRef.current;
    if (!active) return;
    active.cancel(reason);
    activeScheduleRef.current = null;
  }, []);

  useEffect(() => () => {
    cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_CONTEXT_CHANGE');
  }, [cancelPendingSchedule]);

  const handleSend = useCallback(async () => {
    if (input.isTranscribing) {
      return;
    }
    cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_NEW_USER_TURN');
    const sendContextKey = contextKeyRef.current;
    await runLocalChatTurnSend({
      context: input,
      isSending,
      setIsSending,
      sendContextKey,
      getCurrentContextKey: () => contextKeyRef.current,
      registerSchedule,
      clearScheduleByTxn,
    });
  }, [cancelPendingSchedule, clearScheduleByTxn, input, isSending, registerSchedule]);

  return {
    isSending,
    handleSend,
    cancelPendingSchedule,
    contextKey,
  };
}
