import { useEffect } from 'react';
import type {
  EventNodeDraft,
  WorldLorebookDraftRow,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../../contracts.js';
import { WORLD_STUDIO_STATE_TARGET_PATH } from '../../contracts.js';
import { asRecord } from '@nimiplatform/sdk/mod';

function getWorkspaceStateDraft(payload: unknown): { workspaceVersion: string; worldPatch: Record<string, unknown> } | null {
  const record = asRecord(payload);
  const items = Array.isArray(record.items) ? record.items : [];
  const workspaceItem = items.find((item) => (
    asRecord(item).targetPath === WORLD_STUDIO_STATE_TARGET_PATH
  ));
  if (!workspaceItem) {
    return null;
  }
  const itemRecord = asRecord(workspaceItem);
  const worldPatch = asRecord(itemRecord.payload);
  if (Object.keys(worldPatch).length === 0) {
    return null;
  }
  return {
    workspaceVersion: String(record.version || ''),
    worldPatch,
  };
}

export type WorldStudioMaintainHydrationInput = {
  selectedWorldId: string;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  snapshot: WorldStudioWorkspaceSnapshot;
  queries: {
    stateQuery: { data: unknown };
    worldTruthQuery: { data: unknown };
    worldviewTruthQuery: { data: unknown };
    eventsQuery: { data: unknown };
    lorebooksQuery: { data: unknown };
    creatorAgentsQuery: { data: unknown };
    resourceBindingsQuery: { data: unknown };
  };
  lastHydratedWorldIdRef: {
    current: string;
  };
};

export function useWorldStudioMaintainHydration(input: WorldStudioMaintainHydrationInput): void {
  useEffect(() => {
    if (!input.selectedWorldId) {
      input.lastHydratedWorldIdRef.current = '';
      return;
    }

    const workspaceState = getWorkspaceStateDraft(input.queries.stateQuery.data);
    const worldPatch = workspaceState?.worldPatch || asRecord(input.queries.worldTruthQuery.data);
    if (Object.keys(worldPatch).length === 0) {
      return;
    }
    const worldviewPatch = asRecord(input.queries.worldviewTruthQuery.data);

    if (!Array.isArray(input.queries.eventsQuery.data)) return;
    const lorebooksPayload = asRecord(input.queries.lorebooksQuery.data);
    if (!Array.isArray(lorebooksPayload.items)) return;
    if (!Array.isArray(input.queries.creatorAgentsQuery.data)) return;
    if (!Array.isArray(input.queries.resourceBindingsQuery.data)) return;

    const eventItems = input.queries.eventsQuery.data as unknown[];
    const lorebooksItems = lorebooksPayload.items as unknown[];
    const creatorAgents = input.queries.creatorAgentsQuery.data as unknown[];
    const resourceBindings = input.queries.resourceBindingsQuery.data as unknown[];
    const worldOwnedAgents = creatorAgents
      .filter((item) => String(asRecord(item).worldId || '').trim() === input.selectedWorldId)
      .map((item) => asRecord(item));
    const selectedAgentId = worldOwnedAgents.some((item) => String(item.id || '') === input.snapshot.panel.selectedAgentId)
      ? input.snapshot.panel.selectedAgentId
      : String(worldOwnedAgents[0]?.id || '');

    const primaryEvents = eventItems
      .filter((item) => asRecord(item).level === 'PRIMARY')
      .map((item) => asRecord(item));
    const secondaryEvents = eventItems
      .filter((item) => asRecord(item).level === 'SECONDARY')
      .map((item) => asRecord(item));
    const workspaceVersion = String(
      workspaceState?.workspaceVersion
      || asRecord(input.queries.stateQuery.data).version
      || worldPatch.updatedAt
      || '',
    );

    const hydrationKey = [
      input.selectedWorldId,
      workspaceVersion,
      String(eventItems.length),
      String(lorebooksItems.length),
      String(worldOwnedAgents.length),
      String(resourceBindings.length),
    ].join(':');
    if (hydrationKey === input.lastHydratedWorldIdRef.current) return;

    input.patchSnapshot({
      worldPatch,
      worldviewPatch,
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
      editorSnapshotVersion: workspaceVersion,
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
    input.queries.creatorAgentsQuery.data,
    input.queries.eventsQuery.data,
    input.queries.lorebooksQuery.data,
    input.queries.resourceBindingsQuery.data,
    input.queries.stateQuery.data,
    input.queries.worldTruthQuery.data,
    input.queries.worldviewTruthQuery.data,
    input.selectedWorldId,
    input.snapshot.knowledgeGraph,
    input.snapshot.panel,
  ]);
}
