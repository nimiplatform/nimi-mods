import { createLocalChatFlowId } from '../logging.js';
import {
  getLocalChatSession,
  listAllLocalChatSessions,
  listLocalChatMediaAssets,
  loadLocalChatDefaultSettings,
  replaceLocalChatRecallIndex,
  replaceLocalChatRelationMemorySlots,
  upsertLocalChatInteractionSnapshot,
} from '../state/index.js';
import {
  listLocalChatTargets,
  resolveLocalChatTargetDetail,
} from '../data/index.js';
import { emitLocalChatProactiveAuditEvent } from './audit.js';
import {
  evaluateLocalChatProactivePolicy,
  recordLocalChatProactiveContact,
  resolveLocalChatWakeStrategy,
} from './policy.js';
import type {
  LocalChatProactiveAuditEvent,
  LocalChatProactiveHeartbeatInput,
} from './types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { buildTurnRequestInput } from '../hooks/turn-send/request-builder.js';
import { buildPromptTrace, buildTurnAudit } from '../hooks/turn-send/diagnostics.js';
import { composeInteractionTurnPlan } from '../hooks/turn-send/turn-composer.js';
import { orchestrateBeatModalities } from '../hooks/turn-send/modality-orchestrator.js';
import { decideMediaExecution } from '../hooks/turn-send/media-decision-policy.js';
import { executeMediaDecision } from '../hooks/turn-send/media-execution-pipeline.js';
import { isMediaRouteReady } from '../hooks/turn-send/media-route.js';
import { compileInteractionState } from '../hooks/turn-send/interaction-state-compiler.js';
import { compilePortableMemorySlots } from '../hooks/turn-send/portable-memory-compiler.js';
import { compileResolvedExperiencePolicy } from '../hooks/turn-send/resolved-experience-policy.js';
import { deriveInteractionProfile } from '../hooks/turn-send/interaction-profile.js';
import { resolveTurnMode } from '../hooks/turn-send/turn-mode-resolver.js';
import { toChatMessagesFromSession } from '../services/view/messages.js';
import { createUlid } from '../utils/ulid.js';
import {
  commitAssistantMessage,
  scheduleAssistantTurnDeliveries,
} from '../hooks/turn-send/session-persist.js';
import type { ChatMessage, LocalChatBeatModality } from '../types.js';
import type { MediaExecutionDecision } from '../hooks/turn-send/media-decision-types.js';

type OrchestratedBeat = ReturnType<typeof orchestrateBeatModalities>[number];
type ConcreteMediaDecision = Exclude<MediaExecutionDecision, { kind: 'none' }>;

type PreparedAssistantDelivery = {
  id: string;
  kind: LocalChatBeatModality;
  content: string;
  delayMs: number;
  beat: OrchestratedBeat;
  meta: ChatMessage['meta'];
};

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function parseLastUserIdleMs(input: {
  nowMs: number;
  sessionUpdatedAt: string;
  turns: Array<{ role: string; timestamp?: string }>;
}): number | null {
  const turns = input.turns;
  if (!Array.isArray(turns) || turns.length === 0) return null;
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || lastTurn.role !== 'user') return null;
  const lastUserAtMs = Date.parse(String(lastTurn.timestamp || input.sessionUpdatedAt || ''));
  if (!Number.isFinite(lastUserAtMs)) return null;
  return input.nowMs - lastUserAtMs;
}

function normalizeBeatText(content: string): string {
  return String(content || '').replace(/\s+/g, ' ').trim();
}

