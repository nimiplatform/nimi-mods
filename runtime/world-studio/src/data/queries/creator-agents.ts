import { WORLD_STUDIO_DATA_API_CREATOR_AGENTS_BATCH_CREATE, WORLD_STUDIO_DATA_API_CREATOR_AGENTS_CREATE, WORLD_STUDIO_DATA_API_CREATOR_AGENTS_LIST, } from '../../contracts.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
export async function listCreatorAgents(hookClient: HookClient) {
    return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_CREATOR_AGENTS_LIST, query: {} });
}
export async function createCreatorAgent(hookClient: HookClient, payload: Record<string, unknown>) {
    return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_CREATOR_AGENTS_CREATE, query: payload });
}
export async function batchCreateCreatorAgents(hookClient: HookClient, payload: {
    items: Array<Record<string, unknown>>;
    continueOnError?: boolean;
}) {
    return hookClient.data.query({ capability: WORLD_STUDIO_DATA_API_CREATOR_AGENTS_BATCH_CREATE, query: payload });
}
