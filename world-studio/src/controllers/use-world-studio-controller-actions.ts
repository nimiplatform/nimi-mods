import { useCallback } from 'react';
import { useWorldStudioResourceQueries } from '../hooks/use-world-studio-queries.js';
import { useWorldStudioMutations } from '../hooks/use-world-studio-mutations.js';
import { useWorldStudioCreateActions } from '../hooks/use-world-studio-create-actions.js';
import { useWorldStudioMaintainActions } from '../hooks/use-world-studio-maintain-actions.js';
import { useWorldStudioConflictActions } from '../hooks/use-world-studio-conflict-actions.js';
import type {
  WorldStudioCreateActionsInput,
} from '../hooks/actions/create/types.js';
import type {
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import { useWorldStudioWorkspaceControllerActions } from './actions/workspace.js';
import { useWorldStudioTaskController } from '../hooks/actions/task-control/controller.js';
import { emitWorldStudioLog } from '../logging.js';

type WorldStudioResourceQueries = ReturnType<typeof useWorldStudioResourceQueries>;
type WorldStudioMutations = ReturnType<typeof useWorldStudioMutations>;

type UseWorldStudioControllerActionsInput = {
  create: Omit<WorldStudioCreateActionsInput, 'taskController'>;
  maintain: {
    flowId: string;
    selectedWorldId: string;
    eventSyncMode: 'merge' | 'replace';
    eventsGraph: WorldStudioWorkspaceSnapshot['eventsDraft'];
    snapshot: WorldStudioWorkspaceSnapshot;
    patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
    mutations: WorldStudioMutations;
    queries: WorldStudioResourceQueries;
    setStatusBanner: (input: {
      kind: 'success' | 'warn' | 'info' | 'error';
      message: string;
    }) => void;
    setError: (value: string | null) => void;
    setNotice: (value: string | null) => void;
  };
  conflict: {
    selectedWorldId: string;
    snapshot: WorldStudioWorkspaceSnapshot;
    patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
    queries: WorldStudioResourceQueries;
    setError: (value: string | null) => void;
    setNotice: (value: string | null) => void;
    setConflictReloadSummary: (value: string | null) => void;
    lastHydratedWorldIdRef: { current: string };
  };
  workspace: {
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
    maintenanceEditorSnapshotVersion: string;
    setError: (value: string | null) => void;
    setNotice: (value: string | null) => void;
  };
};

export function useWorldStudioControllerActions(input: UseWorldStudioControllerActionsInput) {
  const taskController = useWorldStudioTaskController({
    snapshot: input.workspace.snapshot,
    patchSnapshot: input.workspace.patchSnapshot,
    onTaskEvent: (event) => {
      emitWorldStudioLog({
        level: event.name === 'failed' ? 'error' : 'info',
        message: `world-studio:task:${event.name}`,
        flowId: input.create.flowId,
        source: 'useWorldStudioControllerActions.taskController',
        details: {
          taskId: event.taskId,
          taskKind: event.taskKind,
          checkpointVersion: event.checkpointVersion,
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        },
      });
    },
  });

  const createActions = useWorldStudioCreateActions({
    ...input.create,
    taskController,
  });

  const remoteMaintenanceSnapshotVersion = String(
    input.workspace.maintenanceEditorSnapshotVersion
    || input.workspace.snapshot.editorSnapshotVersion
    || '',
  );

  const workspaceActions = useWorldStudioWorkspaceControllerActions({
    snapshot: input.workspace.snapshot,
    patchSnapshot: input.workspace.patchSnapshot,
    setPhase1: input.workspace.setPhase1,
    setPhase2: input.workspace.setPhase2,
    setSourceMode: input.workspace.setSourceMode,
    setFilePreviewText: input.workspace.setFilePreviewText,
    setConflictReloadSummary: input.workspace.setConflictReloadSummary,
    sourceChunksRef: input.workspace.sourceChunksRef,
    sourceRawTextRef: input.workspace.sourceRawTextRef,
    resetSnapshot: input.workspace.resetSnapshot,
    remoteMaintenanceSnapshotVersion,
    setError: input.workspace.setError,
    setNotice: input.workspace.setNotice,
  });

  const maintainActions = useWorldStudioMaintainActions({
    ...input.maintain,
    taskController,
  });

  const conflictActions = useWorldStudioConflictActions(input.conflict);

  const startTask = useCallback((taskInput: Parameters<typeof taskController.startTask>[0]) => {
    return taskController.startTask(taskInput);
  }, [taskController]);

  const pauseTask = useCallback(() => {
    const activeTask = taskController.getActiveTask();
    if (!activeTask) return false;
    return taskController.requestPause(activeTask.id);
  }, [taskController]);

  const resumeTask = useCallback(async () => {
    const activeTask = taskController.getActiveTask();
    if (!activeTask) return false;
    if (!activeTask.canResume) return false;
    if (activeTask.kind === 'CREATE_PHASE1') {
      await createActions.onRunPhase1('all', null, {
        taskId: activeTask.id,
        resume: true,
      });
      return true;
    }
    if (activeTask.kind === 'CREATE_PHASE2') {
      await createActions.onRunPhase2({
        taskId: activeTask.id,
        resume: true,
      });
      return true;
    }
    return taskController.resumeTask(activeTask.id, 'Resume requested');
  }, [createActions, taskController]);

  const cancelTask = useCallback(() => {
    const activeTask = taskController.getActiveTask();
    if (!activeTask) return false;
    return taskController.requestCancel(activeTask.id);
  }, [taskController]);

  const setExpertMode = useCallback((value: boolean) => {
    taskController.setExpertMode(value);
  }, [taskController]);

  return {
    ...createActions,
    ...workspaceActions,
    ...maintainActions,
    ...conflictActions,
    startTask,
    pauseTask,
    resumeTask,
    cancelTask,
    setExpertMode,
  };
}
