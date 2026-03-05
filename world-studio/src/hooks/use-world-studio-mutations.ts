import { useMutation } from '@tanstack/react-query';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  batchCreateCreatorAgents,
  batchUpsertWorldEvents,
  batchUpsertWorldLorebooks,
  createWorldDraft,
  deleteWorldEvent,
  deleteWorldLorebook,
  publishWorldDraft,
  updateWorldDraft,
  updateWorldMaintenance,
} from '../data.js';

type SaveDraftInput = {
  draftId?: string;
  sourceType: 'TEXT' | 'FILE';
  sourceRef: string;
  status: 'DRAFT' | 'SYNTHESIZE' | 'REVIEW' | 'PUBLISH' | 'FAILED';
  pipelineState: Record<string, unknown>;
  draftPayload: Record<string, unknown>;
  targetWorldId?: string;
};

export function useWorldStudioMutations(hookClient: HookClient) {
  const saveDraftMutation = useMutation({
    mutationFn: async (input: SaveDraftInput) => {
      if (input.draftId) {
        return await updateWorldDraft(hookClient, input.draftId, {
          status: input.status,
          pipelineState: input.pipelineState,
          draftPayload: input.draftPayload,
        });
      }
      return await createWorldDraft(hookClient, {
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        targetWorldId: input.targetWorldId,
        pipelineState: input.pipelineState,
        draftPayload: input.draftPayload,
      });
    },
  });

  const publishDraftMutation = useMutation({
    mutationFn: async (input: { draftId: string; reason: string }) => (
      await publishWorldDraft(hookClient, input.draftId, { reason: input.reason })
    ),
  });

  const saveMaintenanceMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      worldPatch: Record<string, unknown>;
      worldviewPatch: Record<string, unknown>;
      reason: string;
      ifSnapshotVersion?: string;
    }) => (
      await updateWorldMaintenance(hookClient, input.worldId, {
        worldPatch: input.worldPatch,
        worldviewPatch: input.worldviewPatch,
        reason: input.reason,
        ifSnapshotVersion: input.ifSnapshotVersion,
      })
    ),
  });

  const syncLorebooksMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      lorebookUpserts: Array<Record<string, unknown>>;
      reason: string;
    }) => (
      await batchUpsertWorldLorebooks(hookClient, input.worldId, {
        lorebookUpserts: input.lorebookUpserts,
        reason: input.reason,
      })
    ),
  });

  const syncEventsMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      eventUpserts: Array<Record<string, unknown>>;
      reason: string;
      mode?: 'merge' | 'replace';
      ifSnapshotVersion?: string;
    }) => (
      await batchUpsertWorldEvents(hookClient, input.worldId, {
        eventUpserts: input.eventUpserts,
        mode: input.mode || 'merge',
        reason: input.reason,
        ifSnapshotVersion: input.ifSnapshotVersion,
      })
    ),
  });

  const deleteLorebookMutation = useMutation({
    mutationFn: async (input: { worldId: string; lorebookId: string }) => (
      await deleteWorldLorebook(hookClient, input.worldId, input.lorebookId)
    ),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (input: { worldId: string; eventId: string }) => (
      await deleteWorldEvent(hookClient, input.worldId, input.eventId)
    ),
  });

  const batchCreateCreatorAgentsMutation = useMutation({
    mutationFn: async (input: {
      items: Array<Record<string, unknown>>;
      continueOnError?: boolean;
    }) => (
      await batchCreateCreatorAgents(hookClient, {
        items: input.items,
        continueOnError: input.continueOnError !== false,
      })
    ),
  });

  return {
    saveDraftMutation,
    publishDraftMutation,
    saveMaintenanceMutation,
    syncLorebooksMutation,
    syncEventsMutation,
    deleteLorebookMutation,
    deleteEventMutation,
    batchCreateCreatorAgentsMutation,
  };
}
