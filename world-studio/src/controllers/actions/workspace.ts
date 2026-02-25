import { useCallback } from 'react';
import { asRecord } from '@nimiplatform/mod-sdk/utils';
import { toUniqueStringArray } from '../../services/snapshot-normalize.js';
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
      rules: [],
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
    onTimeFlowRatioChange,
    onCurrentTimeNodeChange,
    onFutureEventsTextChange,
    onToggleAgentSyncCharacter,
    onAgentDraftChange,
    onResetDraft,
    onAdoptRemoteSnapshot,
  };
}
