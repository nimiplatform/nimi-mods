import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { LocalChatContextPacket } from '../../state/index.js';
import type { ChatRouteSnapshot, LocalChatTurnAiClient } from './types.js';
import { buildTurnRequestInput } from './request-builder.js';
import { runTextTurn } from './text-turn-runner.js';

export type PreparedTurn = {
  prompt: string;
  contextPacket: LocalChatContextPacket;
  compiledPrompt: LocalChatCompiledPrompt;
  textTurn: Awaited<ReturnType<typeof runTextTurn>>;
  routeSnapshot: ChatRouteSnapshot | null;
  routeOverride: RuntimeRouteBinding | null;
};

export async function prepareLocalChatTurn(input: {
  flowId: string;
  aiClient: LocalChatTurnAiClient;
  text: string;
  viewerId: string;
  viewerDisplayName: string;
  selectedTarget: LocalChatTarget;
  selectedSessionId: string;
  runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
  routeOverride: RuntimeRouteBinding | null;
  allowMultiReply: boolean;
  segmentationMode: 'adaptive' | 'single';
  routeSnapshot: ChatRouteSnapshot | null;
  onStreamDelta?: (delta: string, chunkCount: number) => void;
}): Promise<PreparedTurn> {
  const { prompt, contextPacket, compiledPrompt, invokeInput } = await buildTurnRequestInput({
    text: input.text,
    viewerId: input.viewerId,
    viewerDisplayName: input.viewerDisplayName,
    selectedTarget: input.selectedTarget,
    selectedSessionId: input.selectedSessionId,
    runtimeMode: input.runtimeMode,
    routeOverride: input.routeOverride,
  });
  const textTurn = await runTextTurn({
    flowId: input.flowId,
    aiClient: input.aiClient,
    invokeInput,
    prompt,
    allowMultiReply: input.allowMultiReply,
    segmentationMode: input.segmentationMode,
    onStreamDelta: input.onStreamDelta,
  });

  return {
    prompt,
    contextPacket,
    compiledPrompt,
    textTurn,
    routeSnapshot: input.routeSnapshot,
    routeOverride: input.routeOverride,
  };
}
