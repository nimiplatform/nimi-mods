import { useMutation } from '@tanstack/react-query';
import {
  appendWorldHistory,
  batchCreateCreatorAgents,
  batchUpsertWorldBindings,
  createCreatorAgent,
  createWorldDraft,
  commitWorldState,
  publishWorldDraft,
  updateCreatorAgent,
  updateWorldDraft,
} from '../data.js';
import {
  WORLD_STUDIO_HISTORY_SCHEMA_ID,
  WORLD_STUDIO_HISTORY_SCHEMA_VERSION,
  WORLD_STUDIO_MOD_ID,
  WORLD_STUDIO_STATE_SCHEMA_ID,
  WORLD_STUDIO_STATE_SCHEMA_VERSION,
  WORLD_STUDIO_STATE_TARGET_PATH,
} from '../contracts.js';
import { useShellAuth } from '@nimiplatform/sdk/mod/shell';
import { type HookClient } from '@nimiplatform/sdk/mod';

type SaveDraftInput = {
  draftId?: string;
  sourceType: 'TEXT' | 'FILE';
  sourceRef: string;
  status: 'DRAFT' | 'SYNTHESIZE' | 'REVIEW' | 'PUBLISH' | 'FAILED';
  pipelineState: Record<string, unknown>;
  draftPayload: Record<string, unknown>;
  targetWorldId?: string;
};

function requireString(value: unknown, code: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(code);
  }
  return normalized;
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

export function useWorldStudioMutations(hookClient: HookClient) {
  const { user } = useShellAuth();
  const actorId = String(user?.id || '').trim();

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
    mutationFn: async (input: {
      draftId: string;
      reason: string;
    }) => (await publishWorldDraft(hookClient, input.draftId, { reason: input.reason })),
  });

  const saveMaintenanceMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      worldPatch: Record<string, unknown>;
      reason: string;
      sessionId: string;
      ifSnapshotVersion?: string;
    }) => {
      if (!actorId) {
        throw new Error('WORLD_STUDIO_ACTOR_ID_REQUIRED');
      }
      return await commitWorldState(hookClient, input.worldId, {
        writes: [{
          scope: 'WORLD',
          scopeKey: input.worldId,
          targetPath: WORLD_STUDIO_STATE_TARGET_PATH,
          payload: requireRecord(input.worldPatch, 'WORLD_STUDIO_WORLD_PATCH_REQUIRED'),
          metadata: { owner: 'world-studio-maintain' },
        }],
        reason: input.reason,
        sessionId: requireString(input.sessionId, 'WORLD_STUDIO_SESSION_ID_REQUIRED'),
        ifSnapshotVersion: input.ifSnapshotVersion,
        commit: {
          worldId: input.worldId,
          appId: WORLD_STUDIO_MOD_ID,
          sessionId: requireString(input.sessionId, 'WORLD_STUDIO_SESSION_ID_REQUIRED'),
          effectClass: 'STATE_ONLY',
          scope: 'WORLD',
          schemaId: WORLD_STUDIO_STATE_SCHEMA_ID,
          schemaVersion: WORLD_STUDIO_STATE_SCHEMA_VERSION,
          actorRefs: [{ actorType: 'USER', actorId, role: 'creator' }],
          reason: input.reason,
          evidenceRefs: [],
        },
      });
    },
  });

  const syncLorebooksMutation = useMutation({
    mutationFn: async () => {
      throw new Error('WORLD_STUDIO_LOREBOOK_MUTATION_UNAVAILABLE');
    },
  });

  const syncEventsMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      historyAppends: Array<Record<string, unknown>>;
      reason: string;
      sessionId: string;
      ifSnapshotVersion?: string;
    }) => {
      if (!actorId) {
        throw new Error('WORLD_STUDIO_ACTOR_ID_REQUIRED');
      }
      return await appendWorldHistory(hookClient, input.worldId, {
        historyAppends: input.historyAppends,
        reason: input.reason,
        sessionId: requireString(input.sessionId, 'WORLD_STUDIO_SESSION_ID_REQUIRED'),
        ifSnapshotVersion: input.ifSnapshotVersion,
        commit: {
          worldId: input.worldId,
          appId: WORLD_STUDIO_MOD_ID,
          sessionId: requireString(input.sessionId, 'WORLD_STUDIO_SESSION_ID_REQUIRED'),
          effectClass: 'STATE_AND_HISTORY',
          scope: 'WORLD',
          schemaId: WORLD_STUDIO_HISTORY_SCHEMA_ID,
          schemaVersion: WORLD_STUDIO_HISTORY_SCHEMA_VERSION,
          actorRefs: [{ actorType: 'USER', actorId, role: 'creator' }],
          reason: input.reason,
          evidenceRefs: [],
        },
      });
    },
  });

  const syncResourceBindingsMutation = useMutation({
    mutationFn: async (input: {
      worldId: string;
      bindingUpserts: Array<Record<string, unknown>>;
      reason: string;
    }) => (await batchUpsertWorldBindings(hookClient, input.worldId, {
      bindingUpserts: input.bindingUpserts,
      reason: input.reason,
    })),
  });

  const deleteLorebookMutation = useMutation({
    mutationFn: async () => {
      throw new Error('WORLD_STUDIO_LOREBOOK_MUTATION_UNAVAILABLE');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      throw new Error('WORLD_HISTORY_APPEND_ONLY');
    },
  });

  const batchCreateCreatorAgentsMutation = useMutation({
    mutationFn: async (input: {
      items: Array<Record<string, unknown>>;
      continueOnError?: boolean;
    }) => (await batchCreateCreatorAgents(hookClient, {
      items: input.items,
      continueOnError: input.continueOnError !== false,
    })),
  });

  const createCreatorAgentMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => (await createCreatorAgent(hookClient, input)),
  });

  const updateCreatorAgentMutation = useMutation({
    mutationFn: async (input: {
      agentId: string;
      patch: Record<string, unknown>;
    }) => (await updateCreatorAgent(hookClient, input.agentId, input.patch)),
  });

  return {
    saveDraftMutation,
    publishDraftMutation,
    saveMaintenanceMutation,
    syncLorebooksMutation,
    syncEventsMutation,
    syncResourceBindingsMutation,
    deleteLorebookMutation,
    deleteEventMutation,
    batchCreateCreatorAgentsMutation,
    createCreatorAgentMutation,
    updateCreatorAgentMutation,
  };
}
