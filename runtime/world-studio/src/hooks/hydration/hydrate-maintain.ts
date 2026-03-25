import { useEffect } from 'react';
import type { EventNodeDraft, WorldLorebookDraftRow, WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot, } from '../../contracts.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export type WorldStudioMaintainHydrationInput = {
    selectedWorldId: string;
    patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
    snapshot: WorldStudioWorkspaceSnapshot;
    queries: {
        maintenanceQuery: {
            data: unknown;
        };
        eventsQuery: {
            data: unknown;
        };
        lorebooksQuery: {
            data: unknown;
        };
        creatorAgentsQuery: {
            data: unknown;
        };
        resourceBindingsQuery: {
            data: unknown;
        };
    };
    lastHydratedWorldIdRef: {
        current: string;
    };
};
export function useWorldStudioMaintainHydration(input: WorldStudioMaintainHydrationInput): void {
    useEffect(() => {
        if (!input.selectedWorldId) {
            // Allow re-hydrating the same world again after workspace reset/create flow switch.
            input.lastHydratedWorldIdRef.current = '';
            return;
        }
        const maintenancePayload = asRecord(input.queries.maintenanceQuery.data);
        if (!maintenancePayload.world)
            return;
        // Wait until collection queries are materialized so we don't hydrate an empty snapshot
        // and mark the world as hydrated before remote lorebooks/events arrive.
        if (!Array.isArray(input.queries.eventsQuery.data))
            return;
        const lorebooksPayload = asRecord(input.queries.lorebooksQuery.data);
        if (!Array.isArray(lorebooksPayload.items))
            return;
        if (!Array.isArray(input.queries.creatorAgentsQuery.data))
            return;
        if (!Array.isArray(input.queries.resourceBindingsQuery.data))
            return;
        const eventItems = input.queries.eventsQuery.data as unknown[];
        const lorebooksItems = lorebooksPayload.items as unknown[];
        const creatorAgents = input.queries.creatorAgentsQuery.data as unknown[];
        const resourceBindings = input.queries.resourceBindingsQuery.data as unknown[];
        const worldOwnedAgents = creatorAgents
            .filter((item) => {
            const record = asRecord(item);
            return String(record.worldId || '').trim() === input.selectedWorldId;
        })
            .map((item) => asRecord(item));
        const selectedAgentId = worldOwnedAgents.some((item) => String(item.id || '') === input.snapshot.panel.selectedAgentId)
            ? input.snapshot.panel.selectedAgentId
            : String(worldOwnedAgents[0]?.id || '');
        const hydrationKey = [
            input.selectedWorldId,
            String(maintenancePayload.editorSnapshotVersion || ''),
            String(eventItems.length),
            String(lorebooksItems.length),
            String(worldOwnedAgents.length),
            String(resourceBindings.length),
        ].join(':');
        if (hydrationKey === input.lastHydratedWorldIdRef.current)
            return;
        const world = asRecord(maintenancePayload.world);
        const worldview = asRecord(maintenancePayload.worldview);
        const primaryEvents = eventItems
            .filter((item) => asRecord(item).level === 'PRIMARY')
            .map((item) => asRecord(item));
        const secondaryEvents = eventItems
            .filter((item) => asRecord(item).level === 'SECONDARY')
            .map((item) => asRecord(item));
        input.patchSnapshot({
            worldPatch: world,
            worldviewPatch: worldview,
            eventsDraft: {
                primary: primaryEvents as EventNodeDraft[],
                secondary: secondaryEvents as EventNodeDraft[],
            },
            knowledgeGraph: {
                ...input.snapshot.knowledgeGraph,
                events: {
                    primary: primaryEvents as EventNodeDraft[],
                    secondary: secondaryEvents as EventNodeDraft[],
                },
            },
            lorebooksDraft: lorebooksItems as WorldLorebookDraftRow[],
            editorSnapshotVersion: String(maintenancePayload.editorSnapshotVersion || ''),
            panel: {
                ...input.snapshot.panel,
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
        input.lastHydratedWorldIdRef.current = hydrationKey;
    }, [
        input.lastHydratedWorldIdRef,
        input.patchSnapshot,
        input.queries.eventsQuery.data,
        input.queries.lorebooksQuery.data,
        input.queries.creatorAgentsQuery.data,
        input.queries.resourceBindingsQuery.data,
        input.queries.maintenanceQuery.data,
        input.selectedWorldId,
        input.snapshot.knowledgeGraph,
        input.snapshot.panel,
    ]);
}
