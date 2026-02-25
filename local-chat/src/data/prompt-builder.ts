import { emitLocalChatLog } from '../logging.js';
import {
  compileLocalChatPrompt,
  type LocalChatCompiledPrompt,
} from '../prompt/index.js';
import type { LocalChatPromptInput } from './types.js';

export function buildLocalChatCompiledPrompt(input: LocalChatPromptInput): LocalChatCompiledPrompt {
  const compiled = compileLocalChatPrompt({
    target: input.target,
    history: input.history || [],
    userInput: input.userInput,
    maxPromptChars: input.maxPromptChars,
    maxHistoryChars: input.maxHistoryChars,
    maxJsonChars: input.maxJsonChars,
  });

  emitLocalChatLog({
    level: 'debug',
    message: 'local-chat:prompt-build:compiled',
    source: 'buildLocalChatCompiledPrompt',
    details: {
      targetId: input.target.id,
      worldId: input.target.worldId,
      promptChars: compiled.prompt.length,
      compilerVersion: compiled.compilerVersion,
      appliedLayers: compiled.layers.filter((layer) => layer.applied).map((layer) => layer.layer),
      droppedLayers: compiled.layers.filter((layer) => !layer.applied).map((layer) => layer.layer),
      hasWorldContext: Boolean(input.target.world || input.target.worldview),
    },
  });

  return compiled;
}

// Convenience helper for call sites that only need final prompt text.
export function buildLocalChatPrompt(input: LocalChatPromptInput): string {
  return buildLocalChatCompiledPrompt(input).prompt;
}
