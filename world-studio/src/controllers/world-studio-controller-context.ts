import { useEffect } from 'react';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type { RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LandingState, WorldDraftSummary, WorldSummary } from '../ui/types.js';
import type { Phase1Result } from '../generation/pipeline.js';
import type { WorldStudioWorkspaceSnapshot } from '../contracts.js';
import { useWorldStudioResourceQueries } from '../hooks/use-world-studio-queries.js';
import { useWorldStudioMutations } from '../hooks/use-world-studio-mutations.js';
import { useWorldStudioRouteOverrides } from '../hooks/use-world-studio-route-overrides.js';
import { useWorldStudioStatusMetrics } from '../hooks/use-world-studio-status-metrics.js';
import { isTaskBlockingStatus } from '../hooks/actions/task-control/state-machine.js';
import { useWorldStudioWorkspaceStore } from '../state/workspace-store.js';
import {
  getCurrentTimeNodeFromWorldviewPatch,
  getTimeFlowRatioFromWorldPatch,
} from '../services/snapshot-normalize.js';

type UseWorldStudioControllerContextInput = {
  hookClient: ReturnType<typeof createHookClient>;
  userId: string;
  landingLoading: boolean;
  landing: LandingState;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  snapshot: WorldStudioWorkspaceSnapshot;
  phase1: Phase1Result | null;
};

export function useWorldStudioStoreBindings(userId: string) {
  const snapshot = useWorldStudioWorkspaceStore((state) => state.snapshot);
  const patchSnapshot = useWorldStudioWorkspaceStore((state) => state.patchSnapshot);
  const patchPanel = useWorldStudioWorkspaceStore((state) => state.patchPanel);
  const setCreateStep = useWorldStudioWorkspaceStore((state) => state.setCreateStep);
  const hydrateForUser = useWorldStudioWorkspaceStore((state) => state.hydrateForUser);
  const persistForUser = useWorldStudioWorkspaceStore((state) => state.persistForUser);
  const resetSnapshot = useWorldStudioWorkspaceStore((state) => state.resetSnapshot);

  useEffect(() => {
    hydrateForUser(userId);
  }, [hydrateForUser, userId]);

  useEffect(() => {
    persistForUser(userId);
  }, [persistForUser, snapshot, userId]);

  return {
    snapshot,
    patchSnapshot,
    patchPanel,
    setCreateStep,
    hydrateForUser,
    persistForUser,
    resetSnapshot,
  };
}

export function useWorldStudioControllerContext(input: UseWorldStudioControllerContextInput) {
  const selectedWorldId = input.snapshot.panel.selectedWorldId || input.landing.worldId || '';
  const selectedDraftId = input.snapshot.panel.selectedDraftId;
  const eventsGraph = input.snapshot.eventsDraft;

  const queries = useWorldStudioResourceQueries(input.hookClient, {
    enabled: !input.landingLoading && input.landing.target !== 'NO_ACCESS',
    worldId: selectedWorldId,
    enableCollections: true,
  });
  const mutations = useWorldStudioMutations(input.hookClient);

  const worlds = (queries.worldsQuery.data || []) as WorldSummary[];
  const drafts = (queries.draftsQuery.data || []) as WorldDraftSummary[];
  const primaryWorld = worlds[0] || null;
  const latestDraft = drafts[0] || null;

  const activeTask = input.snapshot.taskState.activeTask;
  const working = activeTask ? isTaskBlockingStatus(activeTask.status) : false;
  const effectivePhase1 = input.phase1 || (input.snapshot.phase1Artifact
    ? {
      startTimeOptions: input.snapshot.phase1Artifact.startTimeOptions,
      characterCandidates: input.snapshot.phase1Artifact.characterCandidates,
      knowledgeGraph: input.snapshot.knowledgeGraph,
      finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
      qualityGate: input.snapshot.phase1Artifact.qualityGate,
      chunkTasks: input.snapshot.phase1Artifact.chunkTasks,
      rawText: JSON.stringify({
        recoveredFromSnapshot: true,
        updatedAt: input.snapshot.phase1Artifact.updatedAt,
      }),
    }
    : null);

  const timeFlowRatio = getTimeFlowRatioFromWorldPatch(input.snapshot.worldPatch);
  const currentTimeNode = getCurrentTimeNodeFromWorldviewPatch(input.snapshot.worldviewPatch);
  const selectedAgentSyncCharacters = input.snapshot.agentSync.selectedCharacterIds.length > 0
    ? input.snapshot.agentSync.selectedCharacterIds
    : input.snapshot.selectedCharacters;
  const runtimeDefaultRouteBinding = input.routeOptions?.resolvedDefault || input.routeOptions?.selected || null;

  const routeOverrides = useWorldStudioRouteOverrides({
    userId: input.userId,
    routeOptions: input.routeOptions,
    runtimeDefaultRouteBinding,
    snapshot: input.snapshot,
  });

  const statusMetrics = useWorldStudioStatusMetrics({
    eventsGraph,
    phase1: effectivePhase1,
  });
  const maintenanceEditorSnapshotVersion = String(
    asRecord(queries.maintenanceQuery.data).editorSnapshotVersion
    || input.snapshot.editorSnapshotVersion
    || '',
  );

  return {
    selectedWorldId,
    selectedDraftId,
    eventsGraph,
    queries,
    mutations,
    worlds,
    drafts,
    primaryWorld,
    latestDraft,
    activeTask,
    recentTasks: input.snapshot.taskState.recentTasks,
    expertMode: input.snapshot.taskState.expertMode,
    working,
    timeFlowRatio,
    currentTimeNode,
    selectedAgentSyncCharacters,
    maintenanceEditorSnapshotVersion,
    runtimeDefaultRouteBinding,
    ...routeOverrides,
    ...statusMetrics,
  };
}
