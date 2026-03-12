import { useEffect } from 'react';
import type { WorldStudioPanelState, WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot, } from '../contracts.js';
import type { LandingState, WorldSummary } from '../ui/types.js';
import { useWorldStudioDraftHydration } from './hydration/hydrate-draft.js';
import { useWorldStudioMaintainHydration } from './hydration/hydrate-maintain.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
export function useWorldStudioHydration(input: {
    hookClient: HookClient;
    landing: LandingState;
    worlds: WorldSummary[];
    selectedWorldId: string;
    selectedDraftId: string;
    patchPanel: (patch: {
        selectedWorldId?: string;
        selectedDraftId?: string;
        activeMaintainTab?: WorldStudioPanelState['activeMaintainTab'];
    }) => void;
    setCreateStep: (step: 'SOURCE' | 'INGEST' | 'EXTRACT' | 'CHECKPOINTS' | 'SYNTHESIZE' | 'DRAFT' | 'PUBLISH') => void;
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
    setSourceMode: (mode: 'TEXT' | 'FILE') => void;
    setFilePreviewText: (value: string) => void;
    sourceChunksRef: {
        current: string[];
    };
    sourceRawTextRef: {
        current: string;
    };
    setError: (value: string) => void;
    lastHydratedDraftIdRef: {
        current: string;
    };
    lastHydratedWorldIdRef: {
        current: string;
    };
}): void {
    const { hookClient, landing, worlds, selectedWorldId, selectedDraftId, patchPanel, patchSnapshot, snapshot, queries, setSourceMode, setFilePreviewText, sourceChunksRef, sourceRawTextRef, setError, lastHydratedDraftIdRef, lastHydratedWorldIdRef, } = input;
    useEffect(() => {
        if (landing.target !== 'MAINTAIN')
            return;
        if (!selectedWorldId) {
            if (landing.worldId) {
                patchPanel({ selectedWorldId: landing.worldId });
                return;
            }
            const firstWorld = worlds[0];
            if (firstWorld) {
                patchPanel({ selectedWorldId: firstWorld.id });
            }
        }
    }, [landing.target, landing.worldId, patchPanel, selectedWorldId, worlds]);
    useWorldStudioDraftHydration({
        hookClient,
        selectedDraftId,
        patchSnapshot,
        snapshot,
        setSourceMode,
        setFilePreviewText,
        sourceChunksRef,
        sourceRawTextRef,
        setError,
        lastHydratedDraftIdRef,
    });
    useWorldStudioMaintainHydration({
        selectedWorldId: landing.target === 'MAINTAIN' ? selectedWorldId : '',
        patchSnapshot,
        snapshot,
        queries,
        lastHydratedWorldIdRef,
    });
}
