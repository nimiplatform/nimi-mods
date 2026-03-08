import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runLocalChatTurnSend } from './turn-send/send-flow.js';
import type { TurnDeliveryScheduleHandle } from './turn-send/session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './turn-send/types.js';

export function buildTurnSendContextKey(input: UseLocalChatTurnSendInput): string {
  const targetId = String(input.selectedTarget?.id || '').trim();
  const sessionId = String(input.selectedSessionId || '').trim();
  const routeBinding = input.routeBinding || null;
  const routeBindingSource = String(routeBinding?.source || '').trim();
  const routeBindingConnector = String(routeBinding?.connectorId || '').trim();
  const routeBindingModel = String(routeBinding?.model || '').trim();
  const routeSnapshotSource = String(input.routeSnapshot?.source || '').trim();
  const routeSnapshotModel = String(input.routeSnapshot?.model || '').trim();
  const deliveryStyle = String(input.defaultSettings.deliveryStyle || '').trim();
  const mediaAutonomy = String(input.defaultSettings.mediaAutonomy || '').trim();
  const voiceConversationMode = String(input.voiceConversationMode || input.defaultSettings.voiceConversationMode || '').trim();
  const relationshipBoundaryPreset = String(input.defaultSettings.relationshipBoundaryPreset || '').trim();
  const visualComfortLevel = String(input.defaultSettings.visualComfortLevel || '').trim();
  return [
    targetId,
    sessionId,
    routeBindingSource,
    routeBindingConnector,
    routeBindingModel,
    routeSnapshotSource,
    routeSnapshotModel,
    deliveryStyle,
    mediaAutonomy,
    voiceConversationMode,
    relationshipBoundaryPreset,
    visualComfortLevel,
  ].join('|');
}

export function useLocalChatTurnSend(input: UseLocalChatTurnSendInput) {
  const [isSending, setIsSending] = useState(false);
  const activeScheduleRef = useRef<TurnDeliveryScheduleHandle | null>(null);

  const contextKey = useMemo(() => buildTurnSendContextKey(input), [
    input.routeBinding?.connectorId,
    input.routeBinding?.model,
    input.routeBinding?.source,
    input.routeSnapshot?.model,
    input.routeSnapshot?.source,
    input.defaultSettings.deliveryStyle,
    input.defaultSettings.mediaAutonomy,
    input.defaultSettings.voiceConversationMode,
    input.defaultSettings.relationshipBoundaryPreset,
    input.defaultSettings.visualComfortLevel,
    input.voiceConversationMode,
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
