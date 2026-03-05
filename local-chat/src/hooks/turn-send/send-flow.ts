import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { ChatMessage } from '../../types.js';
import { evaluateNsfwMediaPolicy } from '../../services/policy/nsfw-media-policy.js';
import { buildErrorTurnPayload } from './error-handler.js';
import { createUserMessage, ensureWorkingSession } from './session.js';
import { prepareLocalChatTurn } from './prompt.js';
import { buildAssistantTurnOutput } from './assistant-output.js';
import { persistFailedTurn, persistSuccessfulTurn, type TurnDeliveryScheduleHandle } from './session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './types.js';
import { logTurnScheduleCancelled, logTurnSendDone, logTurnSendFailed, logTurnSendStart } from './logging.js';

const LOCAL_CHAT_FALLBACK_TOAST_KEY = 'nimi.local-chat.fallback-toast-shown.v1';
const FALLBACK_TYPING_MIN_MS = 1_400;
const FALLBACK_TYPING_MAX_MS = 3_200;
const FALLBACK_TYPING_PER_CHAR_MS = 22;
const FALLBACK_TYPING_MAX_FRAMES = 36;

function createTurnTxnId(): string {
  return `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStreamingMessage(turnTxnId: string): ChatMessage {
  return {
    id: `stream-${turnTxnId}`,
    role: 'assistant',
    kind: 'streaming',
    content: '',
    timestamp: new Date(),
    meta: {
      streamId: turnTxnId,
      streamChunkCount: 0,
    },
  };
}

function delayMs(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function animateFallbackStreamingPreview(input: {
  streamingMessageId: string;
  text: string;
  turnTxnId: string;
  sendContextKey: string;
  getCurrentContextKey: () => string;
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}): Promise<void> {
  const chars = Array.from(String(input.text || ''));
  if (chars.length === 0) return;
  const estimatedTotalMs = Math.round(chars.length * FALLBACK_TYPING_PER_CHAR_MS);
  const totalMs = Math.max(
    FALLBACK_TYPING_MIN_MS,
    Math.min(FALLBACK_TYPING_MAX_MS, estimatedTotalMs),
  );
  const frameCount = Math.max(8, Math.min(FALLBACK_TYPING_MAX_FRAMES, Math.ceil(chars.length / 2)));
  const chunkSize = Math.max(1, Math.ceil(chars.length / frameCount));
  const stepMs = Math.max(22, Math.round(totalMs / frameCount));
  let emitted = 0;
  let chunkCount = 0;

  while (emitted < chars.length) {
    if (input.getCurrentContextKey() !== input.sendContextKey) {
      return;
    }
    emitted = Math.min(chars.length, emitted + chunkSize);
    chunkCount += 1;
    const nextText = chars.slice(0, emitted).join('');
    input.setMessages((prev) => prev.map((message) => {
      if (message.id !== input.streamingMessageId) {
        return message;
      }
      return {
        ...message,
        content: nextText,
        meta: {
          ...(message.meta || {}),
          streamId: input.turnTxnId,
          streamChunkCount: chunkCount,
        },
      };
    }));
    if (emitted < chars.length) {
      await delayMs(stepMs);
    }
  }
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
  const streamingMessage = createStreamingMessage(turnTxnId);
  context.setMessages((prev) => [...prev, userMessage, streamingMessage]);
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
      routeSnapshot: context.routeSnapshot,
      onStreamDelta: (delta, chunkCount) => {
        if (input.getCurrentContextKey() !== input.sendContextKey) {
          return;
        }
        context.setMessages((prev) => prev.map((message) => {
          if (message.id !== streamingMessage.id) {
            return message;
          }
          return {
            ...message,
            content: `${message.content}${delta}`,
            meta: {
              ...(message.meta || {}),
              streamId: turnTxnId,
              streamChunkCount: chunkCount,
            },
          };
        }));
      },
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
    const nsfwPolicy = evaluateNsfwMediaPolicy({
      allowNsfwMedia: context.defaultSettings.allowNsfwMedia,
      routeSource: prepared.routeSnapshot?.source || expectedSource,
    });
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
      streamDeltaCount: prepared.textTurn.streamDeltaCount,
      streamDurationMs: prepared.textTurn.streamDurationMs,
      segmentParseMode: prepared.textTurn.segmentParseMode,
      nsfwPolicy,
    });
    if (prepared.textTurn.streamDeltaCount === 0) {
      const fallbackPreviewText = String(prepared.textTurn.segments[0]?.content || '').trim();
      if (fallbackPreviewText) {
        await animateFallbackStreamingPreview({
          streamingMessageId: streamingMessage.id,
          text: fallbackPreviewText,
          turnTxnId,
          sendContextKey: input.sendContextKey,
          getCurrentContextKey: input.getCurrentContextKey,
          setMessages: context.setMessages,
        });
      }
    }
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
      context.setMessages((prev) => prev.filter((message) => message.id !== streamingMessage.id));
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
      replaceFirstMessageId: streamingMessage.id,
      setMessages: context.setMessages,
      setSessions: context.setSessions,
      onScheduleCancelled: (scheduleCancelled) => {
        if (scheduleCancelled.deliveredCount === 0) {
          context.setMessages((prev) => prev.filter((message) => message.id !== streamingMessage.id));
        }
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
      followupSent: assistantPayload.assistantOutput.followupSent,
      segmentCount: assistantPayload.assistantOutput.segmentCount,
      textSegments: assistantPayload.assistantOutput.textSegments,
      voiceSegments: assistantPayload.assistantOutput.voiceSegments,
      schedulerTotalDelayMs: assistantPayload.assistantOutput.schedulerTotalDelayMs,
      streamDeltaCount: prepared.textTurn.streamDeltaCount,
      streamDurationMs: prepared.textTurn.streamDurationMs,
      segmentParseMode: prepared.textTurn.segmentParseMode,
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const errorPayload = buildErrorTurnPayload({
      selectedTarget,
      error,
      latencyMs,
    });
    context.setMessages((prev) => prev.filter((message) => message.id !== streamingMessage.id));
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
