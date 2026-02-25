import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import { splitSourceText } from '../engine/chunker.js';
import { createEmptyAccumulatedState, compressAccumulatedState } from '../engine/accumulated-context.js';
import { upsertMergeExtraction, toChunkExtraction } from '../engine/accumulated-merge.js';
import { extractChunkCoarse } from '../engine/coarse-extractor.js';
import { isContextOverflowError } from '../engine/errors.js';
import { extractChunkFine } from '../engine/fine-extractor.js';
import type {
  AccumulatedState,
  ChunkExtraction,
  ChunkTaskResult,
  DistillRouteOverrideMap,
  Phase1Result,
  WorldStudioProgressState,
  WorldStudioTaskInterruptReason,
} from '../engine/types.js';
import { toFailureSummary } from './retry-policy.js';
import { toNormalizedRouteOverrides, withRouteOverride } from './route-capability-resolver.js';
import { extractionSignal, shouldRunFinePass, mergeChunkExtraction, countSuccessfulChunks } from './phase1/merge-result.js';
import { createProgressEmitter } from './phase1/progress.js';
import { buildPhase1Result } from './phase1/quality.js';

export async function runPhase1Extraction(
  aiClient: ModAiClient,
  sourceText: string,
  options?: {
    onProgress?: (state: WorldStudioProgressState) => void;
    chunkSize?: number;
    overlap?: number;
    routeOverrides?: DistillRouteOverrideMap;
    abortSignal?: AbortSignal;
    shouldInterrupt?: () => WorldStudioTaskInterruptReason | null;
    contextTokenBudget?: number;
    initialAccumulatedState?: AccumulatedState;
  },
): Promise<Phase1Result> {
  const chunks = splitSourceText(sourceText, {
    chunkSize: options?.chunkSize ?? 3000,
    overlap: options?.overlap ?? 300,
  });
  return runPhase1ExtractionFromChunks(aiClient, chunks, options);
}

