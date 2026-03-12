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
        const eventItems = input.queries.eventsQuery.data as unknown[];
        const lorebooksItems = lorebooksPayload.items as unknown[];
        const hydrationKey = [
            input.selectedWorldId,
            String(maintenancePayload.editorSnapshotVersion || ''),
            String(eventItems.length),
            String(lorebooksItems.length),
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
            eventGraphLayout: {
                selectedEventId: String(primaryEvents[0]?.id || secondaryEvents[0]?.id || ''),
                expandedPrimaryIds: primaryEvents[0]?.id ? [String(primaryEvents[0].id)] : [],
            },
            unsavedChangesByPanel: {
                world: false,
                worldview: false,
                events: false,
                lorebooks: false,
            },
        });
        input.lastHydratedWorldIdRef.current = hydrationKey;
    }, [
        input.lastHydratedWorldIdRef,
        input.patchSnapshot,
        input.queries.eventsQuery.data,
        input.queries.lorebooksQuery.data,
        input.queries.maintenanceQuery.data,
        input.selectedWorldId,
        input.snapshot.knowledgeGraph,
    ]);
}
