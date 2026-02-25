import { evaluateQualityGate } from '../../engine/quality-gate.js';
import { toStartTimeOptions } from '../../engine/merge.js';
import type {
  ChunkExtraction,
  ChunkTaskResult,
  Phase1Result,
} from '../../engine/types.js';
import { fallbackCharacterCandidates, fallbackStartTimeOptions } from './heuristic-fallback.js';
import { runPhase1GlobalRefine } from './global-refine.js';

type BuildPhase1ResultInput = {
  merged: ChunkExtraction;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  chunkTasks: ChunkTaskResult[];
  normalizedChunks: string[];
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

  const startTimeOptions = (() => {
    const options = toStartTimeOptions(knowledgeGraph.timeline);
    return options.length > 0 ? options : fallbackStartTimeOptions(knowledgeGraph);
  })();
  const sourceText = input.normalizedChunks.join('\n');
  const characterCandidates = fallbackCharacterCandidates(knowledgeGraph, sourceText);

  return {
    startTimeOptions,
    characterCandidates,
    knowledgeGraph,
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
    }),
  };
}
