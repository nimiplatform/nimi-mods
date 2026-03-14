import { formatConflictReloadSummary } from '../../../ui/status-summary.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { EventNodeDraft, WorldLorebookDraftRow, WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot, } from '../../../contracts.js';
import type { WorldStudioQueries } from '../create/types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export type WorldStudioConflictActionContext = {
    selectedWorldId: string;
    snapshot: WorldStudioWorkspaceSnapshot;
    patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
    queries: WorldStudioQueries;
    setError: (value: string | null) => void;
    setNotice: (value: string | null) => void;
    setConflictReloadSummary: (value: string | null) => void;
    lastHydratedWorldIdRef: {
        current: string;
    };
};
export async function reloadRemoteForConflict(context: WorldStudioConflictActionContext) {
    if (!context.selectedWorldId) {
        context.setConflictReloadSummary(null);
        context.setNotice(worldStudioMessage('notice.remoteSnapshotUnavailable', 'Remote maintenance snapshot is unavailable.'));
        return;
    }
    const beforePrimaryCount = context.snapshot.knowledgeGraph.events.primary.length;
    const beforeSecondaryCount = context.snapshot.knowledgeGraph.events.secondary.length;
    const beforeLorebookCount = context.snapshot.lorebooksDraft.length;
    const beforeSnapshotVersion = context.snapshot.editorSnapshotVersion || '-';
    const [maintenanceResult, eventsResult, lorebooksResult, , creatorAgentsResult, mediaBindingsResult] = await Promise.all([
        context.queries.maintenanceQuery.refetch(),
        context.queries.eventsQuery.refetch(),
        context.queries.lorebooksQuery.refetch(),
        context.queries.mutationsQuery.refetch(),
        context.queries.creatorAgentsQuery.refetch(),
        context.queries.mediaBindingsQuery.refetch(),
    ]);
    const maintenancePayload = asRecord(maintenanceResult.data);
    const world = asRecord(maintenancePayload.world);
    if (Object.keys(world).length === 0) {
        context.setConflictReloadSummary(null);
        context.setNotice(worldStudioMessage('notice.remoteSnapshotUnavailable', 'Remote maintenance snapshot is unavailable.'));
        return;
    }
    const worldview = asRecord(maintenancePayload.worldview);
    const eventItems = Array.isArray(eventsResult.data) ? (eventsResult.data as unknown[]) : [];
    const primaryEvents = eventItems
        .filter((item) => asRecord(item).level === 'PRIMARY')
        .map((item) => asRecord(item));
    const secondaryEvents = eventItems
        .filter((item) => asRecord(item).level === 'SECONDARY')
        .map((item) => asRecord(item));
    const lorebooksItems = Array.isArray(asRecord(lorebooksResult.data).items)
        ? (asRecord(lorebooksResult.data).items as unknown[])
        : [];
    const creatorAgents = Array.isArray(creatorAgentsResult.data) ? (creatorAgentsResult.data as unknown[]) : [];
    const worldOwnedAgents = creatorAgents
        .filter((item) => String(asRecord(item).worldId || '').trim() === context.selectedWorldId)
        .map((item) => asRecord(item));
    const selectedAgentId = worldOwnedAgents.some((item) => String(item.id || '') === context.snapshot.panel.selectedAgentId)
        ? context.snapshot.panel.selectedAgentId
        : String(worldOwnedAgents[0]?.id || '');
    const resolvedSnapshotVersion = String(maintenancePayload.editorSnapshotVersion || world.updatedAt || '');
    const hydrationKey = [
        context.selectedWorldId,
        resolvedSnapshotVersion,
        String(eventItems.length),
        String(lorebooksItems.length),
        String(worldOwnedAgents.length),
        String(Array.isArray(mediaBindingsResult.data) ? mediaBindingsResult.data.length : 0),
    ].join(':');
    context.patchSnapshot({
        worldPatch: world,
        worldviewPatch: worldview,
        eventsDraft: {
            primary: primaryEvents as EventNodeDraft[],
            secondary: secondaryEvents as EventNodeDraft[],
        },
        knowledgeGraph: {
            ...context.snapshot.knowledgeGraph,
            events: {
                primary: primaryEvents as EventNodeDraft[],
                secondary: secondaryEvents as EventNodeDraft[],
            },
        },
        lorebooksDraft: lorebooksItems as WorldLorebookDraftRow[],
        editorSnapshotVersion: resolvedSnapshotVersion,
        panel: {
            ...context.snapshot.panel,
            selectedAgentId,
        },
        eventGraphLayout: {
            selectedEventId: String(primaryEvents[0]?.id || secondaryEvents[0]?.id || ''),
            expandedPrimaryIds: primaryEvents[0]?.id ? [String(primaryEvents[0].id)] : [],
        },
        unsavedChangesByPanel: {
            base: false,
            worldview: false,
            worldEvents: false,
            lorebooks: false,
            agentRegistry: false,
            agentEditor: false,
            worldAssets: false,
            agentAssets: false,
            releaseDrafts: false,
            releasePublish: false,
            releaseHistory: false,
        },
    });
    context.lastHydratedWorldIdRef.current = hydrationKey;
    context.setError(null);
    const afterSnapshotVersion = resolvedSnapshotVersion || '-';
    const summary = formatConflictReloadSummary({
        beforePrimaryCount,
        afterPrimaryCount: primaryEvents.length,
        beforeSecondaryCount,
        afterSecondaryCount: secondaryEvents.length,
        beforeLorebookCount,
        afterLorebookCount: lorebooksItems.length,
        beforeSnapshotVersion,
        afterSnapshotVersion,
    });
    context.setConflictReloadSummary(summary);
    context.setNotice(worldStudioMessage('notice.reloadRemoteReplaced', 'Reloaded remote maintenance snapshot and replaced local unsaved changes. {{summary}}.', { summary }));
}
