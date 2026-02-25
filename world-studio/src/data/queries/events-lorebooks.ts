import type { HookClient } from '@nimiplatform/mod-sdk/types';
import {
  WORLD_STUDIO_DATA_API_EVENTS_BATCH_UPSERT,
  WORLD_STUDIO_DATA_API_EVENTS_DELETE,
  WORLD_STUDIO_DATA_API_EVENTS_LIST,
  WORLD_STUDIO_DATA_API_LOREBOOKS_BATCH_UPSERT,
  WORLD_STUDIO_DATA_API_LOREBOOKS_DELETE,
  WORLD_STUDIO_DATA_API_LOREBOOKS_LIST,
} from '../../contracts.js';

export async function listWorldEvents(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_EVENTS_LIST, query: { worldId } });
}

export async function batchUpsertWorldEvents(
  hookClient: HookClient,
  worldId: string,
  payload: Record<string, unknown>,
) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_EVENTS_BATCH_UPSERT, query: { worldId, payload } });
}

export async function deleteWorldEvent(hookClient: HookClient, worldId: string, eventId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_EVENTS_DELETE, query: { worldId, eventId } });
}

export async function listWorldLorebooks(hookClient: HookClient, worldId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_LOREBOOKS_LIST, query: { worldId } });
}

export async function batchUpsertWorldLorebooks(
  hookClient: HookClient,
  worldId: string,
  payload: Record<string, unknown>,
) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_LOREBOOKS_BATCH_UPSERT, query: { worldId, payload } });
}

export async function deleteWorldLorebook(hookClient: HookClient, worldId: string, lorebookId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_LOREBOOKS_DELETE, query: { worldId, lorebookId } });
}
