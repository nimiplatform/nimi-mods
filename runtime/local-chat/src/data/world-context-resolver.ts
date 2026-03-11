import { requireLocalChatCoreQueryBridge, CORE_DATA_API_WORLD_BY_ID_GET, CORE_DATA_API_WORLDVIEW_BY_ID_GET } from './core-query-bridge.js';
import { worldCache, worldviewCache } from './cache-store.js';
import { asNullableRecord } from './read-context.js';

export async function resolveWorldContext(worldId: string | null): Promise<{
  world: Record<string, unknown> | null;
  worldview: Record<string, unknown> | null;
}> {
  if (!worldId) {
    return {
      world: null,
      worldview: null,
    };
  }

  const coreQuery = requireLocalChatCoreQueryBridge();

  let world = worldCache.get(worldId);
  if (typeof world === 'undefined') {
    world = await coreQuery
      .query(CORE_DATA_API_WORLD_BY_ID_GET, { worldId })
      .then((payload) => asNullableRecord(payload))
      .catch(() => null);
    worldCache.set(worldId, world);
  }

  let worldview = worldviewCache.get(worldId);
  if (typeof worldview === 'undefined') {
    worldview = await coreQuery
      .query(CORE_DATA_API_WORLDVIEW_BY_ID_GET, { worldId })
      .then((payload) => asNullableRecord(payload))
      .catch(() => null);
    worldviewCache.set(worldId, worldview);
  }

  return {
    world,
    worldview,
  };
}
