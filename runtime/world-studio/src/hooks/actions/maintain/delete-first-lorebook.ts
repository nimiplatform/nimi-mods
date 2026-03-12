import type { WorldLorebookDraftRow } from '../../../contracts.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export async function deleteFirstLorebook(context: WorldStudioMaintainActionContext) {
    if (!context.selectedWorldId)
        return;
    context.setError(null);
    try {
        const lorebooks = context.snapshot.lorebooksDraft;
        const firstLorebookId = String(lorebooks[0]?.id || '').trim();
        if (!firstLorebookId) {
            throw new Error(worldStudioMessage('error.noLorebookIdFound', 'No lorebook id found in first lorebook item.'));
        }
        const payload = asRecord(await context.mutations.deleteLorebookMutation.mutateAsync({
            worldId: context.selectedWorldId,
            lorebookId: firstLorebookId,
        }));
        const nextLorebooks = Array.isArray(payload.items) ? payload.items : [];
        const maintenancePayload = asRecord((await context.queries.maintenanceQuery.refetch()).data);
        context.patchSnapshot({
            lorebooksDraft: Array.isArray(nextLorebooks) ? (nextLorebooks as WorldLorebookDraftRow[]) : [],
            editorSnapshotVersion: String(maintenancePayload.editorSnapshotVersion || context.snapshot.editorSnapshotVersion || ''),
            unsavedChangesByPanel: {
                ...context.snapshot.unsavedChangesByPanel,
                lorebooks: false,
            },
        });
        context.setStatusBanner({
            kind: 'info',
            message: worldStudioMessage('banner.lorebookDeleted', 'Lorebook {{lorebookId}} deleted', {
                lorebookId: firstLorebookId,
            }),
        });
        await context.queries.mutationsQuery.refetch();
    }
    catch (deleteError) {
        context.setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
}
