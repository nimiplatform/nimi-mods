import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
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
