import { createRendererFlowId } from '@nimiplatform/sdk/mod/logging';
import type { ChatMessage, LocalChatBeatModality } from '../../types.js';
import { buildErrorTurnPayload } from './error-handler.js';
import { createUserMessage, ensureWorkingSession } from './session.js';
import { buildTurnRequestInput } from './request-builder.js';
import {
  commitAssistantMessage,
  persistFailedTurn,
  scheduleAssistantTurnDeliveries,
  type TurnDeliveryScheduleHandle,
} from './session-persist.js';
import type { LocalChatScheduleCancelReason, UseLocalChatTurnSendInput } from './types.js';
import { logTurnScheduleCancelled, logTurnSendDone, logTurnSendFailed, logTurnSendStart } from './logging.js';
import { decideMediaExecution } from './media-decision-policy.js';
import { executeMediaDecision } from './media-execution-pipeline.js';
import { isMediaRouteReady } from './media-route.js';
import { createPersistableVoicePlaybackCacheMeta } from '../../services/voice/playback-source.js';
import { deriveInteractionProfile } from './interaction-profile.js';
import { resolveTurnMode } from './turn-mode-resolver.js';
import { perceiveTurn } from './turn-perception.js';
import { composeInteractionTurnPlan } from './turn-composer.js';
import { orchestrateBeatModalities } from './modality-orchestrator.js';
import { compilePortableMemorySlots } from './portable-memory-compiler.js';
import { compileResolvedExperiencePolicy } from './resolved-experience-policy.js';
import { buildPromptTrace, buildTurnAudit } from './diagnostics.js';
import { derivePacingPlan } from './context-assembler.js';
import { buildLocalChatCompiledPrompt } from '../../data/index.js';
import {
  appendTurnsToSession,
  getLocalChatSession,
  listLocalChatMediaAssets,
  listLocalChatSessions,
  replaceLocalChatRecallIndex,
  replaceLocalChatRelationMemorySlots,
  upsertLocalChatInteractionSnapshot,
} from '../../state/index.js';
import { compileInteractionState } from './interaction-state-compiler.js';
import { createUlid } from '../../utils/ulid.js';
import { createSessionTurn } from '../../services/view/messages.js';
import type { MediaExecutionDecision } from './media-decision-types.js';
import {
  buildLocalChatTurnContextKey,
  buildLocalChatTurnContextSnapshot,
} from './context-key.js';

type OrchestratedBeat = ReturnType<typeof orchestrateBeatModalities>[number];
type ConcreteMediaDecision = Exclude<MediaExecutionDecision, { kind: 'none' }>;

type PreparedAssistantDelivery = {
  id: string;
  kind: LocalChatBeatModality;
  content: string;
  delayMs: number;
  meta: ChatMessage['meta'];
  beat: OrchestratedBeat;
};

function createTurnTxnId(): string {
  return `txn_${createUlid()}`;
}

function createTurnId(): string {
  return `turn_${createUlid()}`;
}

function waitForNextPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function createCancelledAudit(input: {
  reason: LocalChatScheduleCancelReason;
  targetId: string;
  worldId: string | null;
  latencyMs: number;
}) {
  return {
    id: `audit_${createUlid()}`,
    targetId: input.targetId,
    worldId: input.worldId,
    latencyMs: input.latencyMs,
    error: input.reason,
    createdAt: new Date().toISOString(),
  };
}

function normalizeBeatText(content: string): string {
  return String(content || '').replace(/\s+/g, ' ').trim();
}

function toMarkerOverrideIntent(input: {
  beat: OrchestratedBeat;
  turnTxnId: string;
}) {
  if ((input.beat.modality !== 'image' && input.beat.modality !== 'video') || !input.beat.assetRequest) {
    return null;
  }
  return {
    type: input.beat.assetRequest.kind,
    prompt: input.beat.assetRequest.prompt,
    source: 'tag' as const,
    plannerTrigger: 'marker-override' as const,
    pendingMessageId: input.beat.beatId,
    plannerConfidence: input.beat.assetRequest.confidence,
    plannerSuggestsNsfw: input.beat.assetRequest.nsfwIntent === 'suggested',
  };
}

