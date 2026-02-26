import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  WORLD_STUDIO_DATA_API_MAINTENANCE_GET,
  WORLD_STUDIO_DATA_API_MAINTENANCE_UPDATE,
  WORLD_STUDIO_DATA_API_MUTATIONS_LIST,
  WORLD_STUDIO_DATA_API_WORLDS_MINE,
} from '../../contracts.js';

export async function getWorldMaintenance(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_MAINTENANCE_GET, query: { worldId } });
}

export async function updateWorldMaintenance(
  hookClient: HookClient,
  worldId: string,
  patch: Record<string, unknown>,
) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_MAINTENANCE_UPDATE, query: { worldId, patch } });
}

export async function listMyWorlds(hookClient: HookClient) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_WORLDS_MINE, query: {} });
}

export async function listWorldMutations(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_MUTATIONS_LIST, query: { worldId } });
}
