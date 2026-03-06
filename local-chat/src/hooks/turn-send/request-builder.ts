import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import {
  buildLocalChatCompiledPrompt,
  recallLocalChatMemoryForPrompt,
  type LocalChatTarget,
} from '../../data/index.js';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { ChatMessage } from '../../types.js';

const MAX_SEGMENT_TOKENS = 2048;

type BuildTurnRequestInput = {
  text: string;
  selectedTarget: LocalChatTarget;
  messages: ChatMessage[];
  runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
  routeBinding: RuntimeRouteBinding | null;
};

export type TurnInvokeInput = {
  capability: 'text.generate';
  prompt: string;
  maxTokens?: number;
  mode: 'STORY' | 'SCENE_TURN';
  worldId?: string;
  agentId: string;
  routeBinding?: RuntimeRouteBinding;
};

function normalizeTurnMode(mode: BuildTurnRequestInput['runtimeMode']): 'STORY' | 'SCENE_TURN' {
  return mode === 'SCENE_TURN' ? 'SCENE_TURN' : 'STORY';
}

export async function buildTurnRequestInput(input: BuildTurnRequestInput): Promise<{
  prompt: string;
  compiledPrompt: LocalChatCompiledPrompt;
  invokeInput: TurnInvokeInput;
}> {
  const history = input.messages
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
  const memoryRecall = await recallLocalChatMemoryForPrompt({
    target: input.selectedTarget,
    userInput: input.text,
    topK: 10,
  });
  const promptTarget: LocalChatTarget = {
    ...input.selectedTarget,
    payload: {
      ...(input.selectedTarget.payload || {}),
      coreMemory: memoryRecall.coreMemory,
      e2eMemory: memoryRecall.e2eMemory,
      memoryRecallSource: memoryRecall.recallSource,
      memoryEntityId: memoryRecall.entityId,
    },
  };
  const compiledPrompt = buildLocalChatCompiledPrompt({
    target: promptTarget,
    history,
    userInput: input.text,
  });
  const prompt = compiledPrompt.prompt;
  const invokeInput: TurnInvokeInput = {
    capability: 'text.generate',
    prompt,
    maxTokens: MAX_SEGMENT_TOKENS,
    mode: normalizeTurnMode(input.runtimeMode),
    worldId: input.selectedTarget.worldId || undefined,
    agentId: input.selectedTarget.id,
    routeBinding: input.routeBinding || undefined,
  };
  return {
    prompt,
    compiledPrompt,
    invokeInput,
  };
}