function bindMediaDecisionToDelivery(
  decision: ConcreteMediaDecision,
  deliveryId: string,
): ConcreteMediaDecision {
  return {
    ...decision,
    intent: {
      ...decision.intent,
      pendingMessageId: deliveryId,
    },
    prepared: {
      ...decision.prepared,
      pendingMessageId: deliveryId,
    },
  };
}

function buildAssistantDeliveries(input: {
  beats: OrchestratedBeat[];
  planId: string;
  turnMode: ReturnType<typeof resolveTurnMode>;
  voiceConversationMode: NonNullable<UseLocalChatTurnSendInput['voiceConversationMode']>;
}): PreparedAssistantDelivery[] {
  return input.beats.map((beat, index) => ({
    id: beat.beatId,
    kind: beat.modality,
    content: normalizeBeatText(beat.text),
    delayMs: index === 0 ? 0 : beat.pauseMs,
    beat,
    meta: {
      interactionPlanId: input.planId,
      planId: input.planId,
      turnId: beat.turnId,
      beatId: beat.beatId,
      beatIndex: beat.beatIndex,
      beatCount: beat.beatCount,
      beatModality: beat.modality,
      pauseMs: beat.pauseMs,
      relationMove: beat.relationMove,
      sceneMove: beat.sceneMove,
      turnMode: input.turnMode,
      voiceConversationMode: input.voiceConversationMode,
      autoPlayVoice: beat.modality === 'voice' ? Boolean(beat.autoPlayVoice) : false,
      segmentId: beat.beatId,
      segmentIndex: beat.beatIndex + 1,
      segmentCount: beat.beatCount,
      ...(beat.modality === 'voice' || beat.modality === 'text'
        ? { channelDecision: beat.modality }
        : {}),
      intent: beat.intent,
      ...(beat.assetRequest ? {
        mediaType: beat.assetRequest.kind,
        mediaPrompt: beat.assetRequest.prompt,
        mediaPlannerTrigger: 'marker-override' as const,
        mediaPlannerConfidence: beat.assetRequest.confidence,
      } : {}),
    },
  })).filter((delivery) => Boolean(delivery.content) || delivery.kind === 'image' || delivery.kind === 'video');
}

async function persistInteractionState(input: {
  aiClient: UseLocalChatTurnSendInput['aiClient'];
  sessionId: string;
  targetId: string;
  viewerId: string;
  assistantTurnId: string;
  deliveredBeats: OrchestratedBeat[];
  routeBinding: UseLocalChatTurnSendInput['routeBinding'];
  conversationDirective?: string | null;
}): Promise<void> {
  const [session, mediaAssets] = await Promise.all([
    getLocalChatSession(input.sessionId, input.viewerId),
    listLocalChatMediaAssets({ conversationId: input.sessionId, turnId: input.assistantTurnId }),
  ]);
  const compiled = compileInteractionState({
    conversationId: input.sessionId,
    targetId: input.targetId,
    viewerId: input.viewerId,
    session,
    deliveredBeats: input.deliveredBeats,
    mediaAssets,
    conversationDirective: input.conversationDirective,
  });
  const portableMemorySlots = await compilePortableMemorySlots({
    aiClient: input.aiClient,
    relationMemorySlots: compiled.relationMemorySlots,
    interactionSnapshot: compiled.snapshot,
    routeBinding: input.routeBinding || undefined,
    recentSummaries: [
      ...input.deliveredBeats.map((beat) => normalizeBeatText(beat.text)),
      ...mediaAssets.map((asset) => normalizeBeatText(`${asset.kind} ${asset.model || ''} ${asset.renderUri || ''}`)),
    ].filter(Boolean),
  });
  await Promise.all([
    upsertLocalChatInteractionSnapshot(compiled.snapshot),
    replaceLocalChatRelationMemorySlots({
      targetId: input.targetId,
      viewerId: input.viewerId,
      entries: portableMemorySlots,
    }),
    replaceLocalChatRecallIndex({
      conversationId: input.sessionId,
      docs: compiled.recallDocs,
    }),
  ]);
}

