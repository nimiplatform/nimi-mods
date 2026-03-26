import { useCallback } from 'react';
import type {
  EventNodeDraft,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import { worldStudioMessage } from '../i18n/messages.js';
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
import { createAgentsFromDrafts as createAgentsFromDraftsAction } from './actions/maintain/create-agents-from-drafts.js';
import { updateCreatorAgentMetadata as updateCreatorAgentMetadataAction } from './actions/maintain/update-creator-agent.js';
import {
  buildPendingResourceBindingUpserts,
  syncResourceBindings as syncResourceBindingsAction,
} from './actions/maintain/sync-resource-bindings.js';

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
  setLocalWorkspaceSavedAt: (value: string | null) => void;
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

  const onSaveLocalWorkspace = useCallback(async () => {
    const savedAt = new Date().toISOString();
    context.setError(null);
    input.setLocalWorkspaceSavedAt(savedAt);
    context.setNotice(worldStudioMessage(
      'notice.localWorkspaceSaved',
      'Current workspace saved locally. Sync to remote is still a separate step.',
    ));
  }, [context, input]);

  const onSyncWorkspaceToRemote = useCallback(async () => {
    const dirty = context.snapshot.unsavedChangesByPanel;
    const hasWorldDirty = dirty.base;
    const hasEventsDirty = dirty.worldEvents;
    const hasLorebooksDirty = dirty.lorebooks;
    const hasWorldAssetsPending = buildPendingResourceBindingUpserts(context, 'WORLD_ASSETS').length > 0;
    const hasAgentAssetsPending = buildPendingResourceBindingUpserts(context, 'AGENT_ASSETS').length > 0;

    if (!hasWorldDirty && !hasEventsDirty && !hasLorebooksDirty && !hasWorldAssetsPending && !hasAgentAssetsPending) {
      if (dirty.agentEditor) {
        context.setNotice(worldStudioMessage(
          'notice.agentMetadataSaveRequired',
          'Focused agent metadata still needs Save Agent Metadata before workspace sync can continue.',
        ));
        return;
      }
      context.setNotice(worldStudioMessage('notice.remoteSyncSkipped', 'No workspace-level remote sync actions are pending.'));
      return;
    }

    context.setError(null);
    context.setNotice(null);

    if (hasEventsDirty && context.eventSyncMode === 'replace') {
      const totalEvents = context.eventsGraph.primary.length + context.eventsGraph.secondary.length;
      if (totalEvents > 0) {
        const confirmed = typeof window !== 'undefined'
          ? window.confirm(
            worldStudioMessage(
              'eventGraphMaintenance.replaceConfirm',
              'Replace mode will archive current active remote events and rewrite them from your graph. Continue?',
            ),
          )
          : true;
        if (!confirmed) {
          context.setNotice(worldStudioMessage('notice.eventSyncCanceled', 'Event sync canceled.'));
          return;
        }
      }
    }

    const steps: Array<{ label: string; run: () => Promise<void> }> = [];
    if (hasWorldDirty) {
      steps.push({
        label: worldStudioMessage('dirty.world', 'World'),
        run: () => saveMaintenanceAction(context, { throwOnError: true }),
      });
    }
    if (hasEventsDirty) {
      steps.push({
        label: worldStudioMessage('dirty.events', 'Events'),
        run: () => syncEventsAction(context, { throwOnError: true }),
      });
    }
    if (hasLorebooksDirty) {
      steps.push({
        label: worldStudioMessage('dirty.lorebooks', 'Lorebooks'),
        run: () => syncLorebooksAction(context, { throwOnError: true }),
      });
    }
    if (hasWorldAssetsPending) {
      steps.push({
        label: worldStudioMessage('dirty.worldAssets', 'World Assets'),
        run: () => syncResourceBindingsAction(context, 'WORLD_ASSETS'),
      });
    }
    if (hasAgentAssetsPending) {
      steps.push({
        label: worldStudioMessage('dirty.agentAssets', 'Agent Assets'),
        run: () => syncResourceBindingsAction(context, 'AGENT_ASSETS'),
      });
    }

    for (const step of steps) {
      try {
        await step.run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.setError(worldStudioMessage(
          'maintain.workspaceSyncStepFailed',
          'Workspace sync stopped at {{label}}: {{message}}',
          { label: step.label, message },
        ));
        return;
      }
    }

    context.setNotice(worldStudioMessage('notice.workspaceRemoteSyncComplete', 'Workspace remote sync completed.'));
  }, [context]);

  const onDeleteFirstEvent = useCallback(async () => {
    await deleteFirstEventAction(context);
  }, [context]);

  const onDeleteFirstLorebook = useCallback(async () => {
    await deleteFirstLorebookAction(context);
  }, [context]);

  const onCreateAgentsFromDrafts = useCallback(async (characterNames?: string[]) => {
    await createAgentsFromDraftsAction(context, characterNames);
  }, [context]);

  const onUpdateCreatorAgentMetadata = useCallback(async (agentId: string, patch: Record<string, unknown>) => {
    await updateCreatorAgentMetadataAction(context, agentId, patch);
  }, [context]);

  const onSyncResourceBindings = useCallback(async (scope: 'WORLD_ASSETS' | 'AGENT_ASSETS') => {
    await syncResourceBindingsAction(context, scope);
  }, [context]);

  return {
    refreshResources,
    onSaveMaintenance,
    onSyncLorebooks,
    onSyncEvents,
    onSaveLocalWorkspace,
    onSyncWorkspaceToRemote,
    onDeleteFirstEvent,
    onDeleteFirstLorebook,
    onCreateAgentsFromDrafts,
    onUpdateCreatorAgentMetadata,
    onSyncResourceBindings,
  };
}
