import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';
export async function syncLorebooks(context: WorldStudioMaintainActionContext, _payload?: WorldStudioMaintainActionPayload) {
    if (!context.selectedWorldId)
        return;
    const started = context.taskController.startTask({
        kind: 'MAINTAIN_SYNC_LOREBOOKS',
        label: worldStudioMessage('task.syncLorebooksLabel', 'Sync lorebooks'),
        atomic: false,
        resumable: false,
        canPause: false,
        canCancel: true,
        step: 'MAINTAIN',
        message: worldStudioMessage('task.syncingLorebooks', 'Syncing lorebooks'),
    });
    if (!started) {
        context.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
        return;
    }
    context.setError(null);
    try {
        throw new Error('WORLD_STUDIO_LOREBOOK_MUTATION_UNAVAILABLE');
    }
    catch (syncError) {
        context.taskController.failTask(started.taskId, syncError);
        context.setError(syncError instanceof Error ? syncError.message : String(syncError));
    }
}