export async function runLocalChatTurnSend(input: {
  context: UseLocalChatTurnSendInput;
  isSending: boolean;
  setIsSending: (next: boolean) => void;
  getCurrentContextKey: () => string;
  registerSchedule: (input: {
    handle: TurnDeliveryScheduleHandle;
    context: ReturnType<typeof buildLocalChatTurnContextSnapshot>;
  }) => void;
  clearScheduleByTxn: (turnTxnId: string) => void;
}) {
  const { context } = input;
  if (context.isTranscribing) return;
  const text = (context.inputTextRef ? context.inputTextRef.current : context.inputText).trim();
  if (!text || input.isSending) return;
  if (!context.selectedTarget) {
    context.setStatusBanner({
      kind: 'warn',
      message: 'No Agent friend available. Please add an Agent friend in Contacts first.',
    });
    return;
  }
  const selectedTarget = context.selectedTarget;
  const routeBinding = context.routeBinding || null;
  const userMessage: ChatMessage = createUserMessage(text);
  const turnTxnId = createTurnTxnId();
  const turnId = createTurnId();
  const voiceConversationMode = context.voiceConversationMode || context.defaultSettings.voiceConversationMode || 'off';
  const existingSessionId = String(context.selectedSessionId || '').trim();
  const canOptimisticallyReflectUserTurn = Boolean(existingSessionId);
  let sessionId = '';
  let sendContextKey = '';
  let hasWorkingSession = false;

  if (canOptimisticallyReflectUserTurn) {
    context.setMessages((prev) => [...prev, userMessage]);
    context.setInputText('');
    input.setIsSending(true);
    await waitForNextPaint();
  }

  const flowId = createRendererFlowId('local-chat-send-turn');
  const startedAt = performance.now();

  try {
    const workingSession = await ensureWorkingSession({
      selectedSessionId: context.selectedSessionId,
      viewerId: context.viewerId,
      selectedTarget,
      setSelectedSessionId: context.setSelectedSessionId,
    });
    sessionId = workingSession.id;
    hasWorkingSession = true;
    sendContextKey = buildLocalChatTurnContextKey({
      targetId: selectedTarget.id,
      sessionId,
      routeBinding,
    });
    if (!canOptimisticallyReflectUserTurn) {
      context.setMessages((prev) => [...prev, userMessage]);
      context.setInputText('');
      input.setIsSending(true);
      await waitForNextPaint();
    }
    logTurnSendStart({
      flowId,
      target: selectedTarget,
      sessionId,
      turnTxnId,
    });
    const interactionProfile = deriveInteractionProfile(selectedTarget);
    // Phase 1: build context with regex-based turnMode as initial estimate
    const regexTurnMode = resolveTurnMode({
      userText: text,
      interactionProfile,
    });
    const prepared = await buildTurnRequestInput({
      text,
      viewerId: context.viewerId,
      viewerDisplayName: context.viewerDisplayName,
      selectedTarget,
      selectedSessionId: sessionId,
      runtimeMode: context.runtimeMode,
      routeBinding,
      allowMultiReply: context.defaultSettings.deliveryStyle === 'natural',
      turnMode: regexTurnMode,
      voiceConversationMode,
    });
    // Phase 2: AI perception — classify turnMode + emotion + memory selection + directive
    const recentTurnsForPerception = prepared.contextPacket.recentTurns
      .slice(-5)
      .map((turn) => ({ role: turn.role, text: turn.lines.join(' ') }));
    const perception = await perceiveTurn({
      aiClient: context.aiClient,
      invokeInput: prepared.invokeInput,
      userText: text,
      snapshot: prepared.contextPacket.interactionSnapshot || null,
      memorySlots: prepared.contextPacket.relationMemorySlots || [],
      recentTurns: recentTurnsForPerception,
      regexFallbackTurnMode: regexTurnMode,
    });
    const turnMode = perception.turnMode;
    // Apply AI-selected memory slots: filter to only relevant ones
    if (perception.relevantMemoryIds.length > 0 && prepared.contextPacket.relationMemorySlots) {
      const relevantSet = new Set(perception.relevantMemoryIds);
      prepared.contextPacket.relationMemorySlots = prepared.contextPacket.relationMemorySlots
        .filter((slot) => relevantSet.has(slot.id));
    }
    // Store perception directive for later persistence
    const perceptionDirective = perception.conversationDirective;
    const activeDirective = perception.conversationDirective
      || prepared.contextPacket.interactionSnapshot?.conversationDirective
      || null;

    // Write perception results back into contextPacket (preserve full emotional detail)
    prepared.contextPacket.perceptionOverlay = {
      refinedTurnMode: turnMode,
      emotionalState: perception.emotionalState?.detected || '',
      emotionalCause: perception.emotionalState?.cause || '',
      suggestedApproach: perception.emotionalState?.suggestedApproach || '',
      directive: activeDirective || '',
      intimacyCeiling: perception.intimacyCeiling,
    };
    prepared.contextPacket.turnMode = turnMode;

    // Re-derive pacingPlan with refined turnMode + emotional hint
    // Respect user's delivery style setting for allowMultiReply
    const allowMultiReply = context.defaultSettings.deliveryStyle === 'natural';
    prepared.contextPacket.pacingPlan = derivePacingPlan({
      text,
      interactionProfile: prepared.contextPacket.target.interactionProfile,
      allowMultiReply,
      turnMode,
      emotionalHint: perception.emotionalState?.detected,
      suggestedApproach: perception.emotionalState?.suggestedApproach,
      momentum: prepared.contextPacket.interactionSnapshot?.conversationMomentum,
    });

    // Recompile prompt with updated contextPacket
    const recompiledResult = buildLocalChatCompiledPrompt({ contextPacket: prepared.contextPacket });
    prepared.invokeInput.prompt = recompiledResult.prompt;
    prepared.compiledPrompt = recompiledResult;
    const resolvedExperiencePolicy = compileResolvedExperiencePolicy({
      interactionProfile: prepared.contextPacket.target.interactionProfile,
      interactionSnapshot: prepared.contextPacket.interactionSnapshot || null,
      settings: context.defaultSettings,
      requestedVoiceConversationMode: voiceConversationMode,
      routeSource: prepared.invokeInput.routeBinding?.source || context.routeSnapshot?.source || 'local',
    });
    const effectiveVoiceConversationMode = resolvedExperiencePolicy.voicePolicy.conversationMode;
    // Extract recent companion beat texts for anti-repetition
    const recentBeatTexts = prepared.contextPacket.recentTurns
      .filter((turn) => turn.role === 'assistant')
      .slice(-3)
      .flatMap((turn) => turn.lines)
      .filter(Boolean);

    const plan = await composeInteractionTurnPlan({
      aiClient: context.aiClient,
      invokeInput: prepared.invokeInput,
      contextPacket: prepared.contextPacket,
      userText: text,
      turnId,
      turnMode,
      emotionalState: perception.emotionalState?.detected || '',
      directive: activeDirective || '',
      intimacyCeiling: perception.intimacyCeiling,
      recentBeatTexts,
    });
    const lockedPlan = {
      ...plan,
      beats: plan.beats.map((beat, index, list) => ({
        ...beat,
        beatIndex: index,
        beatCount: list.length,
      })),
    };
    const orchestratedBeats = orchestrateBeatModalities({
      beats: lockedPlan.beats,
      turnMode,
      interactionProfile: prepared.contextPacket.target.interactionProfile,
      snapshot: prepared.contextPacket.interactionSnapshot || null,
      policy: resolvedExperiencePolicy,
    });
    const deliveries = buildAssistantDeliveries({
      beats: orchestratedBeats,
      planId: lockedPlan.planId,
      turnMode,
      voiceConversationMode: effectiveVoiceConversationMode,
    });
    console.log('[send-flow] deliveries built:', {
      count: deliveries.length,
      kinds: deliveries.map((d) => d.kind),
      contents: deliveries.map((d) => d.content?.slice(0, 40)),
      delays: deliveries.map((d) => d.delayMs),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const nsfwPolicy = resolvedExperiencePolicy.mediaPolicy.nsfwPolicy;
    const mediaRouteReady = {
      image: isMediaRouteReady({
        kind: 'image',
        settings: context.defaultSettings,
        routeOptions: context.imageRouteOptions || null,
        routeOptionsRevision: context.imageRouteOptionsRevision,
      }),
      video: isMediaRouteReady({
        kind: 'video',
        settings: context.defaultSettings,
        routeOptions: context.videoRouteOptions || null,
        routeOptionsRevision: context.videoRouteOptionsRevision,
      }),
    };
    const firstMediaBeat = deliveries.find((delivery) => delivery.kind === 'image' || delivery.kind === 'video')?.beat || null;
    const firstMediaIntent = firstMediaBeat
      ? toMarkerOverrideIntent({
        beat: firstMediaBeat,
        turnTxnId,
      })
      : null;
    const promptTrace = buildPromptTrace({
      compiledPrompt: prepared.compiledPrompt,
      contextPacket: prepared.contextPacket,
      routeSnapshot: context.routeSnapshot,
      routeBinding,
      chatRouteOptions: context.chatRouteOptions,
      planner: 'stream',
      planSegments: deliveries.length,
      voiceSegments: deliveries.filter((delivery) => delivery.kind === 'voice').length,
      textSegments: deliveries.filter((delivery) => delivery.kind === 'text').length,
      schedulerTotalDelayMs: deliveries.reduce((sum, delivery) => sum + (Number(delivery.delayMs) || 0), 0),
      streamDeltaCount: 0,
      streamDurationMs: 0,
      segmentParseMode: 'single-message',
      nsfwPolicy,
      plannerUsed: firstMediaIntent !== null,
      plannerKind: firstMediaIntent?.type || 'none',
      plannerTrigger: firstMediaIntent ? 'marker-override' : 'none',
      plannerConfidence: firstMediaIntent?.plannerConfidence ?? null,
      plannerBlockedReason: null,
      imageReady: mediaRouteReady.image,
      videoReady: mediaRouteReady.video,
      imageDependencyStatus: mediaRouteReady.image ? 'ready' : 'unknown',
      videoDependencyStatus: mediaRouteReady.video ? 'ready' : 'unknown',
      mediaDecisionSource: firstMediaIntent ? 'planner' : 'none',
      mediaDecisionKind: firstMediaIntent?.type || 'none',
      mediaExecutionStatus: 'none',
      mediaExecutionRouteSource: null,
      mediaExecutionRouteModel: null,
      mediaExecutionReason: null,
    });
    promptTrace.turnMode = turnMode;
    promptTrace.interactionProfile = prepared.contextPacket.target.interactionProfile;
    promptTrace.voiceConversationMode = effectiveVoiceConversationMode;
    const turnAudit = buildTurnAudit({
      selectedTarget,
      latencyMs,
    });

    if (context.synthesizeVoice) {
      const voiceDeliveries = deliveries.filter((delivery) => delivery.kind === 'voice');
      if (voiceDeliveries.length > 0) {
        const synthResults = await Promise.allSettled(
          voiceDeliveries.map((delivery) =>
            context.synthesizeVoice!(delivery.content)
              .then((response) => ({
                id: delivery.id,
                playbackMeta: createPersistableVoicePlaybackCacheMeta(response),
              })),
          ),
        );
        for (const result of synthResults) {
          if (result.status !== 'fulfilled' || !result.value.playbackMeta) continue;
          const delivery = deliveries.find((item) => item.id === result.value.id);
          if (delivery) {
            delivery.meta = {
              ...(delivery.meta || {}),
              ...result.value.playbackMeta,
            };
          }
        }
      }
    }

    context.setLatestPromptTrace(promptTrace);
    context.setLatestTurnAudit(turnAudit);

    const assistantText = deliveries
      .map((delivery) => normalizeBeatText(delivery.content))
      .filter(Boolean)
      .join('\n\n');

    let latestPromptTrace = {
      ...promptTrace,
    };
    const firstMarkedBeat = turnMode === 'explicit-media'
      ? deliveries.find((item) => item.beat.assetRequest)?.beat || null
      : null;
    const rawMediaDecision = await decideMediaExecution({
      aiClient: context.aiClient,
      turnTxnId,
      routeBinding,
      defaultSettings: context.defaultSettings,
      resolvedPolicy: resolvedExperiencePolicy,
      userText: text,
      assistantText,
      target: selectedTarget,
      worldId: selectedTarget.worldId || null,
      messages: [...context.messages, userMessage],
      promptTrace: latestPromptTrace,
      nsfwPolicy,
      fallbackRouteSource: prepared.invokeInput.routeBinding?.source === 'cloud' ? 'cloud' : 'local',
      imageRouteOptions: context.imageRouteOptions || null,
      videoRouteOptions: context.videoRouteOptions || null,
      imageRouteOptionsRevision: context.imageRouteOptionsRevision,
      videoRouteOptionsRevision: context.videoRouteOptionsRevision,
      imageResolvedRoute: context.imageResolvedRoute || null,
      videoResolvedRoute: context.videoResolvedRoute || null,
      imageDependencySnapshot: context.imageDependencySnapshot || null,
      videoDependencySnapshot: context.videoDependencySnapshot || null,
      markerOverrideIntent: firstMarkedBeat
        ? toMarkerOverrideIntent({
          beat: firstMarkedBeat,
          turnTxnId,
        })
        : null,
    });
    latestPromptTrace = {
      ...latestPromptTrace,
      ...rawMediaDecision.promptTracePatch,
    };
    let mediaDecision: MediaExecutionDecision = rawMediaDecision;
    let mediaDeliveryId: string | null = null;
    if (rawMediaDecision.kind !== 'none') {
      const mediaDelivery = deliveries.find((item) => item.kind === 'image' || item.kind === 'video')
        || deliveries.find((item) => item.kind === 'text')
        || (rawMediaDecision.intent.source === 'explicit'
          ? deliveries.find((item) => item.kind === 'voice') || null
          : null)
        || null;
      if (mediaDelivery) {
        mediaDeliveryId = mediaDelivery.id;
        const boundMediaDecision = bindMediaDecisionToDelivery(rawMediaDecision, mediaDelivery.id);
        mediaDecision = boundMediaDecision;
        mediaDelivery.kind = boundMediaDecision.intent.type;
        mediaDelivery.meta = {
          ...(mediaDelivery.meta || {}),
          mediaType: boundMediaDecision.intent.type,
          mediaPrompt: boundMediaDecision.intent.prompt,
          mediaPlannerTrigger: boundMediaDecision.intent.plannerTrigger,
          mediaIntentSource: boundMediaDecision.intent.source,
        };
        mediaDelivery.beat = {
          ...mediaDelivery.beat,
          modality: boundMediaDecision.intent.type,
          intent: 'media',
          assetRequest: {
            kind: boundMediaDecision.intent.type,
            prompt: boundMediaDecision.intent.prompt,
            confidence: boundMediaDecision.intent.plannerConfidence ?? 0.65,
            nsfwIntent: boundMediaDecision.intent.plannerSuggestsNsfw ? 'suggested' : 'none',
          },
        };
        orchestratedBeats[mediaDelivery.beat.beatIndex] = mediaDelivery.beat;
      }
    }
    context.setLatestPromptTrace(latestPromptTrace);

    const schedule = await scheduleAssistantTurnDeliveries({
      sessionId,
      targetId: selectedTarget.id,
      viewerId: context.viewerId,
      turnTxnId,
      assistantTurnId: turnId,
      assistantBeatCount: deliveries.length,
      userTurns: [createSessionTurn({ message: userMessage })],
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        delayMs: delivery.delayMs,
        run: async ({ assistantTurnId, index }) => {
          console.log(`[delivery.run] beat ${index}, kind=${delivery.kind}, id=${delivery.id}, content=${delivery.content?.slice(0, 30)}`);
          if (delivery.kind === 'text' || delivery.kind === 'voice') {
            const message: ChatMessage = {
              id: delivery.id,
              role: 'assistant',
              kind: delivery.kind,
              content: delivery.content,
              timestamp: new Date(),
              latencyMs: index === 0 ? latencyMs : undefined,
              meta: {
                ...(delivery.meta || {}),
                scheduledDelayMs: delivery.delayMs,
              },
            };
            console.log(`[delivery.run] beat ${index}: committing text/voice message`);
            await commitAssistantMessage({
              sessionId,
              targetId: selectedTarget.id,
              viewerId: context.viewerId,
              assistantTurnId,
              messageId: message.id,
              message,
              setMessages: context.setMessages,
              setSessions: context.setSessions,
              promptTrace: index === 0 ? latestPromptTrace : null,
              turnAudit: index === 0 ? turnAudit : null,
            });
            console.log(`[delivery.run] beat ${index}: text/voice committed`);
            return;
          }
          const decision = mediaDeliveryId === delivery.id ? mediaDecision : null;
          console.log(`[delivery.run] beat ${index}: media path, hasDecision=${Boolean(decision)}, decisionKind=${decision?.kind || 'null'}, mediaDeliveryId=${mediaDeliveryId}, deliveryId=${delivery.id}`);
          if (!decision || decision.kind === 'none') {
            const fallbackMessage: ChatMessage = {
              id: delivery.id,
              role: 'assistant',
              kind: 'text',
              content: delivery.content,
              timestamp: new Date(),
              meta: {
                ...(delivery.meta || {}),
                scheduledDelayMs: delivery.delayMs,
              },
            };
            console.log(`[delivery.run] beat ${index}: no media decision, committing as text fallback`);
            await commitAssistantMessage({
              sessionId,
              targetId: selectedTarget.id,
              viewerId: context.viewerId,
              assistantTurnId,
              messageId: fallbackMessage.id,
              message: fallbackMessage,
              setMessages: context.setMessages,
              setSessions: context.setSessions,
              promptTrace: index === 0 ? latestPromptTrace : null,
              turnAudit: index === 0 ? turnAudit : null,
            });
            console.log(`[delivery.run] beat ${index}: text fallback committed`);
            return;
          }
          console.log(`[delivery.run] beat ${index}: executing media decision`);
          const executionTracePatch = await executeMediaDecision({
            decision,
            aiClient: context.aiClient,
            defaultSettings: context.defaultSettings,
            nsfwPolicy,
            fallbackRouteSource: prepared.invokeInput.routeBinding?.source === 'cloud' ? 'cloud' : 'local',
            sessionId,
            targetId: selectedTarget.id,
            viewerId: context.viewerId,
            assistantTurnId,
            setMessages: context.setMessages,
            setSessions: context.setSessions,
            promptTrace: index === 0 ? latestPromptTrace : null,
            turnAudit: index === 0 ? turnAudit : null,
            sendContextKey,
            getCurrentContextKey: input.getCurrentContextKey,
          });
          if (executionTracePatch) {
            latestPromptTrace = {
              ...latestPromptTrace,
              ...executionTracePatch,
            };
            context.setLatestPromptTrace(latestPromptTrace);
          }
        },
      })),
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
          planId: lockedPlan.planId,
          segmentCount: deliveries.length,
          textSegments: deliveries.filter((delivery) => delivery.kind === 'text').length,
          voiceSegments: deliveries.filter((delivery) => delivery.kind === 'voice').length,
          schedulerTotalDelayMs: deliveries.reduce((sum, delivery) => sum + delivery.delayMs, 0),
          cancelReason: scheduleCancelled.reason,
          deliveredCount: scheduleCancelled.deliveredCount,
          pendingCount: scheduleCancelled.pendingCount,
        });
      },
    });
    input.registerSchedule({
      handle: schedule,
      context: buildLocalChatTurnContextSnapshot({
        targetId: selectedTarget.id,
        sessionId,
        routeBinding,
      }),
    });
    void schedule.done
      .then(async () => {
        await persistInteractionState({
          sessionId,
          targetId: selectedTarget.id,
          viewerId: context.viewerId,
          assistantTurnId: schedule.assistantTurnId,
          deliveredBeats: orchestratedBeats,
          aiClient: context.aiClient,
          routeBinding,
          conversationDirective: perceptionDirective,
        });
      })
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
      planId: lockedPlan.planId,
      followupSent: deliveries.length > 1,
      segmentCount: deliveries.length,
      textSegments: deliveries.filter((delivery) => delivery.kind === 'text').length,
      voiceSegments: deliveries.filter((delivery) => delivery.kind === 'voice').length,
      schedulerTotalDelayMs: deliveries.reduce((sum, delivery) => sum + delivery.delayMs, 0),
      streamDeltaCount: 0,
      streamDurationMs: 0,
      segmentParseMode: 'single-message',
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
    if (hasWorkingSession) {
      await persistFailedTurn({
        sessionId,
        targetId: selectedTarget.id,
        viewerId: context.viewerId,
        userMessage,
        errorMessage: errorPayload.errorMessage,
        turnAudit: errorPayload.turnAudit,
        setMessages: context.setMessages,
        setSessions: context.setSessions,
      });
    } else {
      context.setMessages((prev) => [...prev, errorPayload.errorMessage]);
    }
    context.setStatusBanner({ kind: 'error', message: errorPayload.message });
    logTurnSendFailed(flowId, errorPayload.message);
  } finally {
    input.setIsSending(false);
  }
}