function toMarkerOverrideIntent(input: {
  beat: OrchestratedBeat;
  planId: string;
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

function buildPreparedDeliveries(input: {
  planId: string;
  turnMode: 'checkin' | 'information' | 'emotional' | 'playful' | 'intimate' | 'explicit-media' | 'explicit-voice';
  voiceConversationMode: 'off' | 'suggested' | 'on';
  beats: OrchestratedBeat[];
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
      autoPlayVoice: beat.modality === 'voice',
      segmentId: beat.beatId,
      segmentIndex: beat.beatIndex + 1,
      segmentCount: beat.beatCount,
      ...(beat.modality === 'text' || beat.modality === 'voice'
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

function emitAudit(
  sink: (event: LocalChatProactiveAuditEvent) => void,
  event: LocalChatProactiveAuditEvent,
): void {
  try {
    sink(event);
  } catch {
    // Audit sink failure must not stop proactive flow.
  }
}

export async function runLocalChatProactiveHeartbeatCycle(
  input: LocalChatProactiveHeartbeatInput,
): Promise<void> {
  const flowId = createLocalChatFlowId('local-chat-proactive-heartbeat');
  const nowMsCandidate = input.nowMs ? Number(input.nowMs()) : Date.now();
  const nowMs = Number.isFinite(nowMsCandidate) ? nowMsCandidate : Date.now();
  const auditSink = input.onAuditEvent || emitLocalChatProactiveAuditEvent;

  const settings = loadLocalChatDefaultSettings();
  const context = input.getReadContext();
  const targets = await listLocalChatTargets(context);
  if (targets.length === 0) return;

  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const sessions = (await listAllLocalChatSessions(context.viewerId || undefined))
    .filter((session) => targetsById.has(session.targetId));

  for (const session of sessions) {
    const idleMs = parseLastUserIdleMs({
      nowMs,
      sessionUpdatedAt: String(session.updatedAt || ''),
      turns: Array.isArray(session.turns) ? session.turns : [],
    });
    if (!Number.isFinite(idleMs)) continue;
    const resolvedIdleMs = Number(idleMs);

    const seed = targetsById.get(session.targetId);
    if (!seed) continue;
    const target = (
      await resolveLocalChatTargetDetail(context, seed as unknown as Record<string, unknown>)
    ) || seed;

    const wakeStrategy = resolveLocalChatWakeStrategy(target);
    const policy = evaluateLocalChatProactivePolicy({
      allowProactiveContact: settings.allowProactiveContact,
      wakeStrategy,
      targetId: target.id,
      sessionId: session.id,
      idleMs: resolvedIdleMs,
      nowMs,
    });

    emitAudit(auditSink, {
      flowId,
      source: 'runLocalChatProactiveHeartbeatCycle',
      targetId: target.id,
      sessionId: session.id,
      reasonCode: policy.reasonCode,
      actionHint: policy.actionHint,
      level: policy.allowed ? 'debug' : 'info',
      details: {
        idleMs: resolvedIdleMs,
        wakeStrategy: wakeStrategy || null,
      },
    });

    if (!policy.allowed) continue;

    try {
      const interactionProfile = deriveInteractionProfile(target);
      const voiceConversationMode = settings.enableVoice
        ? settings.voiceConversationMode
        : 'off';
      const turnMode = resolveTurnMode({
        userText: '',
        interactionProfile,
        voiceConversationMode,
        proactive: true,
      });
      const prepared = await buildTurnRequestInput({
        text: '',
        viewerId: session.viewerId,
        viewerDisplayName: 'User',
        selectedTarget: target,
        selectedSessionId: session.id,
        runtimeMode: 'STORY',
        routeBinding: null,
        allowMultiReply: settings.deliveryStyle === 'natural',
        turnMode,
        voiceConversationMode,
      });
      const resolvedExperiencePolicy = compileResolvedExperiencePolicy({
        interactionProfile: prepared.contextPacket.target.interactionProfile,
        interactionSnapshot: prepared.contextPacket.interactionSnapshot || null,
        settings,
        requestedVoiceConversationMode: voiceConversationMode,
        routeSource: prepared.invokeInput.routeBinding?.source || 'local',
      });
      const effectiveVoiceConversationMode = resolvedExperiencePolicy.voicePolicy.conversationMode;
      const proactiveDirective = '请自然地主动联系用户，像刚刚想起对方一样发起问候，不要解释理由。';
      const turnId = `turn_${createUlid()}`;
      const plan = await composeInteractionTurnPlan({
        aiClient: input.aiClient,
        invokeInput: prepared.invokeInput,
        contextPacket: prepared.contextPacket,
        userText: proactiveDirective,
        turnId,
        turnMode,
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
        voiceConversationMode: effectiveVoiceConversationMode,
      });
      const deliveries = buildPreparedDeliveries({
        planId: lockedPlan.planId,
        turnMode,
        voiceConversationMode: effectiveVoiceConversationMode,
        beats: orchestratedBeats.length > 0 ? orchestratedBeats : [{
          beatId: `beat_${createUlid()}`,
          turnId,
          beatIndex: 0,
          beatCount: 1,
          intent: 'checkin',
          relationMove: 'checkin',
          sceneMove: 'idle-reachout',
          modality: 'text',
          text: '在吗，我刚刚想起你。',
          pauseMs: 0,
          cancellationScope: 'turn',
        }],
      });
      const firstMarkedBeat = deliveries.find((delivery) => delivery.beat.assetRequest)?.beat || null;
      const markerOverrideIntent = firstMarkedBeat
        ? toMarkerOverrideIntent({ beat: firstMarkedBeat, planId: lockedPlan.planId })
        : null;
      const mediaRouteReady = {
        image: isMediaRouteReady({ kind: 'image', settings }),
        video: isMediaRouteReady({ kind: 'video', settings }),
      };
      const nsfwPolicy = resolvedExperiencePolicy.mediaPolicy.nsfwPolicy;
      const promptTrace = buildPromptTrace({
        compiledPrompt: prepared.compiledPrompt,
        contextPacket: prepared.contextPacket,
        routeSnapshot: null,
        routeBinding: null,
        chatRouteOptions: null,
        planner: 'stream',
        planSegments: deliveries.length,
        voiceSegments: deliveries.filter((delivery) => delivery.kind === 'voice').length,
        textSegments: deliveries.filter((delivery) => delivery.kind === 'text').length,
        schedulerTotalDelayMs: deliveries.reduce((sum, delivery) => sum + delivery.delayMs, 0),
        streamDeltaCount: 0,
        streamDurationMs: 0,
        segmentParseMode: 'single-message',
        nsfwPolicy,
        plannerUsed: markerOverrideIntent !== null,
        plannerKind: markerOverrideIntent?.type || 'none',
        plannerTrigger: markerOverrideIntent ? 'marker-override' : 'none',
        plannerConfidence: markerOverrideIntent?.plannerConfidence ?? null,
        plannerBlockedReason: null,
        imageReady: mediaRouteReady.image,
        videoReady: mediaRouteReady.video,
        imageDependencyStatus: mediaRouteReady.image ? 'ready' : 'unknown',
        videoDependencyStatus: mediaRouteReady.video ? 'ready' : 'unknown',
        mediaDecisionSource: markerOverrideIntent ? 'planner' : 'none',
        mediaDecisionKind: markerOverrideIntent?.type || 'none',
        mediaExecutionStatus: 'none',
        mediaExecutionRouteSource: null,
        mediaExecutionRouteModel: null,
        mediaExecutionReason: null,
      });
      promptTrace.turnMode = turnMode;
      promptTrace.interactionProfile = prepared.contextPacket.target.interactionProfile;
      promptTrace.voiceConversationMode = effectiveVoiceConversationMode;
      const turnAudit = buildTurnAudit({
        selectedTarget: target,
        latencyMs: 0,
      });

      const assistantText = deliveries.map((delivery) => normalizeBeatText(delivery.content)).filter(Boolean).join('\n\n');
      let latestPromptTrace = {
        ...promptTrace,
      };
      const rawMediaDecision = await decideMediaExecution({
        aiClient: input.aiClient,
        turnTxnId: turnId,
        routeBinding: null,
        defaultSettings: settings,
        resolvedPolicy: resolvedExperiencePolicy,
        userText: '',
        assistantText,
        target,
        worldId: target.worldId || null,
        messages: toChatMessagesFromSession(session),
        promptTrace: latestPromptTrace,
        nsfwPolicy,
        fallbackRouteSource: prepared.invokeInput.routeBinding?.source === 'cloud' ? 'cloud' : 'local',
        imageRouteOptions: null,
        videoRouteOptions: null,
        imageRouteOptionsRevision: 0,
        videoRouteOptionsRevision: 0,
        imageResolvedRoute: null,
        videoResolvedRoute: null,
        imageDependencySnapshot: null,
        videoDependencySnapshot: null,
        markerOverrideIntent,
      });
      latestPromptTrace = {
        ...latestPromptTrace,
        ...rawMediaDecision.promptTracePatch,
      };
      let mediaDecision: MediaExecutionDecision = rawMediaDecision;
      let mediaDeliveryId: string | null = null;
      if (rawMediaDecision.kind !== 'none') {
        const mediaDelivery = deliveries.find((item) => item.kind === 'image' || item.kind === 'video')
          || deliveries[0]
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

      const schedule = await scheduleAssistantTurnDeliveries({
        sessionId: session.id,
        targetId: target.id,
        viewerId: session.viewerId,
        turnTxnId: turnId,
        assistantTurnId: turnId,
        assistantBeatCount: deliveries.length,
        deliveries: deliveries.map((delivery) => ({
          id: delivery.id,
          delayMs: delivery.delayMs,
          run: async ({ assistantTurnId, index }) => {
            if (delivery.kind === 'text' || delivery.kind === 'voice') {
              await commitAssistantMessage({
                sessionId: session.id,
                targetId: target.id,
                viewerId: session.viewerId,
                assistantTurnId,
                messageId: delivery.id,
                setMessages: () => undefined,
                setSessions: () => undefined,
                promptTrace: index === 0 ? latestPromptTrace : null,
                turnAudit: index === 0 ? turnAudit : null,
                message: {
                  id: delivery.id,
                  role: 'assistant',
                  kind: delivery.kind,
                  content: delivery.content,
                  timestamp: new Date(nowMs + delivery.delayMs),
                  meta: delivery.meta,
                },
              });
              return;
            }
            const decision = mediaDeliveryId === delivery.id ? mediaDecision : null;
            if (!decision || decision.kind === 'none') {
              await commitAssistantMessage({
                sessionId: session.id,
                targetId: target.id,
                viewerId: session.viewerId,
                assistantTurnId,
                messageId: delivery.id,
                setMessages: () => undefined,
                setSessions: () => undefined,
                promptTrace: index === 0 ? latestPromptTrace : null,
                turnAudit: index === 0 ? turnAudit : null,
                message: {
                  id: delivery.id,
                  role: 'assistant',
                  kind: 'text',
                  content: delivery.content,
                  timestamp: new Date(nowMs + delivery.delayMs),
                  meta: delivery.meta,
                },
              });
              return;
            }
            const executionTracePatch = await executeMediaDecision({
              decision,
              aiClient: input.aiClient,
              defaultSettings: settings,
              nsfwPolicy,
              fallbackRouteSource: prepared.invokeInput.routeBinding?.source === 'cloud' ? 'cloud' : 'local',
              sessionId: session.id,
              targetId: target.id,
              viewerId: session.viewerId,
              assistantTurnId,
              setMessages: () => undefined,
              setSessions: () => undefined,
              promptTrace: index === 0 ? latestPromptTrace : null,
              turnAudit: index === 0 ? turnAudit : null,
              sendContextKey: `proactive-${session.id}`,
              getCurrentContextKey: () => `proactive-${session.id}`,
            });
            if (executionTracePatch) {
              latestPromptTrace = {
                ...latestPromptTrace,
                ...executionTracePatch,
              };
            }
          },
        })),
        setSessions: () => undefined,
      });
      await schedule.done;

      const nextSession = await getLocalChatSession(session.id, session.viewerId);
      const mediaAssets = await listLocalChatMediaAssets({
        conversationId: session.id,
        turnId,
      });
      const compiled = compileInteractionState({
        conversationId: session.id,
        targetId: target.id,
        viewerId: session.viewerId,
        session: nextSession,
        deliveredBeats: deliveries.map((delivery) => delivery.beat),
        mediaAssets,
      });
      const portableMemorySlots = await compilePortableMemorySlots({
        aiClient: input.aiClient,
        relationMemorySlots: compiled.relationMemorySlots,
        interactionSnapshot: compiled.snapshot,
        recentSummaries: deliveries.map((delivery) => normalizeBeatText(delivery.content)).filter(Boolean),
      });
      await Promise.all([
        upsertLocalChatInteractionSnapshot(compiled.snapshot),
        replaceLocalChatRelationMemorySlots({
          targetId: target.id,
          viewerId: session.viewerId,
          entries: portableMemorySlots,
        }),
        replaceLocalChatRecallIndex({
          conversationId: session.id,
          docs: compiled.recallDocs,
        }),
      ]);
      recordLocalChatProactiveContact({
        targetId: target.id,
        atMs: nowMs,
      });

      emitAudit(auditSink, {
        flowId,
        source: 'runLocalChatProactiveHeartbeatCycle',
        targetId: target.id,
        sessionId: session.id,
        reasonCode: ReasonCode.LOCAL_CHAT_PROACTIVE_ALLOWED,
        actionHint: 'contact-sent',
        level: 'info',
        details: {
          turnMode,
        },
      });
      break;
    } catch (error) {
      emitAudit(auditSink, {
        flowId,
        source: 'runLocalChatProactiveHeartbeatCycle',
        targetId: target.id,
        sessionId: session.id,
        reasonCode: ReasonCode.LOCAL_CHAT_PROACTIVE_POLICY_UNAVAILABLE,
        actionHint: 'decision-generation-failed',
        level: 'warn',
        details: {
          error: toErrorText(error),
        },
      });
    }
  }
}
