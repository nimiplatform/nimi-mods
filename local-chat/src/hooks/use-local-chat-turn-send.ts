import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runLocalChatTurnSend } from './turn-send/send-flow.js';
import type { TurnDeliveryScheduleHandle } from './turn-send/session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './turn-send/types.js';

function buildTurnSendContextKey(input: UseLocalChatTurnSendInput): string {
  const targetId = String(input.selectedTarget?.id || '').trim();
  const sessionId = String(input.selectedSessionId || '').trim();
  const routeBindingSource = String(input.routeBinding?.source || '').trim();
  const routeBindingConnector = String(input.routeBinding?.connectorId || '').trim();
  const routeBindingModel = String(input.routeBinding?.model || '').trim();
  const routeSnapshotSource = String(input.routeSnapshot?.source || '').trim();
  const routeSnapshotModel = String(input.routeSnapshot?.model || '').trim();
  const imageRouteSource = String(input.defaultSettings.imageRouteSource || '').trim();
  const imageConnectorId = String(input.defaultSettings.imageConnectorId || '').trim();
  const imageModel = String(input.defaultSettings.imageModel || '').trim();
  const videoRouteSource = String(input.defaultSettings.videoRouteSource || '').trim();
  const videoConnectorId = String(input.defaultSettings.videoConnectorId || '').trim();
  const videoModel = String(input.defaultSettings.videoModel || '').trim();
  const mediaTriggerMode = String(input.defaultSettings.mediaTriggerMode || '').trim();
  const segmentationMode = String(input.defaultSettings.segmentationMode || '').trim();
  const allowNsfwMedia = input.defaultSettings.allowNsfwMedia ? '1' : '0';
  return [
    targetId,
    sessionId,
    routeBindingSource,
    routeBindingConnector,
    routeBindingModel,
    routeSnapshotSource,
    routeSnapshotModel,
    imageRouteSource,
    imageConnectorId,
    imageModel,
    videoRouteSource,
    videoConnectorId,
    videoModel,
    mediaTriggerMode,
    segmentationMode,
    allowNsfwMedia,
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
    input.defaultSettings.imageRouteSource,
    input.defaultSettings.imageConnectorId,
    input.defaultSettings.imageModel,
    input.defaultSettings.videoRouteSource,
    input.defaultSettings.videoConnectorId,
    input.defaultSettings.videoModel,
    input.defaultSettings.mediaTriggerMode,
    input.defaultSettings.segmentationMode,
    input.defaultSettings.allowNsfwMedia,
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
