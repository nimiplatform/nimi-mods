import { createLocalChatFlowId, emitLocalChatLog } from '../logging.js';
import { asRecord } from '@nimiplatform/sdk/mod/utils';
import {
  CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST,
  CORE_DATA_API_USER_BY_ID_GET,
  requireLocalChatCoreQueryBridge,
} from './core-query-bridge.js';
import {
  getTargetsListCache,
  getTargetsListInFlight,
  setTargetsListCache,
  setTargetsListInFlight,
} from './cache-store.js';
import { asNullableString, asString, withReadContext } from './read-context.js';
import type { LocalChatReadContext, LocalChatTarget } from './types.js';

function isAgentHandle(handle: string | null): boolean {
  return Boolean(handle && handle.startsWith('~'));
}

function hasAgentProfileSignal(source: Record<string, unknown>): boolean {
  const agent = asRecord(source.agent);
  const agentMetadata = asRecord(source.agentMetadata);
  const agentProfile = asRecord(source.agentProfile);
  return (
    Object.keys(agent).length > 0
    || Object.keys(agentMetadata).length > 0
    || Object.keys(agentProfile).length > 0
  );
}

function inferAgentFlag(source: Record<string, unknown>): boolean | null {
  if (source.isAgent === true) return true;
  if (source.isAgent === false) return false;
  if (hasAgentProfileSignal(source)) return true;
  const handle = asString(source.handle);
  if (isAgentHandle(handle)) return true;
  return null;
}

function mergeSourceWithProfile(
  source: Record<string, unknown>,
  profile: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!profile) return source;
  return {
    ...source,
    ...profile,
    agent: profile.agent ?? source.agent,
    agentMetadata: profile.agent ?? source.agentMetadata,
    agentProfile: profile.agentProfile ?? source.agentProfile,
    worldId: profile.worldId ?? source.worldId,
  };
}

function readAgentWorldId(friend: Record<string, unknown>): string | null {
  const fromRoot = asString(friend.worldId) || asString(friend.world_id);
  if (fromRoot) return fromRoot;
  const metadata = asRecord(
    friend.agent && typeof friend.agent === 'object'
      ? friend.agent
      : friend.agentMetadata,
  );
  const profile = asRecord(friend.agentProfile);
  return asString(metadata.worldId) || asString(profile.worldId) || asString(profile.world_id);
}

function toBaseTargetFromFriend(friend: Record<string, unknown>): LocalChatTarget | null {
  const id = asString(friend.id);
  if (!id) return null;

  const handle = asString(friend.handle) || id;
  const isAgent = Boolean(friend.isAgent) || isAgentHandle(handle);
  if (!isAgent) return null;

  const worldId = readAgentWorldId(friend);
  const agentMetadata = asRecord(
    friend.agent && typeof friend.agent === 'object'
      ? friend.agent
      : friend.agentMetadata,
  );
  const agentProfile = asRecord(friend.agentProfile);
  return {
    id,
    handle,
    displayName: asString(friend.displayName) || handle,
    avatarUrl: asNullableString(friend.avatarUrl),
    bio: asNullableString(friend.bio),
    friendsSince: asNullableString(friend.friendsSince),
    isAgent: true,
    worldId,
    worldResolvedBy: worldId ? 'profile' : 'unresolved',
    agentMetadata,
    agentProfile,
    world: null,
    worldview: null,
    payload: friend,
  };
}

async function resolveAgentTargetFromFriend(friend: Record<string, unknown>): Promise<LocalChatTarget | null> {
  const friendId = asString(friend.id);
  if (!friendId) return null;
  const initialAgentFlag = inferAgentFlag(friend);
  if (initialAgentFlag === true) {
    return toBaseTargetFromFriend(friend);
  }

  let resolvedProfile: Record<string, unknown> | null = null;
  try {
    const payload = await requireLocalChatCoreQueryBridge().query(
      CORE_DATA_API_USER_BY_ID_GET,
      { userId: friendId },
    );
    resolvedProfile = asRecord(payload);
  } catch {
    resolvedProfile = null;
  }
  if (!resolvedProfile || Object.keys(resolvedProfile).length === 0) {
    return null;
  }
  if (inferAgentFlag(resolvedProfile) !== true) {
    return null;
  }
  return toBaseTargetFromFriend(mergeSourceWithProfile(friend, resolvedProfile));
}

export async function listLocalChatTargets(context: LocalChatReadContext): Promise<LocalChatTarget[]> {
  const cached = getTargetsListCache();
  if (cached) return cached;

  const inFlight = getTargetsListInFlight();
  if (inFlight) return inFlight;

  const flowId = createLocalChatFlowId('local-chat-targets');
  const task = (async () => {
    const startedAt = performance.now();
    emitLocalChatLog({
      level: 'info',
      message: 'local-chat:targets-load:start',
      flowId,
      source: 'listLocalChatTargets',
    });

    try {
      const targets = await withReadContext(
        context,
        async () => {
          const payload = await requireLocalChatCoreQueryBridge().query(
            CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST,
            {},
          );
          const record = asRecord(payload);
          const friends = Array.isArray(record.items)
            ? record.items
            : [];

          const targets = await Promise.all(
            friends.map(async (friend) => resolveAgentTargetFromFriend(asRecord(friend))),
          );
          return targets
            .filter((item): item is LocalChatTarget => Boolean(item))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'));
        },
        {
          flowId,
          source: 'listLocalChatTargets',
        },
      );

      setTargetsListCache(targets);
      emitLocalChatLog({
        level: 'info',
        message: 'local-chat:targets-load:done',
        flowId,
        source: 'listLocalChatTargets',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
        details: {
          count: targets.length,
          withWorldCount: targets.filter((item) => Boolean(item.worldId)).length,
        },
      });
      return targets;
    } catch (error) {
      emitLocalChatLog({
        level: 'error',
        message: 'local-chat:targets-load:failed',
        flowId,
        source: 'listLocalChatTargets',
        costMs: Number((performance.now() - startedAt).toFixed(2)),
        details: {
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
      throw error;
    } finally {
      setTargetsListInFlight(null);
    }
  })();

  setTargetsListInFlight(task);
  return task;
}
