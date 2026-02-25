import { extractChunkCoarse } from '../../engine/coarse-extractor.js';
import { isContextOverflowError } from '../../engine/errors.js';
import type {
  ChunkExtraction,
  ChunkTaskResult,
  RouteCapabilityLlmInvoker,
  WorldStudioTaskInterruptReason,
} from '../../engine/types.js';
import { runWithConcurrency } from '../retry-policy.js';
import { countSuccessfulChunks, extractionSignal } from './merge-result.js';

type CoarsePassInput = {
  llm: RouteCapabilityLlmInvoker;
  normalizedChunks: string[];
  chunkIndexMap?: number[];
  maxConcurrency: number;
  abortSignal?: AbortSignal;
  chunkExtractions: Array<ChunkExtraction | null>;
  chunkTasks: ChunkTaskResult[];
  emit: (state: {
    phase: 'ingest' | 'extract' | 'merge' | 'validate';
    chunkTotal: number;
    chunkProcessed: number;
    chunkCompleted: number;
    chunkFailed: number;
    progress: number;
  }) => void;
  shouldInterrupt?: () => WorldStudioTaskInterruptReason | null;
};

export async function runCoarsePass(input: CoarsePassInput): Promise<WorldStudioTaskInterruptReason | null> {
  const total = input.normalizedChunks.length;
  const coarseIndices = input.normalizedChunks.map((_, index) => index);
  let coarseProcessed = 0;

  const stopReason = await runWithConcurrency(coarseIndices, input.maxConcurrency, async (index) => {
    const chunk = input.normalizedChunks[index] || '';
    const logicalChunkIndex = input.chunkIndexMap?.[index] ?? index;
    try {
      const coarse = await extractChunkCoarse(input.llm, {
        chunk,
        index,
        total,
        abortSignal: input.abortSignal,
      });
      const extraction = coarse.extraction;
      // Always keep LLM extraction — even sparse results contain valid entities.
      // Do NOT fall back to heuristic regex — it introduces noise.
      input.chunkExtractions[index] = extraction;
      const sparse = extractionSignal(extraction) < 3;
      input.chunkTasks.push({
        chunkIndex: logicalChunkIndex,
        stage: 'coarse',
        status: 'success',
        retryCount: coarse.retryCount,
        ...(sparse ? {
          errorCode: 'WORLD_STUDIO_COARSE_SPARSE',
          errorMessage: 'coarse extraction sparse but preserved (no heuristic fallback)',
        } : {}),
      });
    } catch (error) {
      const isOverflow = isContextOverflowError(error);
      input.chunkTasks.push({
        chunkIndex: logicalChunkIndex,
        stage: 'coarse',
        status: 'failed',
        retryCount: 1,
        errorCode: isOverflow ? 'WORLD_STUDIO_CONTEXT_OVERFLOW' : 'WORLD_STUDIO_COARSE_JSON_PARSE_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    coarseProcessed += 1;
    const completed = countSuccessfulChunks(input.chunkExtractions);
    const failed = Math.max(0, coarseProcessed - completed);
    input.emit({
      phase: 'extract',
      chunkTotal: total,
      chunkProcessed: completed + failed,
      chunkCompleted: completed,
      chunkFailed: failed,
      progress: 0.1 + (0.35 * (coarseProcessed / total)),
    });
  }, {
    shouldStop: input.shouldInterrupt,
  });
  return stopReason;
}
