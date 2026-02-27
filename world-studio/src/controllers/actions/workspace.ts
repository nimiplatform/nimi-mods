import { useCallback } from 'react';
import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { evaluateQualityGate } from '../../engine/quality-gate.js';
import { toStartTimeOptions } from '../../engine/merge.js';
import { fallbackCharacterCandidates, fallbackStartTimeOptions } from '../../generation/phase1/heuristic-fallback.js';
import { toUniqueStringArray } from '../../services/snapshot-normalize.js';
import { projectEventsForSelectedStartTime } from '../../services/start-time-projection.js';
import { buildStartTimeOptionsFromEvents } from '../../services/temporal-order.js';
import { buildPhase1ArtifactFromResult } from '../../services/phase1-artifact.js';
import type { WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import type { Phase1Result, Phase2Result } from '../../generation/pipeline.js';

type UseWorldStudioWorkspaceControllerActionsInput = {
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  setPhase1: (value: Phase1Result | null) => void;
  setPhase2: (value: Phase2Result | null) => void;
  setSourceMode: (mode: 'TEXT' | 'FILE') => void;
  setFilePreviewText: (value: string) => void;
  setConflictReloadSummary: (value: string | null) => void;
  sourceChunksRef: { current: string[] };
  sourceRawTextRef: { current: string };
  resetSnapshot: () => void;
  remoteMaintenanceSnapshotVersion: string;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
};

export function useWorldStudioWorkspaceControllerActions(
  input: UseWorldStudioWorkspaceControllerActionsInput,
) {
  const onRefreshPhase1QualityGate = useCallback(() => {
    const graph = {
      ...input.snapshot.knowledgeGraph,
      events: input.snapshot.eventsDraft,
    };
    const temporalOptions = buildStartTimeOptionsFromEvents(graph.events);
    const timelineOptions = toStartTimeOptions(graph.timeline as Array<Record<string, unknown>>);
    const startTimeOptions = temporalOptions.length > 0
      ? temporalOptions
      : (timelineOptions.length > 0 ? timelineOptions : fallbackStartTimeOptions(graph));
    const characterCandidates = fallbackCharacterCandidates(graph, input.snapshot.sourceText);
    const candidateNameSet = new Set(characterCandidates.map((item) => item.name));
    const currentSelectedCharacters = input.snapshot.selectedCharacters
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
    const selectedCharacters = (() => {
      if (candidateNameSet.size === 0) return toUniqueStringArray(currentSelectedCharacters);
      const filtered = currentSelectedCharacters.filter((item) => candidateNameSet.has(item));
      if (filtered.length > 0) return toUniqueStringArray(filtered);
      return characterCandidates.slice(0, 6).map((item) => item.name);
    })();
    const currentAgentSyncSelected = input.snapshot.agentSync.selectedCharacterIds
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
    const selectedAgentSyncCharacters = (() => {
      if (candidateNameSet.size === 0) return toUniqueStringArray(currentAgentSyncSelected);
      const filtered = currentAgentSyncSelected.filter((item) => candidateNameSet.has(item));
      if (filtered.length > 0) return toUniqueStringArray(filtered);
      return toUniqueStringArray(selectedCharacters);
    })();
    const selectedStartTimeId = startTimeOptions.some((item) => item.id === input.snapshot.selectedStartTimeId)
      ? input.snapshot.selectedStartTimeId
      : (startTimeOptions[0]?.id || '');
    const projection = projectEventsForSelectedStartTime({
      selectedStartTimeId,
      startTimeOptions,
      timeline: graph.timeline as Array<Record<string, unknown>>,
      events: input.snapshot.eventsDraft,
      futureHistoricalEvents: graph.futureHistoricalEvents || [],
    });
    const projectedKnowledgeGraph = {
      ...graph,
      events: projection.events,
      futureHistoricalEvents: projection.futureHistoricalEvents,
    };
    const artifactMetrics = input.snapshot.phase1Artifact?.qualityGate.metrics;
    const inferredTotalChunks = Math.max(
      Number(artifactMetrics?.totalChunks) || 0,
      Number(input.snapshot.parseJob.chunkTotal) || 0,
      (Number(input.snapshot.parseJob.chunkCompleted) || 0) + (Number(input.snapshot.parseJob.chunkFailed) || 0),
    );
    const totalChunks = Math.max(1, inferredTotalChunks || 1);
    const inferredSuccessChunks = Math.max(
      Number(artifactMetrics?.successChunks) || 0,
      Number(input.snapshot.parseJob.chunkCompleted) || 0,
    );
    const successChunks = Math.max(0, Math.min(totalChunks, inferredSuccessChunks));
    const qualityGate = evaluateQualityGate({
      graph: projectedKnowledgeGraph,
      totalChunks,
      successChunks,
    });
    const nextPhase1: Phase1Result = {
      startTimeOptions,
      characterCandidates,
      knowledgeGraph: projectedKnowledgeGraph,
      finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
      qualityGate,
      chunkTasks: input.snapshot.phase1Artifact?.chunkTasks || [],
      rawText: JSON.stringify({
        refreshedFromCheckpoints: true,
        refreshedAt: new Date().toISOString(),
        qualityGateStatus: qualityGate.status,
      }),
    };
    const nextArtifact = buildPhase1ArtifactFromResult({
      result: nextPhase1,
      sourceDigest: String(input.snapshot.phase1Artifact?.sourceDigest || 'checkpoint-refresh'),
    });
    input.setPhase1(nextPhase1);
    input.patchSnapshot({
      selectedStartTimeId,
      selectedCharacters,
      phase1Artifact: nextArtifact,
      agentSync: {
        ...input.snapshot.agentSync,
        selectedCharacterIds: selectedAgentSyncCharacters,
      },
      knowledgeGraph: projectedKnowledgeGraph,
      eventsDraft: projection.events,
      futureEventsText: JSON.stringify(projection.futureHistoricalEvents || [], null, 2),
      eventGraphLayout: {
        selectedEventId: String(
          projection.events.primary[0]?.id
          || projection.events.secondary[0]?.id
          || '',
        ),
        expandedPrimaryIds: projection.events.primary[0]?.id
          ? [String(projection.events.primary[0].id)]
          : [],
      },
      unsavedChangesByPanel: {
        ...input.snapshot.unsavedChangesByPanel,
        events: true,
      },
    });
    input.setError(null);
    input.setNotice(`Quality gate refreshed: ${qualityGate.status}.`);
  }, [input]);

  const onTimeFlowRatioChange = useCallback((value: string) => {
    const numeric = Number(value);
    input.patchSnapshot({
      worldPatch: {
        ...input.snapshot.worldPatch,
        timeFlowRatio: Number.isFinite(numeric) ? numeric : 1,
      },
    });
  }, [input]);

  const onCurrentTimeNodeChange = useCallback((value: string) => {
    const timeModel = asRecord(input.snapshot.worldviewPatch.timeModel);
    input.patchSnapshot({
      worldviewPatch: {
        ...input.snapshot.worldviewPatch,
        timeModel: {
          ...timeModel,
          currentNode: value,
        },
      },
    });
  }, [input]);

  const onFutureEventsTextChange = useCallback((value: string) => {
    input.patchSnapshot({ futureEventsText: value });
  }, [input]);

  const onToggleAgentSyncCharacter = useCallback((name: string, checked: boolean) => {
    const current = input.snapshot.agentSync.selectedCharacterIds;
    input.patchSnapshot({
      agentSync: {
        ...input.snapshot.agentSync,
        selectedCharacterIds: checked
          ? toUniqueStringArray([...current, name])
          : current.filter((item) => item !== name),
      },
    });
  }, [input]);

  const onAgentDraftChange = useCallback((name: string, patch: Partial<WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'][string]>) => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return;
    const existing = input.snapshot.agentSync.draftsByCharacter[normalizedName] || {
      characterName: normalizedName,
      handle: '',
      concept: '',
      backstory: '',
      coreValues: '',
      relationshipStyle: '',
      description: null,
      scenario: null,
      greeting: null,
      exampleDialogue: null,
      systemPromptBase: null,
      rules: {
        format: 'rule-lines-v1',
        lines: [],
        text: '',
      },
      postHistoryInstructions: null,
      alternateGreetings: [],
      agentLorebooks: [],
    };
    input.patchSnapshot({
      agentSync: {
        ...input.snapshot.agentSync,
        draftsByCharacter: {
          ...input.snapshot.agentSync.draftsByCharacter,
          [normalizedName]: {
            ...existing,
            ...patch,
            characterName: normalizedName,
          },
        },
      },
    });
  }, [input]);

  const onResetDraft = useCallback(() => {
    input.resetSnapshot();
    input.setPhase1(null);
    input.setPhase2(null);
    input.setSourceMode('TEXT');
    input.setFilePreviewText('');
    input.setConflictReloadSummary(null);
    input.sourceChunksRef.current = [];
    input.sourceRawTextRef.current = '';
  }, [input]);

  const onAdoptRemoteSnapshot = useCallback(() => {
    input.patchSnapshot({
      editorSnapshotVersion: input.remoteMaintenanceSnapshotVersion,
    });
    input.setError(null);
    input.setNotice('Adopted remote snapshot version. Retry save/sync when ready.');
  }, [input]);

  return {
    onRefreshPhase1QualityGate,
    onTimeFlowRatioChange,
    onCurrentTimeNodeChange,
    onFutureEventsTextChange,
    onToggleAgentSyncCharacter,
    onAgentDraftChange,
    onResetDraft,
    onAdoptRemoteSnapshot,
  };
}
