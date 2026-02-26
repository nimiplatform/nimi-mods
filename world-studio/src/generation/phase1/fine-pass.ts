import { isContextOverflowError } from '../../engine/errors.js';
import { extractChunkFine } from '../../engine/fine-extractor.js';
import type {
  ChunkExtraction,
  ChunkTaskResult,
  RouteCapabilityLlmInvoker,
  WorldStudioTaskInterruptReason,
} from '../../engine/types.js';
import { runWithConcurrency } from '../retry-policy.js';
import { countSuccessfulChunks, mergeChunkExtraction, shouldRunFinePass } from './merge-result.js';

type FinePassInput = {
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

export async function runFinePass(input: FinePassInput): Promise<WorldStudioTaskInterruptReason | null> {
  const total = input.normalizedChunks.length;
  const fineTargets = input.chunkExtractions
    .map((extraction, index) => ({ extraction, index }))
    .filter(({ extraction }) => shouldRunFinePass(extraction))
    .map(({ index }) => index);

  let fineProcessed = 0;
  const stopReason = await runWithConcurrency(fineTargets, input.maxConcurrency, async (index) => {
    const chunk = input.normalizedChunks[index] || '';
    const logicalChunkIndex = input.chunkIndexMap?.[index] ?? index;
    const currentExtraction = input.chunkExtractions[index] ?? null;
    try {
      const fine = await extractChunkFine(input.llm, {
        chunk,
        index,
        total,
        seed: currentExtraction || undefined,
        abortSignal: input.abortSignal,
      });
      input.chunkExtractions[index] = mergeChunkExtraction(currentExtraction, fine.extraction);
      input.chunkTasks.push({
        chunkIndex: logicalChunkIndex,
        stage: 'fine',
        status: 'success',
        retryCount: fine.retryCount,
      });
    } catch (error) {
      const isOverflow = isContextOverflowError(error);
      input.chunkTasks.push({
        chunkIndex: logicalChunkIndex,
        stage: 'fine',
        status: 'failed',
        retryCount: 1,
        errorCode: isOverflow ? 'WORLD_STUDIO_CONTEXT_OVERFLOW' : 'WORLD_STUDIO_FINE_JSON_PARSE_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      // Keep whatever coarse extraction we already have — do NOT fall back to heuristic regex.
    }

    fineProcessed += 1;
    const completed = countSuccessfulChunks(input.chunkExtractions);
    const failed = Math.max(0, total - completed);
    input.emit({
      phase: 'extract',
      chunkTotal: total,
      chunkProcessed: completed + failed,
      chunkCompleted: completed,
      chunkFailed: failed,
      progress: 0.45 + (0.25 * (fineProcessed / Math.max(1, fineTargets.length))),
    });
  }, {
    shouldStop: input.shouldInterrupt,
  });
  return stopReason;
}

export async function runFineChunk(
  llm: RouteCapabilityLlmInvoker,
  input: {
    chunk: string;
    index: number;
    total: number;
    seed?: ChunkExtraction;
    accumulatedContext?: string;
    accumulatorSlice?: Record<string, unknown>;
    missingFields?: string[];
    abortSignal?: AbortSignal;
  },
) {
  return extractChunkFine(llm, {
    chunk: input.chunk,
    index: input.index,
    total: input.total,
    seed: input.seed,
    accumulatedContext: input.accumulatedContext,
    accumulatorSlice: input.accumulatorSlice,
    missingFields: input.missingFields,
    abortSignal: input.abortSignal,
  });
}
