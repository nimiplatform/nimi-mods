import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { LocalChatContextPacket, LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import { buildAssistantMessagesAndTurns } from './speech-turn-runner.js';
import { buildPromptTrace, buildTurnAudit } from './diagnostics.js';
import type { LocalChatTarget } from '../../data/index.js';
import type { ChatRouteSnapshot } from './types.js';
import type { AssistantPlanSegment } from './types.js';
import type { SegmentParseMode } from './types.js';

export function buildAssistantTurnOutput(input: {
  plannedSegments: AssistantPlanSegment[];
  enableVoice: boolean;
  autoPlayVoiceReplies: boolean;
  latencyMs: number;
  contextPacket: LocalChatContextPacket;
  compiledPrompt: LocalChatCompiledPrompt;
  selectedTarget: LocalChatTarget;
  routeSnapshot: ChatRouteSnapshot | null;
  routeBinding: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
  plannerUsed?: boolean;
  plannerKind?: 'none' | 'image' | 'video';
  plannerTrigger?: 'user-explicit' | 'assistant-offer' | 'scene-enhancement' | 'none' | 'marker-override';
  plannerConfidence?: number | null;
  plannerBlockedReason?: string | null;
  imageReady?: boolean;
  videoReady?: boolean;
  imageDependencyStatus?: 'ready' | 'missing' | 'degraded' | 'unknown' | null;
  videoDependencyStatus?: 'ready' | 'missing' | 'degraded' | 'unknown' | null;
  mediaDecisionSource?: 'tag' | 'explicit' | 'planner' | 'none';
  mediaDecisionKind?: 'none' | 'image' | 'video';
  mediaExecutionStatus?: 'none' | 'blocked' | 'pending' | 'ready' | 'failed';
  mediaExecutionRouteSource?: 'local-runtime' | 'token-api' | null;
  mediaExecutionRouteModel?: string | null;
  mediaExecutionReason?: string | null;
}) {
  const planId = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const assistantOutput = buildAssistantMessagesAndTurns({
    segments: input.plannedSegments,
    enableVoice: input.enableVoice,
    autoPlayVoiceReplies: input.autoPlayVoiceReplies,
    planId,
  });
  const routeSource = input.routeSnapshot?.source === 'token-api' ? 'token-api' : 'local-runtime';
  const routeModel = String(input.routeSnapshot?.model || input.routeBinding?.model || input.chatRouteOptions?.selected.model || '').trim();
  assistantOutput.deliveries.forEach((delivery) => {
    delivery.meta = {
      ...(delivery.meta || {}),
      routeSource,
      routeModel: routeModel || undefined,
      nsfwPolicy: input.nsfwPolicy,
      segmentParseMode: input.segmentParseMode,
    };
  });

  const promptTrace: LocalChatPromptTrace = buildPromptTrace({
    compiledPrompt: input.compiledPrompt,
    contextPacket: input.contextPacket,
    routeSnapshot: input.routeSnapshot,
    routeBinding: input.routeBinding,
    chatRouteOptions: input.chatRouteOptions,
    planner: 'stream',
    planSegments: assistantOutput.segmentCount,
    voiceSegments: assistantOutput.voiceSegments,
    textSegments: assistantOutput.textSegments,
    schedulerTotalDelayMs: assistantOutput.schedulerTotalDelayMs,
    streamDeltaCount: input.streamDeltaCount,
    streamDurationMs: input.streamDurationMs,
    segmentParseMode: input.segmentParseMode,
    nsfwPolicy: input.nsfwPolicy,
    plannerUsed: input.plannerUsed || false,
    plannerKind: input.plannerKind || 'none',
    plannerTrigger: input.plannerTrigger || 'none',
    plannerConfidence: input.plannerConfidence ?? null,
    plannerBlockedReason: input.plannerBlockedReason ?? null,
    imageReady: input.imageReady || false,
    videoReady: input.videoReady || false,
    imageDependencyStatus: input.imageDependencyStatus ?? null,
    videoDependencyStatus: input.videoDependencyStatus ?? null,
    mediaDecisionSource: input.mediaDecisionSource || 'none',
    mediaDecisionKind: input.mediaDecisionKind || 'none',
    mediaExecutionStatus: input.mediaExecutionStatus || 'none',
    mediaExecutionRouteSource: input.mediaExecutionRouteSource ?? null,
    mediaExecutionRouteModel: input.mediaExecutionRouteModel ?? null,
    mediaExecutionReason: input.mediaExecutionReason ?? null,
  });
  const turnAudit: LocalChatTurnAudit = buildTurnAudit({
    selectedTarget: input.selectedTarget,
    latencyMs: input.latencyMs,
  });

  return {
    promptTrace,
    turnAudit,
    assistantOutput,
  };
}
