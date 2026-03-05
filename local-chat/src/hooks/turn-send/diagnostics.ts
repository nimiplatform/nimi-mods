import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatCompiledPrompt, PromptLayerId } from '../../prompt/index.js';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import type { SegmentParseMode } from './types.js';

type RouteSnapshot = {
  source: string;
  model: string;
};

type BuildPromptTraceInput = {
  compiledPrompt: LocalChatCompiledPrompt;
  routeSnapshot: RouteSnapshot | null;
  routeOverride: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  planner: 'stream';
  planSegments: number;
  voiceSegments: number;
  textSegments: number;
  schedulerTotalDelayMs: number;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
};

function extractLayerIds(input: {
  layers: LocalChatCompiledPrompt['layers'];
  applied: boolean;
}): PromptLayerId[] {
  return input.layers
    .filter((layer) => layer.applied === input.applied)
    .map((layer) => layer.layer);
}

export function buildPromptTrace(input: BuildPromptTraceInput): LocalChatPromptTrace {
  const appliedLayers = extractLayerIds({
    layers: input.compiledPrompt.layers,
    applied: true,
  });
  const droppedLayers = extractLayerIds({
    layers: input.compiledPrompt.layers,
    applied: false,
  });

  return {
    id: `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    routeSource: input.routeSnapshot?.source
      || (input.routeOverride?.source || input.chatRouteOptions?.selected.source || 'unknown'),
    routeModel: input.routeSnapshot?.model
      || (input.routeOverride?.model || input.chatRouteOptions?.selected.model || ''),
    promptChars: input.compiledPrompt.prompt.length,
    layerOrder: [...input.compiledPrompt.layerOrder],
    appliedLayers,
    droppedLayers,
    memorySlices: {
      core: input.compiledPrompt.retrieval.coreCount,
      e2e: input.compiledPrompt.retrieval.e2eCount,
      worldLore: input.compiledPrompt.retrieval.worldLoreCount,
      agentLore: input.compiledPrompt.retrieval.agentLoreCount,
    },
    budget: {
      maxChars: input.compiledPrompt.budget.maxChars,
      usedChars: input.compiledPrompt.budget.usedChars,
      truncated: input.compiledPrompt.budget.truncatedLayers.length > 0,
    },
    compilerVersion: input.compiledPrompt.compilerVersion,
    planner: input.planner,
    planSegments: input.planSegments,
    voiceSegments: input.voiceSegments,
    textSegments: input.textSegments,
    schedulerTotalDelayMs: input.schedulerTotalDelayMs,
    streamDeltaCount: input.streamDeltaCount,
    streamDurationMs: input.streamDurationMs,
    segmentParseMode: input.segmentParseMode,
    nsfwPolicy: input.nsfwPolicy,
    createdAt: new Date().toISOString(),
  };
}

export function buildTurnAudit(input: {
  selectedTarget: LocalChatTarget;
  latencyMs: number;
  error?: string | null;
}): LocalChatTurnAudit {
  return {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    targetId: input.selectedTarget.id,
    worldId: input.selectedTarget.worldId || null,
    latencyMs: input.latencyMs,
    error: input.error || null,
    createdAt: new Date().toISOString(),
  };
}
