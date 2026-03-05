import type { LocalChatHistoryMessage, LocalChatTarget } from '../data/types.js';

export type PromptLayerId =
  | 'platformSafety'
  | 'conversationSummary'
  | 'worldHardRules'
  | 'identityRules'
  | 'identityBase'
  | 'userNarrativeDirectives'
  | 'worldLoreKeyword'
  | 'agentLorebook'
  | 'coreMemory'
  | 'e2eMemory'
  | 'recentMessages'
  | 'postHistoryInstructions';

export type PromptLayerTrace = {
  layer: PromptLayerId;
  applied: boolean;
  reason: string;
  chars: number;
  truncated: boolean;
};

export type PromptBudgetTrace = {
  maxChars: number;
  usedChars: number;
  truncatedLayers: PromptLayerId[];
};

export type PromptRetrievalTrace = {
  recallSource: 'local-index-only' | 'local-index+remote-backfill' | 'remote-only';
  coreCount: number;
  e2eCount: number;
  worldLoreCount: number;
  agentLoreCount: number;
};

export type LocalChatCompiledPrompt = {
  prompt: string;
  layerOrder: PromptLayerId[];
  layers: PromptLayerTrace[];
  budget: PromptBudgetTrace;
  retrieval: PromptRetrievalTrace;
  compilerVersion: 'v1' | 'v2' | 'v3';
};

export type LocalChatPromptCompileInput = {
  target: LocalChatTarget;
  history: LocalChatHistoryMessage[];
  userInput: string;
  maxPromptChars?: number;
  maxHistoryChars?: number;
  maxJsonChars?: number;
};
