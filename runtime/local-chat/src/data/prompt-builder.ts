import { emitLocalChatLog } from '../logging.js';
import {
  compileLocalChatPrompt,
  type LocalChatCompiledPrompt,
} from '../prompt/index.js';
import type { LocalChatPromptInput } from './types.js';

export function buildLocalChatCompiledPrompt(input: LocalChatPromptInput): LocalChatCompiledPrompt {
  const compiled = compileLocalChatPrompt({
    contextPacket: input.contextPacket,
    maxPromptChars: input.maxPromptChars,
    profile: input.profile,
  });

  emitLocalChatLog({
    level: 'debug',
    message: 'local-chat:prompt-build:compiled',
    source: 'buildLocalChatCompiledPrompt',
    details: {
      targetId: input.contextPacket.target.id,
      worldId: input.contextPacket.world.worldId,
      promptChars: compiled.prompt.length,
      compilerVersion: compiled.compilerVersion,
      appliedLayers: compiled.layers.filter((layer) => layer.applied).map((layer) => layer.layer),
      droppedLayers: compiled.layers.filter((layer) => !layer.applied).map((layer) => layer.layer),
      hasWorldContext: input.contextPacket.world.lines.length > 0,
    },
  });

  return compiled;
}

// Convenience helper for call sites that only need final prompt text.
export function buildLocalChatPrompt(input: LocalChatPromptInput): string {
  return buildLocalChatCompiledPrompt(input).prompt;
}