export async function runPhase1ExtractionFromChunks(
  aiClient: ModAiClient,
  chunks: string[],
  options?: {
    onProgress?: (state: WorldStudioProgressState) => void;
    routeOverrides?: DistillRouteOverrideMap;
    chunkIndexMap?: number[];
    maxConcurrency?: number;
    abortSignal?: AbortSignal;
    shouldInterrupt?: () => WorldStudioTaskInterruptReason | null;
    contextTokenBudget?: number;
    initialAccumulatedState?: AccumulatedState;
    onAccumulatedStateUpdate?: (state: AccumulatedState) => void;
  },
): Promise<Phase1Result> {
  const normalizedChunks = chunks.map((chunk) => String(chunk || '').trim()).filter(Boolean);
  if (normalizedChunks.length === 0) {
    throw new Error('WORLD_STUDIO_EMPTY_SOURCE');
  }

  const routeOverrides = toNormalizedRouteOverrides(options?.routeOverrides);
  const coarseLlm = withRouteOverride(aiClient, 'chat/coarse', routeOverrides.coarse);
  const fineLlm = withRouteOverride(aiClient, 'chat/fine', routeOverrides.fine);
  const startedAt = Date.now();
  const emit = createProgressEmitter(startedAt, options?.onProgress);

  const chunkExtractions: Array<ChunkExtraction | null> = normalizedChunks.map(() => null);
  const chunkTasks: ChunkTaskResult[] = [];
  const total = normalizedChunks.length;

  // Initialize accumulated state (supports resume via initialAccumulatedState)
  let accumulatedState = options?.initialAccumulatedState ?? createEmptyAccumulatedState();
  const contextTokenBudget = options?.contextTokenBudget ?? 2000;
  const startIndex = accumulatedState.lastProcessedChunk >= 0
    ? accumulatedState.lastProcessedChunk + 1
    : 0;
  const CHECKPOINT_INTERVAL = 20;

  emit({
    phase: 'ingest',
    chunkTotal: total,
    chunkProcessed: 0,
    chunkCompleted: 0,
    chunkFailed: 0,
    progress: 0.1,
  });

  let interruptedReason: WorldStudioTaskInterruptReason | null = null;

  // Serial loop (from startIndex to skip already-processed chunks on resume)
  for (let i = startIndex; i < normalizedChunks.length; i++) {
    // Interrupt check
    const interrupt = options?.shouldInterrupt?.();
    if (interrupt) { interruptedReason = interrupt; break; }
    if (options?.abortSignal?.aborted) { interruptedReason = 'cancel'; break; }

    const chunk = normalizedChunks[i]!;
    const logicalIndex = options?.chunkIndexMap?.[i] ?? i;

    // 1. Build compressed context from accumulated state
    const compressedCtx = i > 0
      ? compressAccumulatedState(accumulatedState, contextTokenBudget)
      : '';

    // 2. Coarse pass
    try {
      const coarse = await extractChunkCoarse(coarseLlm, {
        chunk,
        index: i,
        total,
        abortSignal: options?.abortSignal,
        accumulatedContext: compressedCtx,
      });

      const sparse = extractionSignal(coarse.extraction) < 3;

      // 3. Always upsert into accumulated state — even sparse extractions
      // carry valuable worldSetting / early character mentions that bootstrap context.
      accumulatedState = upsertMergeExtraction(accumulatedState, coarse.extraction, i);
      accumulatedState = { ...accumulatedState, successfulChunks: accumulatedState.successfulChunks + 1 };
      chunkExtractions[i] = coarse.extraction;
      chunkTasks.push({
        chunkIndex: logicalIndex,
        stage: 'coarse',
        status: 'success',
        retryCount: coarse.retryCount,
        ...(sparse ? {
          errorCode: 'WORLD_STUDIO_COARSE_SPARSE',
          errorMessage: 'coarse extraction sparse but preserved (no heuristic fallback)',
        } : {}),
      });

      // 4. Conditional fine pass (same threshold as parallel pipeline: signal < 4)
      if (shouldRunFinePass(coarse.extraction)) {
        try {
          const fine = await extractChunkFine(fineLlm, {
            chunk,
            index: i,
            total,
            seed: coarse.extraction,
            abortSignal: options?.abortSignal,
          });
          chunkExtractions[i] = mergeChunkExtraction(coarse.extraction, fine.extraction);
          accumulatedState = upsertMergeExtraction(accumulatedState, fine.extraction, i);
          chunkTasks.push({
            chunkIndex: logicalIndex,
            stage: 'fine',
            status: 'success',
            retryCount: fine.retryCount,
          });
        } catch (fineError) {
          const isOverflow = isContextOverflowError(fineError);
          chunkTasks.push({
            chunkIndex: logicalIndex,
            stage: 'fine',
            status: 'failed',
            retryCount: 1,
            errorCode: isOverflow ? 'WORLD_STUDIO_CONTEXT_OVERFLOW' : 'WORLD_STUDIO_FINE_JSON_PARSE_FAILED',
            errorMessage: fineError instanceof Error ? fineError.message : String(fineError),
          });
        }
      }
    } catch (coarseError) {
      const isOverflow = isContextOverflowError(coarseError);
      chunkTasks.push({
        chunkIndex: logicalIndex,
        stage: 'coarse',
        status: 'failed',
        retryCount: 1,
        errorCode: isOverflow ? 'WORLD_STUDIO_CONTEXT_OVERFLOW' : 'WORLD_STUDIO_COARSE_JSON_PARSE_FAILED',
        errorMessage: coarseError instanceof Error ? coarseError.message : String(coarseError),
      });
    }

    // 5. Unconditionally mark chunk as processed (even on failure) — prevents resume skip
    accumulatedState = { ...accumulatedState, lastProcessedChunk: i };

    // 6. Progress (account for pre-resume chunks via successfulChunks, not startIndex)
    const currentCompleted = countSuccessfulChunks(chunkExtractions);
    const adjustedCompleted = currentCompleted + (options?.initialAccumulatedState?.successfulChunks ?? 0);
    const adjustedFailed = (i + 1) - adjustedCompleted;
    emit({
      phase: 'extract',
      chunkTotal: total,
      chunkProcessed: i + 1,
      chunkCompleted: adjustedCompleted,
      chunkFailed: adjustedFailed,
      progress: 0.1 + (0.6 * ((i + 1) / total)),
    });

    // 7. Checkpoint (every 20 chunks or the last chunk)
    if (options?.onAccumulatedStateUpdate && (i % CHECKPOINT_INTERVAL === 0 || i === normalizedChunks.length - 1)) {
      options.onAccumulatedStateUpdate(accumulatedState);
    }
  }

  // 8. Final: use accumulated state instead of concat merge
  const finalExtraction = toChunkExtraction(accumulatedState);
  const currentRunCompleted = countSuccessfulChunks(chunkExtractions);
  const preResumeCompleted = options?.initialAccumulatedState?.successfulChunks ?? 0;
  const totalCompleted = currentRunCompleted + preResumeCompleted;

  if (totalCompleted === 0 && !interruptedReason) {
    throw new Error(`WORLD_STUDIO_PHASE1_ALL_CHUNKS_FAILED: ${toFailureSummary(chunkTasks, total)}`);
  }

  emit({
    phase: 'merge',
    chunkTotal: total,
    chunkProcessed: totalCompleted + (total - totalCompleted),
    chunkCompleted: totalCompleted,
    chunkFailed: total - totalCompleted,
    progress: 0.85,
  });

  const result = buildPhase1Result({
    merged: finalExtraction,
    totalChunks: total,
    completedChunks: totalCompleted,
    failedChunks: total - totalCompleted,
    chunkTasks,
    normalizedChunks,
  });
  if (interruptedReason) {
    result.interrupted = { reason: interruptedReason };
  }

  emit({
    phase: 'validate',
    chunkTotal: total,
    chunkProcessed: totalCompleted + (total - totalCompleted),
    chunkCompleted: totalCompleted,
    chunkFailed: total - totalCompleted,
    progress: interruptedReason ? Math.max(0.1, Math.min(0.95, result.qualityGate.metrics.chunkSuccessRatio)) : 1,
  });

  return result;
}
