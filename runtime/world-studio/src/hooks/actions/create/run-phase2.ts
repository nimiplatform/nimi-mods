import type { WorldLorebookDraftRow } from '../../../contracts.js';
import { PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD, summarizePrimaryEvidenceCoverage, } from '../../../engine/primary-evidence.js';
import { deriveCharacterCandidates, deriveStartTimeOptions } from '../../../generation/phase1/derived-options.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { runPhase2DraftGeneration } from '../../../generation/pipeline.js';
import { buildWorldStudioEmbeddingIndex } from '../../../services/embedding-index.js';
import { toUniqueStringArray } from '../../../services/snapshot-normalize.js';
import { projectEventsForSelectedStartTime, START_TIME_PROJECTED_FUTURE_EVENT_KIND, } from '../../../services/start-time-projection.js';
import { isEvidenceRequiredForEvent } from '../../../services/event-horizon.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
type RunCreatePhase2Options = {
    taskId?: string;
    resume?: boolean;
};
function normalizeStringArray(value: string[]): string[] {
    return toUniqueStringArray(value.map((item) => String(item || '').trim()).filter((item) => item.length > 0));
}
function diagLog(message: string, details?: Record<string, unknown>) {
    try {
        emitWorldStudioLog({
            level: 'error',
            message: `[MODS-TEST-DIAG] ${message}`,
            source: 'DIAG',
            details,
        });
    }
    catch {
        // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
    }
}
function resolveEmbeddingRouteBinding(input: WorldStudioCreateActionsInput) {
    const binding = input.bindingMap.fine
        || input.bindingMap.coarse
        || input.runtimeDefaultRouteBinding
        || null;
    if (!binding)
        return null;
    return binding;
}
async function rebuildEmbeddingIndex(input: WorldStudioCreateActionsInput, lorebooksDraft?: WorldLorebookDraftRow[]) {
    const binding = resolveEmbeddingRouteBinding(input);
    diagLog('Phase2 embedding rebuild start', {
        routeSource: binding?.source || null,
        routeModel: binding?.model || null,
        lorebooksDraftCount: lorebooksDraft?.length || input.snapshot.lorebooksDraft.length,
    });
    input.patchSnapshot({
        embeddingIndex: {
            ...input.snapshot.embeddingIndex,
            status: 'building',
            routeSource: binding?.source || input.snapshot.embeddingIndex.routeSource,
            routeModel: binding?.model || input.snapshot.embeddingIndex.routeModel,
            errorMessage: null,
        },
    });
    const result = await buildWorldStudioEmbeddingIndex({
        aiClient: input.aiClient,
        snapshot: input.snapshot,
        binding,
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
            message: worldStudioMessage('banner.embeddingRebuilt', 'Embedding index rebuilt: {{entryCount}} entries', {
                entryCount: result.entryCount,
            }),
        });
        return;
    }
    input.setStatusBanner({
        kind: 'warning',
        message: result.embeddingIndex.errorMessage || worldStudioMessage('notice.embeddingFailed', 'Embedding index build failed.'),
    });
}
export async function runCreatePhase2(input: WorldStudioCreateActionsInput, options?: RunCreatePhase2Options): Promise<void> {
    const hasDraftEvents = (Array.isArray(input.snapshot.eventsDraft.primary) && input.snapshot.eventsDraft.primary.length > 0) || (Array.isArray(input.snapshot.eventsDraft.secondary) && input.snapshot.eventsDraft.secondary.length > 0);
    const eventsForPhase2 = hasDraftEvents
        ? input.snapshot.eventsDraft
        : input.snapshot.knowledgeGraph.events;
    const graphForPhase2 = {
        ...input.snapshot.knowledgeGraph,
        events: eventsForPhase2,
    };
    const startTimeOptions = deriveStartTimeOptions(graphForPhase2);
    const selectedStartTimeId = startTimeOptions.some((item) => item.id === input.snapshot.selectedStartTimeId)
        ? input.snapshot.selectedStartTimeId
        : (startTimeOptions[startTimeOptions.length - 1]?.id || '');
    const qualityGate = input.phase1?.qualityGate || input.snapshot.phase1Artifact?.qualityGate || null;
    diagLog('Phase2 ENTER', {
        selectedStartTimeId: input.snapshot.selectedStartTimeId,
        effectiveSelectedStartTimeId: selectedStartTimeId,
        startTimeOptionCount: startTimeOptions.length,
        selectedCharacters: input.snapshot.selectedCharacters,
        selectedCharactersCount: input.snapshot.selectedCharacters.length,
        agentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
        agentSyncSelectedCharacterIdsCount: input.snapshot.agentSync.selectedCharacterIds.length,
        phase1QualityStatus: input.phase1?.qualityGate?.status || input.snapshot.phase1Artifact?.qualityGate?.status || null,
        knowledgeGraph: {
            timeline: input.snapshot.knowledgeGraph.timeline.length,
            locations: input.snapshot.knowledgeGraph.locations.length,
            characters: input.snapshot.knowledgeGraph.characters.length,
            primaryEvents: input.snapshot.knowledgeGraph.events.primary.length,
            secondaryEvents: input.snapshot.knowledgeGraph.events.secondary.length,
            relations: input.snapshot.knowledgeGraph.characterRelations.length,
        },
        finalDraftAccumulator: {
            worldKeys: Object.keys(asRecord(input.snapshot.finalDraftAccumulator.world || {})),
            worldviewKeys: Object.keys(asRecord(input.snapshot.finalDraftAccumulator.worldview || {})),
            worldLorebooks: input.snapshot.finalDraftAccumulator.worldLorebooks.length,
            futureHistoricalEvents: input.snapshot.finalDraftAccumulator.futureHistoricalEvents.length,
            agentDrafts: Object.keys(input.snapshot.finalDraftAccumulator.agentDraftsByCharacter || {}),
            revisions: input.snapshot.finalDraftAccumulator.revisions.length,
            lastUpdatedChunk: input.snapshot.finalDraftAccumulator.lastUpdatedChunk,
        },
    });
    if (!qualityGate || !selectedStartTimeId) {
        diagLog('Phase2 blocked: missing qualityGate or selectedStartTimeId', {
            hasQualityGate: Boolean(qualityGate),
            selectedStartTimeId,
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
    const projection = projectEventsForSelectedStartTime({
        selectedStartTimeId,
        startTimeOptions,
        events: eventsForPhase2,
        futureHistoricalEvents: graphForPhase2.futureHistoricalEvents || [],
    });
    if (!projection.applied) {
        const reasonCode = projection.reasonCode || 'WORLD_STUDIO_START_TIME_PROJECTION_FAILED';
        diagLog('Phase2 blocked: start-time projection failed', {
            selectedStartTimeId,
            reasonCode,
        });
        input.setError(`WORLD_STUDIO_START_TIME_PROJECTION_FAILED: ${reasonCode}`);
        return;
    }
    const projectedKnowledgeGraph = {
        ...graphForPhase2,
        events: projection.events,
        futureHistoricalEvents: projection.futureHistoricalEvents,
    };
    const characterCandidates = deriveCharacterCandidates(projectedKnowledgeGraph);
    const candidateNameSet = new Set(characterCandidates.map((item) => item.name));
    const selectedCharacters = normalizeStringArray(input.snapshot.selectedCharacters)
        .filter((item) => candidateNameSet.has(item));
    if (candidateNameSet.size === 0) {
        diagLog('Phase2 blocked: no character candidates', {
            selectedStartTimeId,
            candidateCount: characterCandidates.length,
        });
        input.patchSnapshot({
            selectedCharacters: [],
            agentSync: {
                ...input.snapshot.agentSync,
                selectedCharacterIds: [],
            },
        });
        input.setError('WORLD_STUDIO_CHARACTER_SELECTION_INVALID: no valid character candidates.');
        return;
    }
    if (selectedCharacters.length === 0) {
        diagLog('Phase2 blocked: selected characters not in candidate set', {
            selectedCharacters: input.snapshot.selectedCharacters,
            candidateNames: Array.from(candidateNameSet).slice(0, 24),
        });
        input.patchSnapshot({
            selectedCharacters: [],
            agentSync: {
                ...input.snapshot.agentSync,
                selectedCharacterIds: [],
            },
        });
        input.setError('WORLD_STUDIO_CHARACTER_SELECTION_INVALID: please select at least one valid character.');
        return;
    }
    const selectedAgentSyncCharacters = (() => {
        const filtered = normalizeStringArray(input.snapshot.agentSync.selectedCharacterIds)
            .filter((item) => candidateNameSet.has(item));
        if (filtered.length > 0)
            return filtered;
        return [...selectedCharacters];
    })();
    input.patchSnapshot({
        selectedStartTimeId,
        selectedCharacters,
        agentSync: {
            ...input.snapshot.agentSync,
            selectedCharacterIds: selectedAgentSyncCharacters,
        },
        eventsDraft: projection.events,
        futureEventsText: JSON.stringify(projection.futureHistoricalEvents || [], null, 2),
        knowledgeGraph: projectedKnowledgeGraph,
    });
    if ((projectedKnowledgeGraph.events.primary || []).length === 0) {
        diagLog('Phase2 blocked: no primary events');
        input.setError('WORLD_STUDIO_EVENT_GRAPH_INVALID: at least one PRIMARY event is required.');
        return;
    }
    const primaryEvents = projectedKnowledgeGraph.events.primary || [];
    const primaryEvidenceSummary = summarizePrimaryEvidenceCoverage(primaryEvents);
    if (primaryEvidenceSummary.total > 0
        && primaryEvidenceSummary.coverage < PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD) {
        const missingEvidencePrimary = primaryEvents.filter((item) => {
            if (!isEvidenceRequiredForEvent(item))
                return false;
            return !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0;
        });
        diagLog('Phase2 blocked: primary evidence coverage below threshold', {
            totalPrimary: primaryEvidenceSummary.total,
            primaryWithEvidence: primaryEvidenceSummary.withEvidence,
            missingEvidenceCount: primaryEvidenceSummary.missing,
            coverage: primaryEvidenceSummary.coverage,
            threshold: PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD,
            ids: missingEvidencePrimary.slice(0, 20).map((item) => item.id),
        });
        input.setError(`WORLD_STUDIO_EVENT_EVIDENCE_REQUIRED: primaryEvidenceCoverage=${primaryEvidenceSummary.coverage.toFixed(3)}, threshold=${PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD.toFixed(3)}, missing=${primaryEvidenceSummary.missing}.`);
        return;
    }
    const resumeTask = (() => {
        if (!options?.resume)
            return null;
        const taskId = String(options.taskId || '').trim();
        const task = taskId ? input.taskController.getTaskById(taskId) : input.taskController.getActiveTask();
        if (!task || task.kind !== 'CREATE_PHASE2')
            return null;
        if (task.status !== 'PAUSED' && task.status !== 'PAUSE_REQUESTED')
            return null;
        return task;
    })();
    let taskId = '';
    let abortSignal: AbortSignal | undefined;
    if (resumeTask) {
        const resumed = input.taskController.resumeTask(resumeTask.id, worldStudioMessage('task.resumingSynthesize', 'Resuming synthesize task'));
        if (!resumed) {
            input.setError('WORLD_STUDIO_TASK_RESUME_FAILED: synthesize task cannot resume.');
            return;
        }
        taskId = resumeTask.id;
        abortSignal = input.taskController.getAbortSignal(taskId) || undefined;
        diagLog('Phase2 task resumed', { taskId });
    }
    else {
        const started = input.taskController.startTask({
            kind: 'CREATE_PHASE2',
            label: worldStudioMessage('task.synthesizeDraftLabel', 'Synthesize world draft'),
            atomic: false,
            resumable: false,
            canPause: false,
            canCancel: true,
            step: 'SYNTHESIZE',
            message: worldStudioMessage('task.synthesizeStarted', 'Synthesize started'),
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
        message: worldStudioMessage('task.generatingPublishReadyDraft', 'Generating publish-ready draft'),
    });
    input.taskController.setCheckpoint(taskId, {
        step: 'SYNTHESIZE',
        chunkTotal: input.snapshot.parseJob.chunkTotal || 0,
        chunkCompleted: input.snapshot.parseJob.chunkCompleted || 0,
        chunkFailed: input.snapshot.parseJob.chunkFailed || 0,
        payload: {
            selectedStartTimeId,
            selectedCharacters,
        },
    });
    try {
        const runtimeDefaultBinding = await input.resolveRuntimeDefaultRouteBinding();
        const binding = input.bindingMap.fine || input.bindingMap.coarse || runtimeDefaultBinding || null;
        diagLog('Phase2 generateText start', {
            taskId,
            routeSource: binding?.source || null,
            routeModel: binding?.model || null,
            routeConnectorId: binding?.connectorId || null,
        });
        const result = await runPhase2DraftGeneration(input.aiClient, {
            selectedStartTimeId,
            selectedCharacters,
            knowledgeGraph: projectedKnowledgeGraph,
            finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
        }, {
            binding: binding || undefined,
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
            finalDraftAccumulator: {
                hasAccumulator: Boolean(result.finalDraftAccumulator),
                worldKeys: Object.keys(asRecord(result.finalDraftAccumulator?.world || {})),
                worldviewKeys: Object.keys(asRecord(result.finalDraftAccumulator?.worldview || {})),
                worldLorebooks: Array.isArray(result.finalDraftAccumulator?.worldLorebooks)
                    ? result.finalDraftAccumulator?.worldLorebooks.length
                    : 0,
                futureHistoricalEvents: Array.isArray(result.finalDraftAccumulator?.futureHistoricalEvents)
                    ? result.finalDraftAccumulator?.futureHistoricalEvents.length
                    : 0,
                agentDrafts: Object.keys(asRecord(result.finalDraftAccumulator?.agentDraftsByCharacter || {})),
                revisions: Array.isArray(result.finalDraftAccumulator?.revisions)
                    ? result.finalDraftAccumulator?.revisions.length
                    : 0,
            },
        });
        diagLog('Phase2 dna presence audit', {
            taskId,
            selectedCharacters,
            agentDraftHasDna: (result.agentDrafts || []).map((draft) => ({
                name: draft.characterName,
                hasDna: Boolean(draft.dna && typeof draft.dna === 'object'),
                dnaKeys: draft.dna && typeof draft.dna === 'object' ? Object.keys(draft.dna) : [],
                hasDnaPrimary: typeof draft.dnaPrimary === 'string' && draft.dnaPrimary.trim().length > 0,
            })),
        });
        input.setPhase2(result);
        const normalizedWorld = {
            ...asRecord(result.world),
        };
        const normalizedWorldview = {
            ...asRecord(result.worldview),
        };
        const legacyWorldRules = asRecord(normalizedWorld.rules);
        if (Object.keys(legacyWorldRules).length > 0) {
            const currentCoreSystem = asRecord(normalizedWorldview.coreSystem);
            normalizedWorldview.coreSystem = {
                ...currentCoreSystem,
                rules: Object.keys(asRecord(currentCoreSystem.rules)).length > 0
                    ? currentCoreSystem.rules
                    : legacyWorldRules,
            };
            delete normalizedWorld.rules;
        }
        // Phase 2 worldEvents are discarded — Phase 1 extraction is the source of truth for events.
        // Phase 2 LLM tends to compress/lose events, so we preserve Phase 1 results.
        const draftsByCharacter = (result.agentDrafts || []).reduce((acc, item) => {
            const name = String(item.characterName || '').trim();
            if (!name)
                return acc;
            // Keep explicit dna key (even undefined) so downstream merge can distinguish
            // "this run has no dna" from "no update provided".
            acc[name] = {
                ...item,
                dna: item.dna,
            };
            return acc;
        }, {} as Record<string, typeof result.agentDrafts[number]>);
        const missingDnaCharacters = selectedCharacters.filter((name) => {
            const draft = draftsByCharacter[name];
            return !(draft && draft.dna && typeof draft.dna === 'object');
        });
        const preservedProjectedFutureEvents = (projectedKnowledgeGraph.futureHistoricalEvents || [])
            .filter((item) => {
            return String(asRecord(item).projectionKind || '') === START_TIME_PROJECTED_FUTURE_EVENT_KIND;
        })
            .map((item) => asRecord(item));
        const synthesizedFutureHistoricalEvents = Array.isArray(result.futureHistoricalEvents)
            ? result.futureHistoricalEvents
                .filter((item) => item && typeof item === 'object')
                .map((item) => asRecord(item))
            : [];
        const nextKnowledgeFutureEvents = [
            ...preservedProjectedFutureEvents,
            ...synthesizedFutureHistoricalEvents,
        ];
        // >>> DIAG: remove after debugging <<<
        try {
            emitWorldStudioLog({
                level: 'error',
                message: '[MODS-TEST-DIAG] Phase2 complete: writing agentSync.draftsByCharacter',
                source: 'DIAG',
                details: {
                    agentDraftCount: (result.agentDrafts || []).length,
                    agentDraftNames: (result.agentDrafts || []).map((d) => d.characterName),
                    agentDraftHasDna: (result.agentDrafts || []).map((d) => ({ name: d.characterName, hasDna: Boolean(d.dna), dnaKeys: d.dna && typeof d.dna === 'object' ? Object.keys(d.dna) : [] })),
                    agentDraftFieldCoverage: (result.agentDrafts || []).map((d) => ({
                        // Keep diagnostics stable across canonical rules object shape.
                        ruleCount: (() => {
                            const ruleLines = asRecord(d.rules).lines;
                            return Array.isArray(ruleLines) ? ruleLines.length : 0;
                        })(),
                        name: d.characterName,
                        fields: Object.keys(asRecord(d)).sort(),
                        hasDescription: typeof d.description === 'string' && d.description.trim().length > 0,
                        hasScenario: typeof d.scenario === 'string' && d.scenario.trim().length > 0,
                        hasGreeting: typeof d.greeting === 'string' && d.greeting.trim().length > 0,
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
        }
        catch {
            // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
        }
        input.patchSnapshot({
            worldPatch: normalizedWorld,
            worldviewPatch: normalizedWorldview,
            // eventsDraft: preserved from Phase 1 — not overwritten by Phase 2
            lorebooksDraft: Array.isArray(result.worldLorebooks)
                ? result.worldLorebooks.filter((item) => item && typeof item === 'object') as WorldLorebookDraftRow[]
                : [],
            futureEventsText: JSON.stringify(synthesizedFutureHistoricalEvents, null, 2),
            knowledgeGraph: {
                ...projectedKnowledgeGraph,
                // events: preserved from Phase 1 — not overwritten by Phase 2
                futureHistoricalEvents: nextKnowledgeFutureEvents,
            },
            finalDraftAccumulator: result.finalDraftAccumulator || input.snapshot.finalDraftAccumulator,
            unsavedChangesByPanel: {
                base: true,
                worldview: true,
                worldEvents: true,
                lorebooks: true,
                agentRegistry: false,
                agentEditor: false,
                worldAssets: false,
                agentAssets: false,
                releaseDrafts: false,
                releasePublish: false,
                releaseHistory: false,
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
            selectedCharacters,
            draftsByCharacterKeys: Object.keys(draftsByCharacter),
            missingDnaCharacters,
            lorebooksDraftCount: Array.isArray(result.worldLorebooks)
                ? result.worldLorebooks.filter((item) => item && typeof item === 'object').length
                : 0,
        });
        const completionNotice = missingDnaCharacters.length > 0
            ? worldStudioMessage('notice.synthesizeCompletedMissingDna', 'Synthesize completed, but missing DNA for: {{characters}}', { characters: missingDnaCharacters.join(', ') })
            : worldStudioMessage('notice.synthesizeCompletedReady', 'Synthesize completed. Draft editor is ready.');
        const completionBanner = missingDnaCharacters.length > 0
            ? {
                kind: 'warning' as const,
                message: worldStudioMessage('banner.synthesizeCompletedWithDnaGaps', 'Synthesize completed with DNA gaps'),
            }
            : {
                kind: 'success' as const,
                message: worldStudioMessage('banner.synthesizeCompleted', 'Synthesize completed'),
            };
        input.setNotice(completionNotice);
        input.setStatusBanner(completionBanner);
        input.taskController.completeTask(taskId, worldStudioMessage('task.synthesizeCompleted', 'Synthesize completed'));
        diagLog('Phase2 COMPLETE', { taskId });
        void rebuildEmbeddingIndex(input, Array.isArray(result.worldLorebooks)
            ? result.worldLorebooks.filter((item) => item && typeof item === 'object') as WorldLorebookDraftRow[]
            : undefined)
            .then((embeddingResult) => {
            if (!embeddingResult.ok) {
                const embeddingNotice = worldStudioMessage('notice.embeddingNeedsAttention', 'Embedding index needs attention: {{detail}}', { detail: embeddingResult.embeddingIndex.errorMessage || 'build failed' });
                input.setNotice(missingDnaCharacters.length > 0
                    ? `${completionNotice} ${embeddingNotice}`
                    : embeddingNotice);
                input.setStatusBanner({
                    kind: 'warning',
                    message: missingDnaCharacters.length > 0
                        ? worldStudioMessage('banner.synthesizeCompletedWithDnaGapsAndEmbeddingAttention', 'Synthesize completed with DNA gaps and embedding attention needed')
                        : (embeddingResult.embeddingIndex.errorMessage || worldStudioMessage('notice.embeddingFailed', 'Embedding index build failed.')),
                });
            }
        })
            .catch((error) => {
            input.patchSnapshot({
                embeddingIndex: {
                    ...input.snapshot.embeddingIndex,
                    status: 'failed',
                    errorMessage: error instanceof Error ? error.message : String(error || 'WORLD_STUDIO_EMBEDDING_BUILD_FAILED'),
                },
            });
        });
    }
    catch (runError) {
        if (abortSignal?.aborted || input.taskController.shouldCancel(taskId)) {
            input.patchSnapshot({
                parseJob: {
                    phase: 'failed',
                    updatedAt: new Date().toISOString(),
                },
            });
            input.taskController.cancelTask(taskId, worldStudioMessage('task.synthesizeCanceled', 'Synthesize canceled'));
            input.setNotice(worldStudioMessage('notice.synthesizeCanceled', 'Synthesize canceled.'));
            input.setStatusBanner({
                kind: 'warning',
                message: worldStudioMessage('banner.synthesizeCanceled', 'Synthesize canceled'),
            });
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
