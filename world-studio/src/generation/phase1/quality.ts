import { evaluateQualityGate } from '../../engine/quality-gate.js';
import type {
  ChunkExtraction,
  ChunkTaskResult,
  FinalDraftAccumulator,
  Phase1Result,
} from '../../engine/types.js';
import { deriveCharacterCandidates, deriveStartTimeOptions } from './derived-options.js';
import { runPhase1GlobalRefine } from './global-refine.js';

type BuildPhase1ResultInput = {
  merged: ChunkExtraction;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  chunkTasks: ChunkTaskResult[];
  normalizedChunks: string[];
  finalDraftAccumulator: FinalDraftAccumulator;
};

export function buildPhase1Result(input: BuildPhase1ResultInput): Phase1Result {
  const mergedGraph = {
    ...input.merged,
    futureHistoricalEvents: [] as Array<Record<string, unknown>>,
  };
  const refined = runPhase1GlobalRefine(mergedGraph);
  const knowledgeGraph = refined.graph;
  const qualityGate = evaluateQualityGate({
    graph: knowledgeGraph,
    totalChunks: input.totalChunks,
    successChunks: input.completedChunks,
    refinementMetrics: {
      characterNamePurity: refined.characterNamePurity,
      characterProfileCoverage: refined.characterProfileCoverage,
    },
  });

  const startTimeOptions = deriveStartTimeOptions(knowledgeGraph);
  const characterCandidates = deriveCharacterCandidates(knowledgeGraph);

  return {
    startTimeOptions,
    characterCandidates,
    knowledgeGraph,
    finalDraftAccumulator: input.finalDraftAccumulator,
    qualityGate,
    chunkTasks: input.chunkTasks,
    rawText: JSON.stringify({
      totalChunks: input.totalChunks,
      completedChunks: input.completedChunks,
      failedChunks: input.failedChunks,
      refined,
      qualityGate,
      chunkTasks: input.chunkTasks,
      knowledgeGraph,
      finalDraftAccumulator: input.finalDraftAccumulator,
    }),
  };
}
