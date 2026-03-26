import type { WorldStudioMaintainActionContext } from './types.js';
export async function deleteFirstLorebook(context: WorldStudioMaintainActionContext) {
    if (!context.selectedWorldId)
        return;
    context.setError(null);
    context.setError('WORLD_STUDIO_LOREBOOK_MUTATION_UNAVAILABLE');
}
