import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import { splitSourceText } from '../engine/chunker.js';
import { createEmptyAccumulatedState, compressAccumulatedState } from '../engine/accumulated-context.js';
import { upsertMergeExtraction, toChunkExtraction } from '../engine/accumulated-merge.js';
import {
  applyDraftPatch,
  buildFinalDraftAccumulatorSlice,
  createEmptyFinalDraftAccumulator,
} from '../engine/final-draft-accumulator.js';
import { isContextOverflowError } from '../engine/errors.js';
import type {
  AccumulatedState,
  ChunkExtraction,
  ChunkTaskResult,
  DraftPatch,
  DistillRouteOverrideMap,
  FinalDraftAccumulator,
  Phase1Result,
  WorldStudioProgressState,
  WorldStudioTaskInterruptReason,
} from '../engine/types.js';
import { toFailureSummary } from './retry-policy.js';
import { toNormalizedRouteOverrides, withRouteOverride } from './route-capability-resolver.js';
import { runCoarseChunk } from './phase1/coarse-pass.js';
import { runFineChunk } from './phase1/fine-pass.js';
import { extractionSignal, mergeChunkExtraction, countSuccessfulChunks } from './phase1/merge-result.js';
import { createProgressEmitter } from './phase1/progress.js';
import { buildPhase1Result } from './phase1/quality.js';
import { backfillChunkExtractionEventFields } from '../engine/heuristic/event-field-backfill.js';

type FinalDraftAccumulatorPatchUpdate = {
  chunkIndex: number;
  logicalChunkIndex: number;
  changedFields: string[];
  hasChanges: boolean;
  before: FinalDraftAccumulator;
  after: FinalDraftAccumulator;
  patch: DraftPatch;
};

function resolveMissingFinalDraftFields(accumulator: FinalDraftAccumulator): string[] {
  const world = accumulator.world || {};
  const worldview = accumulator.worldview || {};
  const worldviewRecord = worldview as Record<string, unknown>;
  const draftValues = Object.values(accumulator.agentDraftsByCharacter || {});
  const fields: string[] = [];
  if (!String(world.name || '').trim()) fields.push('world.name');
  if (!String(world.description || '').trim()) fields.push('world.description');
  if (!String(world.genre || '').trim()) fields.push('world.genre');
  if (!worldviewRecord.timeModel || typeof worldviewRecord.timeModel !== 'object') fields.push('worldview.timeModel');
  if (!worldviewRecord.spaceTopology || typeof worldviewRecord.spaceTopology !== 'object') fields.push('worldview.spaceTopology');
  if (!worldviewRecord.causality || typeof worldviewRecord.causality !== 'object') fields.push('worldview.causality');
  if (!worldviewRecord.coreSystem || typeof worldviewRecord.coreSystem !== 'object') fields.push('worldview.coreSystem');
  if ((accumulator.worldLorebooks || []).length < 3) fields.push('worldLorebooks');
  if (draftValues.length === 0) fields.push('agentDrafts');
  draftValues.slice(0, 6).forEach((draft) => {
    const name = String(draft.characterName || '').trim();
    if (!name) return;
    if (!String(draft.concept || '').trim()) fields.push(`agentDrafts.${name}.concept`);
    if (!String(draft.description || '').trim()) fields.push(`agentDrafts.${name}.description`);
    if (!draft.dna || typeof draft.dna !== 'object') fields.push(`agentDrafts.${name}.dna`);
  });
  return Array.from(new Set(fields)).slice(0, 24);
}

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
    initialFinalDraftAccumulator?: FinalDraftAccumulator;
    onFinalDraftAccumulatorPatch?: (update: FinalDraftAccumulatorPatchUpdate) => void;
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
    initialFinalDraftAccumulator?: FinalDraftAccumulator;
    onAccumulatedStateUpdate?: (state: AccumulatedState) => void;
    onFinalDraftAccumulatorUpdate?: (state: FinalDraftAccumulator) => void;
    onFinalDraftAccumulatorPatch?: (update: FinalDraftAccumulatorPatchUpdate) => void;
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
  let finalDraftAccumulator = options?.initialFinalDraftAccumulator ?? createEmptyFinalDraftAccumulator();
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
      const coarse = await runCoarseChunk(coarseLlm, {
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

      // 4. Fine pass always runs and contributes accumulator patch (can be no-op patch).
      try {
        const fine = await runFineChunk(fineLlm, {
          chunk,
          index: i,
          total,
          seed: coarse.extraction,
          accumulatedContext: compressedCtx,
          accumulatorSlice: buildFinalDraftAccumulatorSlice(finalDraftAccumulator, {
            maxLorebooks: 8,
            maxFutureEvents: 8,
            maxAgentDrafts: 6,
            maxRevisions: 6,
          }),
          missingFields: resolveMissingFinalDraftFields(finalDraftAccumulator),
          abortSignal: options?.abortSignal,
        });
        chunkExtractions[i] = mergeChunkExtraction(coarse.extraction, fine.extraction);
        accumulatedState = upsertMergeExtraction(accumulatedState, fine.extraction, i);
        const beforeAccumulator = finalDraftAccumulator;
        const patchResult = applyDraftPatch(beforeAccumulator, fine.draftPatch);
        finalDraftAccumulator = patchResult.next;
        if (options?.onFinalDraftAccumulatorPatch) {
          options.onFinalDraftAccumulatorPatch({
            chunkIndex: i,
            logicalChunkIndex: logicalIndex,
            changedFields: patchResult.changedFields,
            hasChanges: patchResult.changedFields.length > 0,
            before: beforeAccumulator,
            after: finalDraftAccumulator,
            patch: fine.draftPatch,
          });
        }
        chunkTasks.push({
          chunkIndex: logicalIndex,
          stage: 'fine',
          status: 'success',
          retryCount: fine.retryCount,
          ...(extractionSignal(fine.extraction) < 1
            ? {
              errorCode: 'WORLD_STUDIO_FINE_NOOP_PATCH',
              errorMessage: 'fine succeeded with minimal extraction delta',
            }
            : {}),
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
    if (i % CHECKPOINT_INTERVAL === 0 || i === normalizedChunks.length - 1) {
      if (options?.onAccumulatedStateUpdate) {
        options.onAccumulatedStateUpdate(accumulatedState);
      }
      if (options?.onFinalDraftAccumulatorUpdate) {
        options.onFinalDraftAccumulatorUpdate(finalDraftAccumulator);
      }
    }
  }

  // 8. Final: use accumulated state instead of concat merge
  const rawFinalExtraction = toChunkExtraction(accumulatedState);
  const finalExtraction = backfillChunkExtractionEventFields(
    rawFinalExtraction,
    normalizedChunks.join('\n'),
  );
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
    finalDraftAccumulator,
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
