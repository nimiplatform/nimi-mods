import type { LocalChatContextLaneId, LocalChatContextPacket } from '../state/ledger-types.js';

export type PromptLayerId =
  | 'platformSafety'
  | 'identity'
  | 'world'
  | 'platformWarmStart'
  | 'durableMemory'
  | 'runningSummary'
  | 'sessionRecall'
  | 'recentBundles'
  | 'userInput'
  | 'replyStyle';

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
  durableMemoryCount: number;
  sessionRecallCount: number;
  worldContextCount: number;
  recentBundleCount: number;
};

export type LocalChatCompiledPrompt = {
  prompt: string;
  layerOrder: PromptLayerId[];
  layers: PromptLayerTrace[];
  laneChars: Partial<Record<LocalChatContextLaneId, number>>;
  truncationByLane: Partial<Record<LocalChatContextLaneId, boolean>>;
  budget: PromptBudgetTrace;
  retrieval: PromptRetrievalTrace;
  compilerVersion: 'v4';
};

export type LocalChatPromptCompileInput = {
  contextPacket: LocalChatContextPacket;
  maxPromptChars?: number;
};
