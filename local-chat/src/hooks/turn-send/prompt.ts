import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { ChatMessage } from '../../types.js';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatCompiledPrompt } from '../../prompt/index.js';
import type { ChatRouteSnapshot, LocalChatTextAiClient } from './types.js';
import { buildTurnRequestInput } from './request-builder.js';
import { runTextTurn } from './text-turn-runner.js';

export type PreparedTurn = {
  prompt: string;
  compiledPrompt: LocalChatCompiledPrompt;
  textTurn: Awaited<ReturnType<typeof runTextTurn>>;
  routeSnapshot: ChatRouteSnapshot | null;
  routeOverride: RuntimeRouteBinding | null;
};

export async function prepareLocalChatTurn(input: {
  flowId: string;
  aiClient: LocalChatTextAiClient;
  text: string;
  selectedTarget: LocalChatTarget;
  messages: ChatMessage[];
  runtimeMode: 'STORY' | 'SCENE_TURN' | undefined;
  routeOverride: RuntimeRouteBinding | null;
  allowMultiReply: boolean;
  enableVoice: boolean;
  routeSnapshot: ChatRouteSnapshot | null;
}): Promise<PreparedTurn> {
  const { prompt, compiledPrompt, invokeInput } = await buildTurnRequestInput({
    text: input.text,
    selectedTarget: input.selectedTarget,
    messages: input.messages,
    runtimeMode: input.runtimeMode,
    routeOverride: input.routeOverride,
  });
  const textTurn = await runTextTurn({
    flowId: input.flowId,
    aiClient: input.aiClient,
    invokeInput,
    prompt,
    userText: input.text,
    allowMultiReply: input.allowMultiReply,
    enableVoice: input.enableVoice,
  });

  return {
    prompt,
    compiledPrompt,
    textTurn,
    routeSnapshot: input.routeSnapshot,
    routeOverride: input.routeOverride,
  };
}
