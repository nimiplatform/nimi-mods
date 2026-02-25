import { asRecord } from '@nimiplatform/mod-sdk/utils';
import type { WorldLorebookDraftRow } from '../../../contracts.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { runPhase2DraftGeneration } from '../../../generation/pipeline.js';
import { buildWorldStudioEmbeddingIndex } from '../../../services/embedding-index.js';
import type { WorldStudioCreateActionsInput } from './types.js';

type RunCreatePhase2Options = {
  taskId?: string;
  resume?: boolean;
};

function diagLog(message: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioLog({
      level: 'error',
      message: `[AGENT_SYNC_DIAG] ${message}`,
      source: 'DIAG',
      details,
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
  }
}

function resolveEmbeddingRouteOverride(input: WorldStudioCreateActionsInput) {
  const binding = input.routeOverrideMap.fine
    || input.routeOverrideMap.coarse
    || input.runtimeDefaultRouteBinding
    || null;
  if (!binding) return null;
  return {
    source: binding.source,
    ...(binding.connectorId ? { connectorId: binding.connectorId } : {}),
    ...(binding.model ? { model: binding.model } : {}),
    ...(binding.localModelId ? { localModelId: binding.localModelId } : {}),
    ...(binding.engine ? { engine: binding.engine } : {}),
  };
}

async function rebuildEmbeddingIndex(
  input: WorldStudioCreateActionsInput,
  lorebooksDraft?: WorldLorebookDraftRow[],
) {
  const routeOverride = resolveEmbeddingRouteOverride(input);
  diagLog('Phase2 embedding rebuild start', {
    routeSource: routeOverride?.source || null,
    routeModel: routeOverride?.model || null,
    lorebooksDraftCount: lorebooksDraft?.length || input.snapshot.lorebooksDraft.length,
  });
  input.patchSnapshot({
    embeddingIndex: {
      ...input.snapshot.embeddingIndex,
      status: 'building',
      routeSource: routeOverride?.source || input.snapshot.embeddingIndex.routeSource,
      routeModel: routeOverride?.model || input.snapshot.embeddingIndex.routeModel,
      errorMessage: null,
    },
  });

  const result = await buildWorldStudioEmbeddingIndex({
    aiClient: input.aiClient,
    snapshot: input.snapshot,
    routeOverride,
    ...(lorebooksDraft ? { lorebooksDraft } : {}),
  });

  input.patchSnapshot({
    embeddingIndex: result.embeddingIndex,
  });
  diagLog('Phase2 embedding rebuild done', {
    ok: result.ok,
    entryCount: result.entryCount,
    status: result.embeddingIndex.status,
    routeSource: result.embeddingIndex.routeSource,
    routeModel: result.embeddingIndex.routeModel,
    errorMessage: result.embeddingIndex.errorMessage,
  });
  return result;
}

export async function runRebuildEmbeddingIndex(input: WorldStudioCreateActionsInput): Promise<void> {
  const result = await rebuildEmbeddingIndex(input);
  if (result.ok) {
    input.setStatusBanner({
      kind: 'success',
      message: `Embedding index rebuilt: ${result.entryCount} entries`,
    });
    return;
  }
  input.setStatusBanner({
    kind: 'warn',
    message: result.embeddingIndex.errorMessage || 'Embedding index rebuild failed',
  });
}

export async function runCreatePhase2(
  input: WorldStudioCreateActionsInput,
  options?: RunCreatePhase2Options,
): Promise<void> {
  diagLog('Phase2 ENTER', {
    selectedStartTimeId: input.snapshot.selectedStartTimeId,
    selectedCharacters: input.snapshot.selectedCharacters,
    selectedCharactersCount: input.snapshot.selectedCharacters.length,
    phase1QualityStatus: input.phase1?.qualityGate?.status || input.snapshot.phase1Artifact?.qualityGate?.status || null,
    knowledgeGraph: {
      timeline: input.snapshot.knowledgeGraph.timeline.length,
      locations: input.snapshot.knowledgeGraph.locations.length,
      characters: input.snapshot.knowledgeGraph.characters.length,
      primaryEvents: input.snapshot.knowledgeGraph.events.primary.length,
      secondaryEvents: input.snapshot.knowledgeGraph.events.secondary.length,
      relations: input.snapshot.knowledgeGraph.characterRelations.length,
    },
  });
  const qualityGate = input.phase1?.qualityGate || input.snapshot.phase1Artifact?.qualityGate || null;
  if (!qualityGate || !input.snapshot.selectedStartTimeId) {
    diagLog('Phase2 blocked: missing qualityGate or selectedStartTimeId', {
      hasQualityGate: Boolean(qualityGate),
      selectedStartTimeId: input.snapshot.selectedStartTimeId,
    });
    input.setError('Please complete extract step and select start time first.');
    return;
  }
  if (qualityGate.status === 'BLOCK' || !qualityGate.pass) {
    diagLog('Phase2 blocked by quality gate', {
      status: qualityGate.status,
      pass: qualityGate.pass,
      reasons: qualityGate.reasons,
    });
    input.setError(`WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: ${qualityGate.reasons.join(' | ')}`);
    return;
  }
  if (input.snapshot.selectedCharacters.length === 0) {
    diagLog('Phase2 blocked: no selected characters');
    input.setError('Please select at least one character before synthesize.');
    return;
  }
  if ((input.snapshot.knowledgeGraph.events.primary || []).length === 0) {
    diagLog('Phase2 blocked: no primary events');
    input.setError('WORLD_STUDIO_EVENT_GRAPH_INVALID: at least one PRIMARY event is required.');
    return;
  }
  const missingEvidencePrimary = (input.snapshot.knowledgeGraph.events.primary || []).filter((item) => {
    return !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0;
  });
  if (missingEvidencePrimary.length > 0) {
    diagLog('Phase2 blocked: primary events missing evidence', {
      missingEvidenceCount: missingEvidencePrimary.length,
      ids: missingEvidencePrimary.slice(0, 20).map((item) => item.id),
    });
    input.setError(`WORLD_STUDIO_EVENT_EVIDENCE_REQUIRED: ${missingEvidencePrimary.length} primary events missing evidence.`);
    return;
  }

  const resumeTask = (() => {
    if (!options?.resume) return null;
    const taskId = String(options.taskId || '').trim();
    const task = taskId ? input.taskController.getTaskById(taskId) : input.taskController.getActiveTask();
    if (!task || task.kind !== 'CREATE_PHASE2') return null;
    if (task.status !== 'PAUSED' && task.status !== 'PAUSE_REQUESTED') return null;
    return task;
  })();

  let taskId = '';
  let abortSignal: AbortSignal | undefined;
  if (resumeTask) {
    const resumed = input.taskController.resumeTask(resumeTask.id, 'Resuming synthesize task');
    if (!resumed) {
      input.setError('WORLD_STUDIO_TASK_RESUME_FAILED: synthesize task cannot resume.');
      return;
    }
    taskId = resumeTask.id;
    abortSignal = input.taskController.getAbortSignal(taskId) || undefined;
    diagLog('Phase2 task resumed', { taskId });
  } else {
    const started = input.taskController.startTask({
      kind: 'CREATE_PHASE2',
      label: 'Synthesize world draft',
      atomic: false,
      resumable: false,
      canPause: false,
      canCancel: true,
      step: 'SYNTHESIZE',
      message: 'Synthesize started',
    });
    if (!started) {
      input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
      return;
    }
    taskId = started.taskId;
    abortSignal = started.abortSignal;
    diagLog('Phase2 task started', { taskId });
  }

  input.setError(null);
  input.setNotice(null);
  input.patchSnapshot({
    parseJob: {
      phase: 'synthesize',
      progress: Math.max(0.9, input.snapshot.parseJob.progress),
      chunkProcessed: input.snapshot.parseJob.chunkProcessed,
      etaSeconds: null,
      updatedAt: new Date().toISOString(),
    },
  });
  input.setCreateStep('SYNTHESIZE');
  input.taskController.updateTask(taskId, {
    progress: Math.max(0.9, input.snapshot.parseJob.progress),
    message: 'Generating publish-ready draft',
  });
  input.taskController.setCheckpoint(taskId, {
    step: 'SYNTHESIZE',
    chunkTotal: input.snapshot.parseJob.chunkTotal || 0,
    chunkCompleted: input.snapshot.parseJob.chunkCompleted || 0,
    chunkFailed: input.snapshot.parseJob.chunkFailed || 0,
    payload: {
      selectedStartTimeId: input.snapshot.selectedStartTimeId,
      selectedCharacters: input.snapshot.selectedCharacters,
    },
  });

  try {
    const runtimeDefaultBinding = await input.resolveRuntimeDefaultRouteBinding();
    const routeOverride = input.routeOverrideMap.fine || input.routeOverrideMap.coarse || runtimeDefaultBinding || null;
    diagLog('Phase2 generateText start', {
      taskId,
      routeSource: routeOverride?.source || null,
      routeModel: routeOverride?.model || null,
      routeConnectorId: routeOverride?.connectorId || null,
    });
    const result = await runPhase2DraftGeneration(input.aiClient, {
      selectedStartTimeId: input.snapshot.selectedStartTimeId,
      selectedCharacters: input.snapshot.selectedCharacters,
      knowledgeGraph: input.snapshot.knowledgeGraph,
    }, {
      routeOverride: routeOverride || undefined,
      abortSignal,
    });
    diagLog('Phase2 generateText done', {
      taskId,
      worldKeys: Object.keys(asRecord(result.world)),
      worldviewKeys: Object.keys(asRecord(result.worldview)),
      worldEvents: Array.isArray(result.worldEvents) ? result.worldEvents.length : 0,
      worldLorebooks: Array.isArray(result.worldLorebooks) ? result.worldLorebooks.length : 0,
      futureHistoricalEvents: Array.isArray(result.futureHistoricalEvents) ? result.futureHistoricalEvents.length : 0,
      agentDrafts: Array.isArray(result.agentDrafts) ? result.agentDrafts.length : 0,
    });
    diagLog('Phase2 dna presence audit', {
      taskId,
      selectedCharacters: input.snapshot.selectedCharacters,
      agentDraftHasDna: (result.agentDrafts || []).map((draft) => ({
        name: draft.characterName,
        hasDna: Boolean(draft.dna && typeof draft.dna === 'object'),
        dnaKeys: draft.dna && typeof draft.dna === 'object' ? Object.keys(draft.dna) : [],
        hasDnaPrimary: typeof draft.dnaPrimary === 'string' && draft.dnaPrimary.trim().length > 0,
      })),
    });
    input.setPhase2(result);

    // Phase 2 worldEvents are discarded — Phase 1 extraction is the source of truth for events.
    // Phase 2 LLM tends to compress/lose events, so we preserve Phase 1 results.
    const draftsByCharacter = (result.agentDrafts || []).reduce((acc, item) => {
      const name = String(item.characterName || '').trim();
      if (!name) return acc;
      // Keep explicit dna key (even undefined) so downstream merge can distinguish
      // "this run has no dna" from "no update provided".
      acc[name] = {
        ...item,
        dna: item.dna,
      };
      return acc;
    }, {} as Record<string, typeof result.agentDrafts[number]>);
    const missingDnaCharacters = input.snapshot.selectedCharacters.filter((name) => {
      const draft = draftsByCharacter[name];
      return !(draft && draft.dna && typeof draft.dna === 'object');
    });

    // >>> DIAG: remove after debugging <<<
    try {
      emitWorldStudioLog({
        level: 'error',
        message: '[AGENT_SYNC_DIAG] Phase2 complete: writing agentSync.draftsByCharacter',
        source: 'DIAG',
        details: {
          agentDraftCount: (result.agentDrafts || []).length,
          agentDraftNames: (result.agentDrafts || []).map((d) => d.characterName),
          agentDraftHasDna: (result.agentDrafts || []).map((d) => ({ name: d.characterName, hasDna: Boolean(d.dna), dnaKeys: d.dna && typeof d.dna === 'object' ? Object.keys(d.dna) : [] })),
          agentDraftFieldCoverage: (result.agentDrafts || []).map((d) => ({
            name: d.characterName,
            fields: Object.keys(asRecord(d)).sort(),
            hasDescription: typeof d.description === 'string' && d.description.trim().length > 0,
            hasScenario: typeof d.scenario === 'string' && d.scenario.trim().length > 0,
            hasGreeting: typeof d.greeting === 'string' && d.greeting.trim().length > 0,
            ruleCount: Array.isArray(d.rules) ? d.rules.length : 0,
            alternateGreetingCount: Array.isArray(d.alternateGreetings) ? d.alternateGreetings.length : 0,
            agentLorebookCount: Array.isArray(d.agentLorebooks) ? d.agentLorebooks.length : 0,
          })),
          draftsByCharacterKeys: Object.keys(draftsByCharacter),
          existingAgentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
          existingAgentSyncDraftKeys: Object.keys(input.snapshot.agentSync.draftsByCharacter || {}),
          mergedDraftKeys: [...new Set([...Object.keys(input.snapshot.agentSync.draftsByCharacter || {}), ...Object.keys(draftsByCharacter)])],
          missingDnaCharacters,
        },
      });
    } catch {
      // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
    }

    input.patchSnapshot({
      worldPatch: asRecord(result.world),
      worldviewPatch: asRecord(result.worldview),
      // eventsDraft: preserved from Phase 1 — not overwritten by Phase 2
      lorebooksDraft: Array.isArray(result.worldLorebooks)
        ? result.worldLorebooks.filter((item) => item && typeof item === 'object') as WorldLorebookDraftRow[]
        : [],
      futureEventsText: JSON.stringify(result.futureHistoricalEvents, null, 2),
      knowledgeGraph: {
        ...input.snapshot.knowledgeGraph,
        // events: preserved from Phase 1 — not overwritten by Phase 2
        futureHistoricalEvents: result.futureHistoricalEvents,
      },
      unsavedChangesByPanel: {
        world: true,
        worldview: true,
        events: true,
        lorebooks: true,
      },
      parseJob: {
        phase: 'done',
        progress: 1,
        chunkProcessed: input.snapshot.parseJob.chunkTotal,
        etaSeconds: 0,
        updatedAt: new Date().toISOString(),
      },
      agentSync: {
        ...input.snapshot.agentSync,
        draftsByCharacter: {
          ...input.snapshot.agentSync.draftsByCharacter,
          ...draftsByCharacter,
        },
      },
      createStep: 'DRAFT',
    });
    diagLog('Phase2 snapshot patched', {
      taskId,
      worldName: String(asRecord(result.world).name || ''),
      selectedCharacters: input.snapshot.selectedCharacters,
      draftsByCharacterKeys: Object.keys(draftsByCharacter),
      missingDnaCharacters,
      lorebooksDraftCount: Array.isArray(result.worldLorebooks)
        ? result.worldLorebooks.filter((item) => item && typeof item === 'object').length
        : 0,
    });
    if (missingDnaCharacters.length > 0) {
      input.setNotice(`Synthesize completed, but missing DNA for: ${missingDnaCharacters.join(', ')}`);
      input.setStatusBanner({ kind: 'warn', message: 'Synthesize completed with DNA gaps' });
    } else {
      input.setNotice('Synthesize completed. Draft editor is ready.');
      input.setStatusBanner({ kind: 'success', message: 'Synthesize completed' });
    }
    input.taskController.completeTask(taskId, 'Synthesize completed');
    diagLog('Phase2 COMPLETE', { taskId });

    void rebuildEmbeddingIndex(input, Array.isArray(result.worldLorebooks)
      ? result.worldLorebooks.filter((item) => item && typeof item === 'object') as WorldLorebookDraftRow[]
      : undefined)
      .then((embeddingResult) => {
        if (!embeddingResult.ok) {
          input.setNotice(`Embedding index needs attention: ${embeddingResult.embeddingIndex.errorMessage || 'build failed'}`);
        }
      })
      .catch((error) => {
        input.patchSnapshot({
          embeddingIndex: {
            ...input.snapshot.embeddingIndex,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error || 'WORLD_STUDIO_EMBEDDING_FAILED'),
          },
        });
      });
  } catch (runError) {
    if (abortSignal?.aborted || input.taskController.shouldCancel(taskId)) {
      input.patchSnapshot({
        parseJob: {
          phase: 'failed',
          updatedAt: new Date().toISOString(),
        },
      });
      input.taskController.cancelTask(taskId, 'Synthesize canceled');
      input.setNotice('Synthesize canceled.');
      input.setStatusBanner({ kind: 'warn', message: 'Synthesize canceled' });
      diagLog('Phase2 canceled', {
        taskId,
        reason: runError instanceof Error ? runError.message : String(runError || ''),
      });
      return;
    }
    input.patchSnapshot({
      parseJob: {
        phase: 'failed',
        updatedAt: new Date().toISOString(),
      },
    });
    input.taskController.failTask(taskId, runError);
    input.setError(runError instanceof Error ? runError.message : String(runError));
    diagLog('Phase2 FAILED', {
      taskId,
      error: runError instanceof Error ? runError.message : String(runError),
      stack: runError instanceof Error ? runError.stack?.slice(0, 1000) : null,
    });
  }
}
