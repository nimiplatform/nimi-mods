import type { WorldStudioMaintainActionContext } from './types.js';
export async function deleteFirstEvent(context: WorldStudioMaintainActionContext) {
    if (!context.selectedWorldId)
        return;
    context.setError(null);
    context.setError('WORLD_HISTORY_APPEND_ONLY');
}
