import type { LocalChatCoreQueryBridge, LocalChatReadContext } from './types.js';

export const CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST = 'data-api.core.social.friends-with-details.list';
export const CORE_DATA_API_USER_BY_ID_GET = 'data-api.core.user.by-id.get';
export const CORE_DATA_API_USER_BY_HANDLE_GET = 'data-api.core.user.by-handle.get';
export const CORE_DATA_API_WORLD_BY_ID_GET = 'data-api.core.world.by-id.get';
export const CORE_DATA_API_WORLDVIEW_BY_ID_GET = 'data-api.core.worldview.by-id.get';
export const CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY = 'data-api.core.agent.memory.recall.for-entity';
export const CORE_DATA_API_AGENT_MEMORY_CORE_LIST = 'data-api.core.agent.memory.core.list';
export const CORE_DATA_API_AGENT_MEMORY_E2E_LIST = 'data-api.core.agent.memory.e2e.list';
export const CORE_DATA_API_AGENT_MEMORY_STATS_GET = 'data-api.core.agent.memory.stats.get';

let localChatCoreQueryBridge: LocalChatCoreQueryBridge | null = null;

export function configureLocalChatCoreQueryBridge(bridge: LocalChatCoreQueryBridge | null): void {
  localChatCoreQueryBridge = bridge;
}

export function requireLocalChatCoreQueryBridge(): LocalChatCoreQueryBridge {
  if (!localChatCoreQueryBridge) {
    throw new Error('LOCAL_CHAT_CORE_QUERY_BRIDGE_NOT_CONFIGURED');
  }
  return localChatCoreQueryBridge;
}

export async function withOpenApiContextLock<T>(
  context: LocalChatReadContext,
  task: () => Promise<T>,
): Promise<T> {
  const bridge = localChatCoreQueryBridge;
  if (bridge?.withOpenApiContextLock) {
    return bridge.withOpenApiContextLock(context, task);
  }
  return task();
}
