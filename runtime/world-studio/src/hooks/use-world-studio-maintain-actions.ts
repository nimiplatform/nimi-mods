import { useCallback } from 'react';
import type {
  EventNodeDraft,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type {
  StatusBannerInput,
  WorldStudioMutations,
  WorldStudioQueries,
} from './actions/create/types.js';
import type { WorldStudioMaintainActionContext } from './actions/maintain/types.js';
import type { WorldStudioTaskController } from './actions/task-control/types.js';
import { refreshResources as refreshResourcesAction } from './actions/maintain/refresh-resources.js';
import { saveMaintenance as saveMaintenanceAction } from './actions/maintain/save-maintenance.js';
import { syncLorebooks as syncLorebooksAction } from './actions/maintain/sync-lorebooks.js';
import { syncEvents as syncEventsAction } from './actions/maintain/sync-events.js';
import { deleteFirstEvent as deleteFirstEventAction } from './actions/maintain/delete-first-event.js';
import { deleteFirstLorebook as deleteFirstLorebookAction } from './actions/maintain/delete-first-lorebook.js';

type UseWorldStudioMaintainActionsInput = {
  flowId: string;
  selectedWorldId: string;
  eventSyncMode: 'merge' | 'replace';
  eventsGraph: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  mutations: WorldStudioMutations;
  queries: WorldStudioQueries;
  setStatusBanner: (input: StatusBannerInput) => void;
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
  taskController: WorldStudioTaskController;
};

export function useWorldStudioMaintainActions(input: UseWorldStudioMaintainActionsInput) {
  const context: WorldStudioMaintainActionContext = input;

  const refreshResources = useCallback(async () => {
    await refreshResourcesAction(context);
  }, [context]);

  const onSaveMaintenance = useCallback(async (payload?: { force?: boolean; taskId?: string }) => {
    await saveMaintenanceAction(context, payload);
  }, [context]);

  const onSyncLorebooks = useCallback(async (payload?: { taskId?: string }) => {
    await syncLorebooksAction(context, payload);
  }, [context]);

  const onSyncEvents = useCallback(async (payload?: { force?: boolean; taskId?: string }) => {
    await syncEventsAction(context, payload);
  }, [context]);

  const onDeleteFirstEvent = useCallback(async () => {
    await deleteFirstEventAction(context);
  }, [context]);

  const onDeleteFirstLorebook = useCallback(async () => {
    await deleteFirstLorebookAction(context);
  }, [context]);

  return {
    refreshResources,
    onSaveMaintenance,
    onSyncLorebooks,
    onSyncEvents,
    onDeleteFirstEvent,
    onDeleteFirstLorebook,
  };
}
