import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { ChatMessage } from '../../types.js';
import { buildErrorTurnPayload } from './error-handler.js';
import { createUserMessage, ensureWorkingSession } from './session.js';
import { prepareLocalChatTurn } from './prompt.js';
import { buildAssistantTurnOutput } from './assistant-output.js';
import { persistFailedTurn, persistSuccessfulTurn, type TurnDeliveryScheduleHandle } from './session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './types.js';
import { logTurnScheduleCancelled, logTurnSendDone, logTurnSendFailed, logTurnSendStart } from './logging.js';

const LOCAL_CHAT_FALLBACK_TOAST_KEY = 'nimi.local-chat.fallback-toast-shown.v1';

function createTurnTxnId(): string {
  return `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shouldShowFallbackToastOnce(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    if (localStorage.getItem(LOCAL_CHAT_FALLBACK_TOAST_KEY) === '1') {
      return false;
    }
    localStorage.setItem(LOCAL_CHAT_FALLBACK_TOAST_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

function createCancelledAudit(input: {
  reason: LocalChatScheduleCancelReason;
  targetId: string;
  worldId: string | null;
  latencyMs: number;
}) {
  return {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    targetId: input.targetId,
    worldId: input.worldId,
    latencyMs: input.latencyMs,
    error: input.reason,
    createdAt: new Date().toISOString(),
  };
}

export async function runLocalChatTurnSend(input: {
  context: UseLocalChatTurnSendInput;
  isSending: boolean;
  setIsSending: (next: boolean) => void;
  sendContextKey: string;
  getCurrentContextKey: () => string;
  registerSchedule: (handle: TurnDeliveryScheduleHandle) => void;
  clearScheduleByTxn: (turnTxnId: string) => void;
}) {
  const { context } = input;
  if (context.isTranscribing) return;
  const text = context.inputText.trim();
  if (!text || input.isSending) return;
  if (!context.selectedTarget) {
    context.setStatusBanner({
      kind: 'warn',
      message: 'No Agent friend available. Please add an Agent friend in Contacts first.',
    });
    return;
  }
  const selectedTarget = context.selectedTarget;

  const workingSession = ensureWorkingSession({
    selectedSessionId: context.selectedSessionId,
    selectedTarget,
    setSelectedSessionId: context.setSelectedSessionId,
  });
  const sessionId = workingSession.id;
  const userMessage: ChatMessage = createUserMessage(text);
  const turnTxnId = createTurnTxnId();
  context.setMessages((prev) => [...prev, userMessage]);
  context.setInputText('');
  input.setIsSending(true);

  const flowId = createRendererFlowId('local-chat-send-turn');
  const startedAt = performance.now();
  logTurnSendStart({
    flowId,
    target: selectedTarget,
    sessionId,
    turnTxnId,
  });

  try {
    const prepared = await prepareLocalChatTurn({
      flowId,
      aiClient: context.aiClient,
      text,
      selectedTarget,
      messages: context.messages,
      runtimeMode: context.runtimeMode,
      routeOverride: context.routeOverride,
      allowMultiReply: context.defaultSettings.allowMultiReply,
      enableVoice: context.defaultSettings.enableVoice,
      routeSnapshot: context.routeSnapshot,
    });
    const expectedSource = context.routeOverride?.source
      || context.chatRouteOptions?.selected.source
      || 'local-runtime';
    const actualSource = prepared.routeSnapshot?.source || expectedSource;
    const fallbackToTokenApi = expectedSource === 'local-runtime' && actualSource === 'token-api';
    if (fallbackToTokenApi && shouldShowFallbackToastOnce()) {
      context.setStatusBanner({
        kind: 'info',
        message: 'This turn fell back to Token API. Open AI Runtime to install/start local models.',
        actionLabel: 'Open AI Runtime',
        onAction: () => {
          context.onOpenRuntimeSetup?.();
        },
      });
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    const assistantPayload = buildAssistantTurnOutput({
      plannedSegments: prepared.textTurn.segments,
      enableVoice: context.defaultSettings.enableVoice,
      autoPlayVoiceReplies: context.defaultSettings.autoPlayVoiceReplies,
      latencyMs,
      compiledPrompt: prepared.compiledPrompt,
      selectedTarget,
      routeSnapshot: prepared.routeSnapshot,
      routeOverride: prepared.routeOverride,
      chatRouteOptions: context.chatRouteOptions,
      planner: prepared.textTurn.planner,
      retryAttempted: prepared.textTurn.retryAttempted,
      retryImproved: prepared.textTurn.retryImproved,
    });
    assistantPayload.assistantOutput.deliveries
      .filter((delivery) => delivery.kind === 'voice')
      .forEach((delivery) => {
        logRendererEvent({
          level: 'info',
          area: 'local-chat',
          message: 'local-chat:voice-autoplay:decision',
          flowId,
          details: {
            targetId: selectedTarget.id,
            worldId: selectedTarget.worldId || null,
            turnTxnId,
            planId: assistantPayload.assistantOutput.planId,
            segmentId: delivery.meta?.segmentId || null,
            autoPlayEnabled: context.defaultSettings.autoPlayVoiceReplies,
            autoPlayVoice: Boolean(delivery.meta?.autoPlayVoice),
          },
        });
      });

    // Pre-synthesize voice deliveries — audioUri stored in delivery.meta before persist
    if (context.synthesizeVoice) {
      const voiceDeliveries = assistantPayload.assistantOutput.deliveries
        .filter((d) => d.kind === 'voice');
      if (voiceDeliveries.length > 0) {
        const synthResults = await Promise.allSettled(
          voiceDeliveries.map((d) =>
            context.synthesizeVoice!(d.content)
              .then((r) => ({ id: d.id, audioUri: String(r.audioUri || '').trim() })),
          ),
        );
        for (const result of synthResults) {
          if (result.status !== 'fulfilled' || !result.value.audioUri) continue;
          const delivery = assistantPayload.assistantOutput.deliveries
            .find((d) => d.id === result.value.id);
          if (delivery) {
            delivery.meta = { ...(delivery.meta || {}), audioUri: result.value.audioUri };
          }
        }
      }
    }

    const contextChanged = input.getCurrentContextKey() !== input.sendContextKey;
    if (contextChanged) {
      const userOnly = persistSuccessfulTurn({
        sessionId,
        targetId: selectedTarget.id,
        turnTxnId,
        userMessage,
        assistantDeliveries: [],
        latencyMs,
        promptTrace: assistantPayload.promptTrace,
        turnAudit: assistantPayload.turnAudit,
        setMessages: context.setMessages,
        setSessions: context.setSessions,
      });
      await userOnly.done;
      const cancelledReason: LocalChatScheduleCancelReason = 'LOCAL_CHAT_SCHEDULE_CANCELLED_BY_CONTEXT_CHANGE';
      context.setLatestPromptTrace(null);
      context.setLatestTurnAudit(createCancelledAudit({
        reason: cancelledReason,
        targetId: selectedTarget.id,
        worldId: selectedTarget.worldId || null,
        latencyMs,
      }));
      logTurnScheduleCancelled({
        flowId,
        target: selectedTarget,
        turnTxnId,
        planId: assistantPayload.assistantOutput.planId,
        segmentCount: assistantPayload.assistantOutput.segmentCount,
        textSegments: assistantPayload.assistantOutput.textSegments,
        voiceSegments: assistantPayload.assistantOutput.voiceSegments,
        schedulerTotalDelayMs: assistantPayload.assistantOutput.schedulerTotalDelayMs,
        cancelReason: cancelledReason,
        deliveredCount: 0,
        pendingCount: assistantPayload.assistantOutput.segmentCount,
      });
      return;
    }

    context.setLatestPromptTrace(assistantPayload.promptTrace);
    context.setLatestTurnAudit(assistantPayload.turnAudit);
    const schedule = persistSuccessfulTurn({
      sessionId,
      targetId: selectedTarget.id,
      turnTxnId,
      userMessage,
      assistantDeliveries: assistantPayload.assistantOutput.deliveries,
      latencyMs,
      promptTrace: assistantPayload.promptTrace,
      turnAudit: assistantPayload.turnAudit,
      setMessages: context.setMessages,
      setSessions: context.setSessions,
      onScheduleCancelled: (scheduleCancelled) => {
        const cancelledAudit = createCancelledAudit({
          reason: scheduleCancelled.reason,
          targetId: selectedTarget.id,
          worldId: selectedTarget.worldId || null,
          latencyMs,
        });
        context.setLatestTurnAudit(cancelledAudit);
        logTurnScheduleCancelled({
          flowId,
          target: selectedTarget,
          turnTxnId: scheduleCancelled.turnTxnId,
          planId: assistantPayload.assistantOutput.planId,
          segmentCount: assistantPayload.assistantOutput.segmentCount,
          textSegments: assistantPayload.assistantOutput.textSegments,
          voiceSegments: assistantPayload.assistantOutput.voiceSegments,
          schedulerTotalDelayMs: assistantPayload.assistantOutput.schedulerTotalDelayMs,
          cancelReason: scheduleCancelled.reason,
          deliveredCount: scheduleCancelled.deliveredCount,
          pendingCount: scheduleCancelled.pendingCount,
        });
      },
    });
    input.registerSchedule(schedule);
    void schedule.done
      .catch((scheduleError) => {
        context.setStatusBanner({
          kind: 'warn',
          message: scheduleError instanceof Error ? scheduleError.message : String(scheduleError || ''),
        });
      })
      .finally(() => {
        input.clearScheduleByTxn(turnTxnId);
      });

    logTurnSendDone({
      flowId,
      target: selectedTarget,
      latencyMs,
      turnTxnId,
      planId: assistantPayload.assistantOutput.planId,
      retryAttempted: prepared.textTurn.retryAttempted,
      retryImproved: prepared.textTurn.retryImproved,
      planner: prepared.textTurn.planner,
      followupSent: assistantPayload.assistantOutput.followupSent,
      segmentCount: assistantPayload.assistantOutput.segmentCount,
      textSegments: assistantPayload.assistantOutput.textSegments,
      voiceSegments: assistantPayload.assistantOutput.voiceSegments,
      schedulerTotalDelayMs: assistantPayload.assistantOutput.schedulerTotalDelayMs,
      firstReply: prepared.textTurn.firstReply,
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const errorPayload = buildErrorTurnPayload({
      selectedTarget,
      error,
      latencyMs,
    });
    context.setLatestPromptTrace(null);
    context.setLatestTurnAudit(errorPayload.turnAudit);
    persistFailedTurn({
      sessionId,
      targetId: selectedTarget.id,
      userMessage,
      errorMessage: errorPayload.errorMessage,
      turnAudit: errorPayload.turnAudit,
      setMessages: context.setMessages,
      setSessions: context.setSessions,
    });
    context.setStatusBanner({ kind: 'error', message: errorPayload.message });
    logTurnSendFailed(flowId, errorPayload.message);
  } finally {
    input.setIsSending(false);
  }
}
