import {
  WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_BATCH_UPSERT,
  WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_DELETE,
  WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_LIST,
} from '../../contracts.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

export async function listWorldMediaBindings(
  hookClient: HookClient,
  worldId: string,
  query?: Record<string, unknown>,
) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_LIST,
    query: { worldId, ...(query || {}) },
  });
}

export async function batchUpsertWorldMediaBindings(
  hookClient: HookClient,
  worldId: string,
  payload: Record<string, unknown>,
) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_BATCH_UPSERT,
    query: { worldId, payload },
  });
}

export async function deleteWorldMediaBinding(
  hookClient: HookClient,
  worldId: string,
  bindingId: string,
) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_DELETE,
    query: { worldId, bindingId },
  });
}
