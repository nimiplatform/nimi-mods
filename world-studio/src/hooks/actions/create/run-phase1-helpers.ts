import type { RuntimeRouteBinding } from '@nimiplatform/mod-sdk/runtime-route';
import { splitSourceText } from '../../../engine/chunker.js';
import { applyDraftPatch, createEmptyFinalDraftAccumulator } from '../../../engine/final-draft-accumulator.js';
import { mergeExtractions, toCharacterCandidates, toStartTimeOptions } from '../../../engine/merge.js';
import { backfillKnowledgeGraphEventFields } from '../../../engine/heuristic/event-field-backfill.js';
import { evaluateQualityGate } from '../../../engine/quality-gate.js';
import type { WorldStudioParseJobState } from '../../../contracts.js';
import {
  toFailedChunkIndices,
  toTerminalChunkTaskMap,
} from '../../../services/event-graph-map.js';
import type {
  DistillRouteOverrideMap,
  FinalDraftAccumulator,
  Phase1Result,
} from '../../../generation/pipeline.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import type { AdaptiveChunkPolicy } from './chunk-policy.js';

export function resolvePhase1Chunks(
  input: WorldStudioCreateActionsInput,
  chunkPolicy: AdaptiveChunkPolicy,
): { allChunks: string[]; usedLegacyFileChunks: boolean } {
  const hasFileRawText = input.sourceMode === 'FILE' && input.sourceRawTextRef.current.trim().length > 0;
  const hasFileChunks = input.sourceMode === 'FILE' && input.sourceChunksRef.current.length > 0;
  const hasInlineText = input.snapshot.sourceText.trim().length > 0;
  if (!hasFileRawText && !hasFileChunks && !hasInlineText) {
    throw new Error('Source text is required.');
  }
  const allChunks = hasFileRawText
    ? splitSourceText(input.sourceRawTextRef.current.trim(), {
      chunkSize: chunkPolicy.chunkSize,
      overlap: chunkPolicy.overlap,
    })
    : hasInlineText
      ? splitSourceText(input.snapshot.sourceText.trim(), {
        chunkSize: chunkPolicy.chunkSize,
        overlap: chunkPolicy.overlap,
      })
      : input.sourceChunksRef.current;
  if (allChunks.length === 0) {
    throw new Error('Source text is required.');
  }
  return {
    allChunks,
    usedLegacyFileChunks: !hasFileRawText && hasFileChunks,
  };
}

export function resolveRetryChunks(
  input: WorldStudioCreateActionsInput,
  allChunks: string[],
  mode: 'all' | 'failed',
  forcedRetryErrorCode?: string | null,
): { chunksToRun: string[]; chunkIndexMap?: number[] } {
  if (mode !== 'failed') {
    return { chunksToRun: allChunks };
  }
  const activeRetryErrorCode = (forcedRetryErrorCode ?? input.retryErrorCode) || null;
  const chunkTasks = input.phase1?.chunkTasks
    || input.snapshot.phase1Artifact?.chunkTasks
    || [];
  const failedChunkIndices = toFailedChunkIndices(
    chunkTasks,
    allChunks.length,
    input.retryScope,
    activeRetryErrorCode,
  );
  if (failedChunkIndices.length === 0) {
    if (activeRetryErrorCode) {
      input.setNotice(`No failed chunks matched code=${activeRetryErrorCode} under scope=${input.retryScope}.`);
    } else {
      input.setNotice(`No failed chunks matched retry scope: ${input.retryScope}.`);
    }
    return { chunksToRun: [] };
  }
  const chunksToRun = failedChunkIndices
    .map((index) => allChunks[index])
    .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0);
  if (chunksToRun.length === 0) {
    input.setNotice('No failed chunks to retry.');
    return { chunksToRun: [] };
  }
  return {
    chunksToRun,
    chunkIndexMap: failedChunkIndices,
  };
}

