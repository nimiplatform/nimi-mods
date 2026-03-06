import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import {
  buildLocalChatCompiledPrompt,
  type LocalChatTarget,
} from '../../data/index.js';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { LocalChatContextPacket } from '../../state/index.js';
import { assembleLocalChatContextPacket } from './context-assembler.js';

const MAX_SEGMENT_TOKENS = 2048;

type BuildTurnRequestInput = {
  text: string;
  viewerId: string;
  viewerDisplayName: string;
  selectedTarget: LocalChatTarget;
  selectedSessionId: string;
  runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
  routeOverride: RuntimeRouteBinding | null;
};

export type TurnInvokeInput = {
  routeHint: 'chat/default';
  prompt: string;
  maxTokens?: number;
  mode: 'STORY' | 'SCENE_TURN';
  worldId?: string;
  agentId: string;
  routeOverride?: RuntimeRouteBinding;
};

function normalizeTurnMode(mode: BuildTurnRequestInput['runtimeMode']): 'STORY' | 'SCENE_TURN' {
  return mode === 'SCENE_TURN' ? 'SCENE_TURN' : 'STORY';
}

export async function buildTurnRequestInput(input: BuildTurnRequestInput): Promise<{
  prompt: string;
  contextPacket: LocalChatContextPacket;
  compiledPrompt: LocalChatCompiledPrompt;
  invokeInput: TurnInvokeInput;
}> {
  const contextPacket = await assembleLocalChatContextPacket(input);
  const compiledPrompt = buildLocalChatCompiledPrompt({
    contextPacket,
  });
  const prompt = compiledPrompt.prompt;
  const invokeInput: TurnInvokeInput = {
    routeHint: 'chat/default',
    prompt,
    maxTokens: MAX_SEGMENT_TOKENS,
    mode: normalizeTurnMode(input.runtimeMode),
    worldId: input.selectedTarget.worldId || undefined,
    agentId: input.selectedTarget.id,
    routeOverride: input.routeOverride || undefined,
  };
  return {
    prompt,
    contextPacket,
    compiledPrompt,
    invokeInput,
  };
}
