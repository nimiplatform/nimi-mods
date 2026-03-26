import {
  WORLD_STUDIO_DATA_API_STATE_COMMIT,
  WORLD_STUDIO_DATA_API_STATE_GET,
  WORLD_STUDIO_DATA_API_WORLDVIEW_BY_ID_GET,
  WORLD_STUDIO_DATA_API_WORLD_BY_ID_GET,
  WORLD_STUDIO_DATA_API_WORLDS_MINE,
} from '../../contracts.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

export async function getWorldState(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_STATE_GET,
    query: { worldId },
  });
}

export async function commitWorldState(
  hookClient: HookClient,
  worldId: string,
  payload: Record<string, unknown>,
) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_STATE_COMMIT,
    query: { worldId, payload },
  });
}

export async function getWorldTruth(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_WORLD_BY_ID_GET,
    query: { worldId },
  });
}

export async function getWorldviewTruth(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_WORLDVIEW_BY_ID_GET,
    query: { worldId },
  });
}

export async function listMyWorlds(hookClient: HookClient) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_WORLDS_MINE, query: {} });
}