export function mergeRetryPhase1Result(
  input: WorldStudioCreateActionsInput,
  allChunks: string[],
  chunksToRun: string[],
  mode: 'all' | 'failed',
  result: Phase1Result,
): Phase1Result {
  if (mode !== 'failed') return result;

  const mergeFinalDraftAccumulator = (
    base: FinalDraftAccumulator,
    incoming: FinalDraftAccumulator,
  ): FinalDraftAccumulator => {
    const patched = applyDraftPatch(base, {
      chunkIndex: Math.max(base.lastUpdatedChunk, incoming.lastUpdatedChunk),
      world: incoming.world,
      worldview: incoming.worldview,
      worldLorebooks: incoming.worldLorebooks,
      futureHistoricalEvents: incoming.futureHistoricalEvents,
      agentDrafts: Object.values(incoming.agentDraftsByCharacter || {}),
      notes: ['mergeRetryPhase1Result'],
    }).next;
    return {
      ...patched,
      revisions: [...(base.revisions || []), ...(incoming.revisions || []), ...(patched.revisions || [])].slice(-120),
      lastUpdatedChunk: Math.max(base.lastUpdatedChunk, incoming.lastUpdatedChunk, patched.lastUpdatedChunk),
    };
  };

  const basePhase1 = input.phase1 || (input.snapshot.phase1Artifact
    ? {
      knowledgeGraph: input.snapshot.knowledgeGraph,
      chunkTasks: input.snapshot.phase1Artifact.chunkTasks,
      characterCandidates: input.snapshot.phase1Artifact.characterCandidates,
      finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
    }
    : null);
  if (!basePhase1) return result;
  const mergedGraph = backfillKnowledgeGraphEventFields(mergeExtractions([
    basePhase1.knowledgeGraph,
    result.knowledgeGraph,
  ]), allChunks.join('\n'));
  const mergedChunkTasks = [...basePhase1.chunkTasks, ...result.chunkTasks];
  const mergedStatusMap = toTerminalChunkTaskMap(mergedChunkTasks, allChunks.length);
  const successChunks = Array.from(mergedStatusMap.values()).filter((task) => task.status === 'success').length;
  const mergedQualityGate = evaluateQualityGate({
    graph: mergedGraph,
    totalChunks: allChunks.length,
    successChunks,
  });
  const mergedStartTimeOptions = toStartTimeOptions(mergedGraph.timeline as Array<Record<string, unknown>>);
  const mergedCharacterCandidates = (() => {
    const candidates = toCharacterCandidates(mergedGraph.characters as Array<Record<string, unknown>>);
    return candidates.length > 0 ? candidates : basePhase1.characterCandidates || [];
  })();
  const mergedFinalDraftAccumulator = mergeFinalDraftAccumulator(
    basePhase1.finalDraftAccumulator || createEmptyFinalDraftAccumulator(),
    result.finalDraftAccumulator || createEmptyFinalDraftAccumulator(),
  );
  return {
    ...result,
    startTimeOptions: mergedStartTimeOptions,
    characterCandidates: mergedCharacterCandidates,
    knowledgeGraph: mergedGraph,
    finalDraftAccumulator: mergedFinalDraftAccumulator,
    qualityGate: mergedQualityGate,
    chunkTasks: mergedChunkTasks,
    rawText: JSON.stringify({
      mode,
      totalChunks: allChunks.length,
      rerunChunks: chunksToRun.length,
      mergedQualityGate,
      mergedChunkTasks,
      mergedGraph,
      mergedFinalDraftAccumulator,
    }),
  };
}

export function buildParseJobStartState(
  chunkPolicy?: WorldStudioParseJobState['chunkPolicy'],
): WorldStudioParseJobState {
  const startedAt = new Date().toISOString();
  return {
    phase: 'ingest',
    chunkTotal: 0,
    chunkProcessed: 0,
    chunkCompleted: 0,
    chunkFailed: 0,
    progress: 0,
    etaSeconds: null,
    startedAt,
    updatedAt: startedAt,
    ...(chunkPolicy ? { chunkPolicy } : {}),
  };
}

export async function resolveCreatePhase1RouteOverrides(
  input: WorldStudioCreateActionsInput,
  mode: 'all' | 'failed',
): Promise<{ runtimeDefaultBinding: RuntimeRouteBinding | null; routeOverrides: DistillRouteOverrideMap }> {
  const runtimeDefaultBinding = await input.resolveRuntimeDefaultRouteBinding();
  return {
    runtimeDefaultBinding,
    routeOverrides: input.resolveEffectiveRouteOverrides({
      mode,
      retryWithFineRoute: input.retryWithFineRoute,
      runtimeDefaultBinding: runtimeDefaultBinding || null,
    }),
  };
}
