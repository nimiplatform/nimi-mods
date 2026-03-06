import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { LocalChatContextPacket, LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import { buildAssistantMessagesAndTurns } from './speech-turn-runner.js';
import { buildPromptTrace, buildTurnAudit } from './diagnostics.js';
import type { LocalChatTarget } from '../../data/index.js';
import type { ChatRouteSnapshot } from './types.js';
import type { AssistantPlanSegment } from './types.js';
import type { SegmentParseMode } from './types.js';
import { createDefaultMediaPromptTracePatch } from './media-decision-types.js';

export function buildAssistantTurnOutput(input: {
  plannedSegments: AssistantPlanSegment[];
  enableVoice: boolean;
  autoPlayVoiceReplies: boolean;
  latencyMs: number;
  contextPacket: LocalChatContextPacket;
  compiledPrompt: LocalChatCompiledPrompt;
  selectedTarget: LocalChatTarget;
  routeSnapshot: ChatRouteSnapshot | null;
  routeOverride: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
}) {
  const planId = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const assistantOutput = buildAssistantMessagesAndTurns({
    segments: input.plannedSegments,
    enableVoice: input.enableVoice,
    autoPlayVoiceReplies: input.autoPlayVoiceReplies,
    planId,
  });
  const routeSource = input.routeSnapshot?.source === 'token-api' ? 'token-api' : 'local-runtime';
  const routeModel = String(input.routeSnapshot?.model || input.routeOverride?.model || input.chatRouteOptions?.selected.model || '').trim();
  const mediaTrace = createDefaultMediaPromptTracePatch();
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
    routeOverride: input.routeOverride,
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
    plannerUsed: false,
    plannerKind: 'none',
    plannerTrigger: 'none',
    plannerConfidence: null,
    plannerBlockedReason: null,
    imageReady: false,
    videoReady: false,
    imageDependencyStatus: null,
    videoDependencyStatus: null,
    mediaDecisionSource: mediaTrace.mediaDecisionSource,
    mediaDecisionKind: mediaTrace.mediaDecisionKind,
    mediaExecutionStatus: mediaTrace.mediaExecutionStatus,
    mediaExecutionRouteSource: mediaTrace.mediaExecutionRouteSource,
    mediaExecutionRouteModel: mediaTrace.mediaExecutionRouteModel,
    mediaExecutionReason: mediaTrace.mediaExecutionReason,
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
