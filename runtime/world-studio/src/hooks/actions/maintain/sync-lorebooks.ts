import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { validateLorebooksInput } from '../../../services/snapshot-normalize.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';

export async function syncLorebooks(
  context: WorldStudioMaintainActionContext,
  _payload?: WorldStudioMaintainActionPayload,
) {
  if (!context.selectedWorldId) return;

  const started = context.taskController.startTask({
    kind: 'MAINTAIN_SYNC_LOREBOOKS',
    label: 'Sync lorebooks',
    atomic: false,
    resumable: false,
    canPause: false,
    canCancel: true,
    step: 'MAINTAIN',
    message: 'Syncing lorebooks',
  });
  if (!started) {
    context.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  context.setError(null);
  try {
    const lorebookUpserts = context.snapshot.lorebooksDraft;
    const lorebookErrors = validateLorebooksInput(lorebookUpserts);
    if (lorebookErrors.length > 0) {
      context.taskController.failTask(started.taskId, `WORLD_STUDIO_LOREBOOKS_INVALID: ${lorebookErrors.join(' | ')}`);
      context.setError(`WORLD_STUDIO_LOREBOOKS_INVALID: ${lorebookErrors.join(' | ')}`);
      return;
    }
    if (context.taskController.shouldCancel(started.taskId)) {
      context.taskController.cancelTask(started.taskId, 'Lorebooks sync canceled');
      context.setNotice('Lorebooks sync canceled.');
      return;
    }
    context.taskController.updateTask(started.taskId, {
      canCancel: false,
      message: 'Submitting lorebooks sync',
      progress: 0.2,
    });
    await context.mutations.syncLorebooksMutation.mutateAsync({
      worldId: context.selectedWorldId,
      lorebookUpserts,
      reason: 'World Studio lorebooks sync',
    });
    const maintenancePayload = asRecord((await context.queries.maintenanceQuery.refetch()).data);
    context.patchSnapshot({
      editorSnapshotVersion: String(maintenancePayload.editorSnapshotVersion || context.snapshot.editorSnapshotVersion || ''),
      unsavedChangesByPanel: {
        ...context.snapshot.unsavedChangesByPanel,
        lorebooks: false,
      },
    });
    context.setStatusBanner({ kind: 'success', message: 'Lorebooks synchronized' });
    context.taskController.completeTask(started.taskId, 'Lorebooks synchronized');
    await Promise.all([
      context.queries.lorebooksQuery.refetch(),
      context.queries.mutationsQuery.refetch(),
    ]);
  } catch (syncError) {
    context.taskController.failTask(started.taskId, syncError);
    context.setError(syncError instanceof Error ? syncError.message : String(syncError));
  }
}
