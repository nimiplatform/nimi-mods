import { useCallback } from 'react';
import type { WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot } from '../contracts.js';
import type { WorldStudioQueries } from './actions/create/types.js';
import {
  reloadRemoteForConflict as reloadRemoteForConflictAction,
  type WorldStudioConflictActionContext,
} from './actions/conflict/reload-remote.js';

type UseWorldStudioConflictActionsInput = {
  selectedWorldId: string;
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  queries: WorldStudioQueries;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setConflictReloadSummary: (value: string | null) => void;
  lastHydratedWorldIdRef: { current: string };
};

export function useWorldStudioConflictActions(input: UseWorldStudioConflictActionsInput) {
  const context: WorldStudioConflictActionContext = input;

  const onReloadRemoteForConflict = useCallback(async () => {
    await reloadRemoteForConflictAction(context);
  }, [context]);

  return {
    onReloadRemoteForConflict,
  };
}
