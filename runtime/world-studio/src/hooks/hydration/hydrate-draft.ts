import { useEffect } from 'react';
import type { EventNodeDraft, WorldLorebookDraftRow, WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot, } from '../../contracts.js';
import { getWorldDraft } from '../../data.js';
import { emitWorldStudioLog } from '../../logging.js';
import { asRecord, type HookClient } from "@nimiplatform/sdk/mod";
export type WorldStudioDraftHydrationInput = {
    hookClient: HookClient;
    selectedDraftId: string;
    patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
    snapshot: WorldStudioWorkspaceSnapshot;
    setSourceMode: (mode: 'TEXT' | 'FILE') => void;
    setFilePreviewText: (value: string) => void;
    sourceChunksRef: {
        current: string[];
    };
    sourceRawTextRef: {
        current: string;
    };
    setError: (value: string) => void;
    lastHydratedDraftIdRef: {
        current: string;
    };
};
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
export function useWorldStudioDraftHydration(input: WorldStudioDraftHydrationInput): void {
    useEffect(() => {
        if (!input.selectedDraftId) {
            // Allow re-hydrating the same draft after "Start New Draft" resets workspace state.
            input.lastHydratedDraftIdRef.current = '';
            return;
        }
        if (input.selectedDraftId === input.lastHydratedDraftIdRef.current)
            return;
        diagLog('hydrate-draft triggered', {
            selectedDraftId: input.selectedDraftId,
            lastHydratedDraftId: input.lastHydratedDraftIdRef.current || null,
        });
        let active = true;
        void (async () => {
            try {
                const draft = asRecord(await getWorldDraft(input.hookClient, input.selectedDraftId));
                if (!active)
                    return;
                diagLog('hydrate-draft loaded draft', {
                    draftId: String(draft.id || input.selectedDraftId),
                    targetWorldId: String(draft.targetWorldId || ''),
                    status: String(draft.status || ''),
                    sourceType: String(draft.sourceType || ''),
                });
                const payload = asRecord(draft.draftPayload);
                const pipelineState = asRecord(draft.pipelineState);
                const payloadFinalDraftAccumulator = asRecord(payload.finalDraftAccumulator);
                const payloadAgentSync = asRecord(payload.agentSync);
                const payloadAgentDraftsByCharacter = asRecord(payloadAgentSync.draftsByCharacter);
                const payloadAgentSyncSelectedCharacterIds = Array.isArray(payloadAgentSync.selectedCharacterIds)
                    ? payloadAgentSync.selectedCharacterIds.map((item) => String(item || '')).filter(Boolean)
                    : [];
                const pipelineSelectedCharacters = Array.isArray(pipelineState.selectedCharacters)
                    ? pipelineState.selectedCharacters.map((item) => String(item || '')).filter(Boolean)
                    : [];
                const selectedCharacterIds = payloadAgentSyncSelectedCharacterIds.length > 0
                    ? payloadAgentSyncSelectedCharacterIds
                    : pipelineSelectedCharacters;
                const futureHistoricalEvents = Array.isArray(payload.futureHistoricalEvents)
                    ? (payload.futureHistoricalEvents as Array<Record<string, unknown>>)
                    : [];
                const eventsRoot = asRecord(payload.events);
                const primaryEvents = Array.isArray(eventsRoot.primary)
                    ? (eventsRoot.primary as Array<Record<string, unknown>>)
                    : [];
                const secondaryEvents = Array.isArray(eventsRoot.secondary)
                    ? (eventsRoot.secondary as Array<Record<string, unknown>>)
                    : [];
                diagLog('hydrate-draft payload summary', {
                    draftId: String(draft.id || input.selectedDraftId),
                    payloadKeys: Object.keys(payload),
                    pipelineStateKeys: Object.keys(pipelineState),
                    selectedCharactersCount: selectedCharacterIds.length,
                    selectedCharacterIds,
                    payloadAgentSyncSelectedCharacterIds,
                    pipelineSelectedCharacters,
                    existingSnapshotSelectedCharacters: input.snapshot.selectedCharacters,
                    existingSnapshotAgentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
                    primaryEvents: primaryEvents.length,
                    secondaryEvents: secondaryEvents.length,
                    hasAgentSync: Object.keys(payloadAgentSync).length > 0,
                    hasFinalDraftAccumulator: Object.keys(payloadFinalDraftAccumulator).length > 0,
                    finalDraftAccumulatorSummary: {
                        worldKeys: Object.keys(asRecord(payloadFinalDraftAccumulator.world || {})),
                        worldviewKeys: Object.keys(asRecord(payloadFinalDraftAccumulator.worldview || {})),
                        worldLorebookCount: Array.isArray(payloadFinalDraftAccumulator.worldLorebooks)
                            ? payloadFinalDraftAccumulator.worldLorebooks.length
                            : 0,
                        futureHistoricalEventCount: Array.isArray(payloadFinalDraftAccumulator.futureHistoricalEvents)
                            ? payloadFinalDraftAccumulator.futureHistoricalEvents.length
                            : 0,
                        agentDraftKeys: Object.keys(asRecord(payloadFinalDraftAccumulator.agentDraftsByCharacter)),
                        revisionCount: Array.isArray(payloadFinalDraftAccumulator.revisions)
                            ? payloadFinalDraftAccumulator.revisions.length
                            : 0,
                        lastUpdatedChunk: Number(payloadFinalDraftAccumulator.lastUpdatedChunk || -1),
                    },
                    agentDraftKeys: Object.keys(payloadAgentDraftsByCharacter),
                    agentDraftFieldCoverage: Object.entries(payloadAgentDraftsByCharacter).map(([name, draftValue]) => {
                        const draftRecord = asRecord(draftValue);
                        const ruleLines = asRecord(draftRecord.rules).lines;
                        return {
                            name,
                            fields: Object.keys(draftRecord).sort(),
                            hasDna: Boolean(draftRecord.dna && typeof draftRecord.dna === 'object'),
                            ruleCount: Array.isArray(ruleLines) ? ruleLines.length : 0,
                            agentLorebookCount: Array.isArray(draftRecord.agentLorebooks) ? draftRecord.agentLorebooks.length : 0,
                        };
                    }),
                });
                input.patchSnapshot({
                    sourceRef: String(draft.sourceRef || ''),
                    selectedStartTimeId: String(pipelineState.selectedStartTimeId || ''),
                    selectedCharacters: Array.isArray(pipelineState.selectedCharacters)
                        ? pipelineState.selectedCharacters.map((item) => String(item || ''))
                        : [],
                    worldPatch: asRecord(payload.world),
                    worldviewPatch: asRecord(payload.worldview),
                    eventsDraft: {
                        primary: primaryEvents as EventNodeDraft[],
                        secondary: secondaryEvents as EventNodeDraft[],
                    },
                    lorebooksDraft: (() => {
                        const raw = payload.worldLorebooks;
                        return Array.isArray(raw)
                            ? (raw as unknown[]).filter((item) => item && typeof item === 'object') as WorldLorebookDraftRow[]
                            : [];
                    })(),
                    futureEventsText: JSON.stringify(futureHistoricalEvents, null, 2),
                    knowledgeGraph: {
                        ...input.snapshot.knowledgeGraph,
                        events: {
                            primary: primaryEvents as EventNodeDraft[],
                            secondary: secondaryEvents as EventNodeDraft[],
                        },
                        futureHistoricalEvents,
                    },
                    finalDraftAccumulator: payloadFinalDraftAccumulator as WorldStudioWorkspaceSnapshot['finalDraftAccumulator'],
                    eventGraphLayout: {
                        selectedEventId: String(primaryEvents[0]?.id || secondaryEvents[0]?.id || ''),
                        expandedPrimaryIds: primaryEvents[0]?.id ? [String(primaryEvents[0].id)] : [],
                    },
                    unsavedChangesByPanel: {
                        world: false,
                        worldview: false,
                        events: false,
                        lorebooks: false,
                    },
                    agentSync: {
                        ...input.snapshot.agentSync,
                        selectedCharacterIds,
                        ownershipType: 'WORLD_OWNED',
                        targetWorldId: String(payloadAgentSync.targetWorldId
                            || draft.targetWorldId
                            || ''),
                        draftsByCharacter: payloadAgentDraftsByCharacter as WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'],
                    },
                    createStep: 'DRAFT',
                });
                input.setSourceMode('TEXT');
                input.setFilePreviewText('');
                input.sourceChunksRef.current = [];
                input.sourceRawTextRef.current = '';
                input.lastHydratedDraftIdRef.current = input.selectedDraftId;
                diagLog('hydrate-draft applied snapshot', {
                    selectedDraftId: input.selectedDraftId,
                    selectedCharacters: selectedCharacterIds,
                    agentDraftKeys: Object.keys(payloadAgentDraftsByCharacter),
                    snapshotAgentDraftCoverage: Object.entries(payloadAgentDraftsByCharacter).map(([name, draftValue]) => {
                        const draftRecord = asRecord(draftValue);
                        return {
                            name,
                            hasDescription: typeof draftRecord.description === 'string' && draftRecord.description.trim().length > 0,
                            hasScenario: typeof draftRecord.scenario === 'string' && draftRecord.scenario.trim().length > 0,
                            hasGreeting: typeof draftRecord.greeting === 'string' && draftRecord.greeting.trim().length > 0,
                            hasDna: Boolean(draftRecord.dna && typeof draftRecord.dna === 'object'),
                            agentLorebookCount: Array.isArray(draftRecord.agentLorebooks) ? draftRecord.agentLorebooks.length : 0,
                        };
                    }),
                });
            }
            catch (loadError) {
                if (!active)
                    return;
                diagLog('hydrate-draft failed', {
                    selectedDraftId: input.selectedDraftId,
                    error: loadError instanceof Error ? loadError.message : String(loadError),
                });
                input.setError(loadError instanceof Error ? loadError.message : String(loadError));
            }
        })();
        return () => {
            active = false;
        };
    }, [
        input.hookClient,
        input.lastHydratedDraftIdRef,
        input.patchSnapshot,
        input.selectedDraftId,
        input.setError,
        input.setFilePreviewText,
        input.setSourceMode,
        input.snapshot.knowledgeGraph,
        input.sourceChunksRef,
        input.sourceRawTextRef,
    ]);
}
