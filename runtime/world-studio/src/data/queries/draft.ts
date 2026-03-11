import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  WORLD_STUDIO_DATA_API_ACCESS_ME,
  WORLD_STUDIO_DATA_API_DRAFTS_LIST,
  WORLD_STUDIO_DATA_API_DRAFT_CREATE,
  WORLD_STUDIO_DATA_API_DRAFT_GET,
  WORLD_STUDIO_DATA_API_DRAFT_PUBLISH,
  WORLD_STUDIO_DATA_API_DRAFT_UPDATE,
  WORLD_STUDIO_DATA_API_LANDING_RESOLVE,
} from '../../contracts.js';

export async function getMyWorldAccess(hookClient: HookClient) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_ACCESS_ME, query: {} });
}

export async function resolveWorldLanding(hookClient: HookClient) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_LANDING_RESOLVE, query: {} });
}

export async function createWorldDraft(hookClient: HookClient, payload: Record<string, unknown>) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_DRAFT_CREATE, query: payload });
}

export async function getWorldDraft(hookClient: HookClient, draftId: string) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_DRAFT_GET, query: { draftId } });
}

export async function listWorldDrafts(hookClient: HookClient) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_DRAFTS_LIST, query: {} });
}

export async function updateWorldDraft(
  hookClient: HookClient,
  draftId: string,
  patch: Record<string, unknown>,
) {
  return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_DRAFT_UPDATE, query: { draftId, patch } });
}

export async function publishWorldDraft(
  hookClient: HookClient,
  draftId: string,
  payload?: Record<string, unknown>,
) {
  return hookClient.data.query({
    capability: WORLD_STUDIO_DATA_API_DRAFT_PUBLISH,
    query: { draftId, payload: payload || {} },
  });
}
