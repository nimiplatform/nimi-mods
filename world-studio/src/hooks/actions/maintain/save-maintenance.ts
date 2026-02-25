import { asRecord } from '@nimiplatform/mod-sdk/utils';
import { emitWorldStudioLog } from '../../../logging.js';
import { validateWorldviewPatchInput } from '../../../services/snapshot-normalize.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';

export async function saveMaintenance(
  context: WorldStudioMaintainActionContext,
  payload?: WorldStudioMaintainActionPayload,
) {
  if (!context.selectedWorldId) return;

  const started = context.taskController.startTask({
    kind: 'MAINTAIN_SAVE',
    label: 'Save maintenance',
    atomic: true,
    resumable: false,
    canPause: false,
    canCancel: false,
    step: 'MAINTAIN',
    message: 'Saving maintenance changes',
  });
  if (!started) {
    context.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
    return;
  }

  context.setError(null);
  context.setNotice(null);
  const force = Boolean(payload?.force);

  try {
    const worldPatch = context.snapshot.worldPatch;
    const worldviewPatch = context.snapshot.worldviewPatch;
    const worldviewErrors = validateWorldviewPatchInput(worldviewPatch);
    if (worldviewErrors.length > 0) {
      context.taskController.failTask(started.taskId, `WORLD_STUDIO_WORLDVIEW_INVALID: ${worldviewErrors.join(' | ')}`);
      context.setError(`WORLD_STUDIO_WORLDVIEW_INVALID: ${worldviewErrors.join(' | ')}`);
      return;
    }

    const data = asRecord(await context.mutations.saveMaintenanceMutation.mutateAsync({
      worldId: context.selectedWorldId,
      worldPatch,
      worldviewPatch,
      reason: 'World Studio maintenance update',
      ...(!force ? { ifSnapshotVersion: context.snapshot.editorSnapshotVersion || undefined } : {}),
    }));
    context.patchSnapshot({
      editorSnapshotVersion: String(data.editorSnapshotVersion || context.snapshot.editorSnapshotVersion || ''),
      unsavedChangesByPanel: {
        ...context.snapshot.unsavedChangesByPanel,
        world: false,
        worldview: false,
      },
    });
    context.setNotice('Maintenance update applied.');
    context.setStatusBanner({ kind: 'success', message: 'Maintenance saved' });
    context.taskController.completeTask(started.taskId, 'Maintenance saved');
    emitWorldStudioLog({
      level: 'info',
      message: 'world-studio:ui:maintenance-saved',
      flowId: context.flowId,
      source: 'WorldStudioPage.onSaveMaintenance',
      details: { worldId: context.selectedWorldId },
    });
    await Promise.all([
      context.queries.maintenanceQuery.refetch(),
      context.queries.mutationsQuery.refetch(),
    ]);
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : String(saveError);
    context.taskController.failTask(started.taskId, message);
    if (message.includes('WORLD_MAINTENANCE_VERSION_CONFLICT')) {
      context.setError('WORLD_STUDIO_MAINTENANCE_CONFLICT: remote version changed. Use Reload Remote or Force Save.');
    } else {
      context.setError(message);
    }
  }
}
