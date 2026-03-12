import type { EventNodeDraft } from '../../../contracts.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export async function deleteFirstEvent(context: WorldStudioMaintainActionContext) {
    if (!context.selectedWorldId)
        return;
    context.setError(null);
    try {
        const events = context.eventsGraph;
        const firstEventId = String(events.primary[0]?.id || events.secondary[0]?.id || '').trim();
        if (!firstEventId) {
            throw new Error(worldStudioMessage('error.noEventIdFound', 'No event id found in events payload.'));
        }
        const data = asRecord(await context.mutations.deleteEventMutation.mutateAsync({
            worldId: context.selectedWorldId,
            eventId: firstEventId,
        }));
        const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
        const primary = items.filter((item) => String(item.level || '').toUpperCase() === 'PRIMARY');
        const secondary = items.filter((item) => String(item.level || '').toUpperCase() === 'SECONDARY');
        context.patchSnapshot({
            eventsDraft: {
                primary: primary as EventNodeDraft[],
                secondary: secondary as EventNodeDraft[],
            },
            knowledgeGraph: {
                ...context.snapshot.knowledgeGraph,
                events: {
                    primary: primary as EventNodeDraft[],
                    secondary: secondary as EventNodeDraft[],
                },
            },
            editorSnapshotVersion: String(data.editorSnapshotVersion || context.snapshot.editorSnapshotVersion || ''),
            unsavedChangesByPanel: {
                ...context.snapshot.unsavedChangesByPanel,
                events: false,
            },
        });
        context.setStatusBanner({
            kind: 'info',
            message: worldStudioMessage('banner.eventDeleted', 'Event {{eventId}} deleted', { eventId: firstEventId }),
        });
        await context.queries.mutationsQuery.refetch();
    }
    catch (deleteError) {
        context.setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
}
