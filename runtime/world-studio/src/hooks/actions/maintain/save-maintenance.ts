import { emitWorldStudioLog } from '../../../logging.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";

export async function saveMaintenance(context: WorldStudioMaintainActionContext, payload?: WorldStudioMaintainActionPayload) {
    if (!context.selectedWorldId)
        return;
    const started = context.taskController.startTask({
        kind: 'MAINTAIN_SAVE',
        label: worldStudioMessage('task.saveMaintenanceLabel', 'Save maintenance'),
        atomic: true,
        resumable: false,
        canPause: false,
        canCancel: false,
        step: 'MAINTAIN',
        message: worldStudioMessage('task.savingMaintenanceChanges', 'Saving maintenance changes'),
    });
    if (!started) {
        context.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
        return;
    }
    context.setError(null);
    context.setNotice(null);
    const force = Boolean(payload?.force);
    try {
        if (context.snapshot.unsavedChangesByPanel.worldview) {
            const message = 'WORLD_STUDIO_WORLDVIEW_READ_ONLY: worldview now comes from canonical truth projection and cannot be saved through world-studio maintenance.';
            context.taskController.failTask(started.taskId, message);
            context.setError(message);
            return;
        }
        const worldPatch = context.snapshot.worldPatch;
        const data = asRecord(await context.mutations.saveMaintenanceMutation.mutateAsync({
            worldId: context.selectedWorldId,
            worldPatch,
            reason: 'World Studio maintenance update',
            sessionId: context.flowId,
            ...(!force ? { ifSnapshotVersion: context.snapshot.editorSnapshotVersion || undefined } : {}),
        }));
        context.patchSnapshot({
            editorSnapshotVersion: String(data.version || context.snapshot.editorSnapshotVersion || ''),
            unsavedChangesByPanel: {
                ...context.snapshot.unsavedChangesByPanel,
                base: false,
            },
        });
        context.setNotice(worldStudioMessage('notice.maintenanceApplied', 'Maintenance update applied.'));
        context.setStatusBanner({
            kind: 'success',
            message: worldStudioMessage('banner.maintenanceSaved', 'Maintenance saved'),
        });
        context.taskController.completeTask(started.taskId, worldStudioMessage('task.maintenanceSaved', 'Maintenance saved'));
        emitWorldStudioLog({
            level: 'info',
            message: 'world-studio:ui:maintenance-saved',
            flowId: context.flowId,
            source: 'WorldStudioPage.onSaveMaintenance',
            details: { worldId: context.selectedWorldId },
        });
        await Promise.all([
            context.queries.stateQuery.refetch(),
            context.queries.worldTruthQuery.refetch(),
        ]);
    }
    catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : String(saveError);
        context.taskController.failTask(started.taskId, message);
        if (message.includes('CONFLICT')) {
            context.setError('WORLD_STUDIO_MAINTENANCE_CONFLICT: remote version changed. Use Reload Remote or Force Save.');
        }
        else {
            context.setError(message);
        }
    }
}
