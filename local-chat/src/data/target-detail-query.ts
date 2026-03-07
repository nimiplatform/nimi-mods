import { createLocalChatFlowId, emitLocalChatLog } from '../logging.js';
import {
  CORE_DATA_API_USER_BY_HANDLE_GET,
  CORE_DATA_API_USER_BY_ID_GET,
  requireLocalChatCoreQueryBridge,
} from './core-query-bridge.js';
import {
  profileDenyCache,
  PROFILE_DENY_CACHE_TTL_MS,
  targetDetailCache,
  targetDetailInFlight,
} from './cache-store.js';
import { asNullableRecord, asNullableString, asString, withReadContext } from './read-context.js';
import { resolveWorldContext } from './world-context-resolver.js';
import type { LocalChatReadContext, LocalChatTarget } from './types.js';

function isAgentHandle(handle: string | null): boolean {
  return Boolean(handle && handle.startsWith('~'));
}

function extractWorldId(
  friendPayload: Record<string, unknown>,
  profilePayload: Record<string, unknown>,
): string | null {
  const direct = asString(profilePayload.worldId) || asString(friendPayload.worldId);
  if (direct) return direct;

  const agent = asNullableRecord(profilePayload.agent) || {};
  const fromAgent = asString(agent.worldId);
  if (fromAgent) return fromAgent;

  const agentProfile = asNullableRecord(profilePayload.agentProfile) || {};
  return asString(agentProfile.worldId) || asString(agentProfile.world_id);
}

function toTargetSeed(targetInput: Record<string, unknown>): LocalChatTarget | null {
  const id = asString(targetInput.id);
  if (!id) return null;

  const handle = asString(targetInput.handle) || id;
  const worldId = asString(targetInput.worldId);

  return {
    id,
    handle,
    displayName: asString(targetInput.displayName) || handle,
    avatarUrl: asNullableString(targetInput.avatarUrl),
    bio: asNullableString(targetInput.bio),
    friendsSince: asNullableString(targetInput.friendsSince),
    isAgent: Boolean(targetInput.isAgent) || isAgentHandle(handle),
    worldId,
    worldResolvedBy: worldId ? 'profile' : 'unresolved',
    agentMetadata: asNullableRecord(targetInput.agentMetadata) || {},
    agentProfile: asNullableRecord(targetInput.agentProfile) || {},
    world: asNullableRecord(targetInput.world),
    worldview: asNullableRecord(targetInput.worldview),
    payload: asNullableRecord(targetInput.payload) || {},
  };
}

export async function resolveLocalChatTargetDetail(
  context: LocalChatReadContext,
  targetInput: Record<string, unknown>,
): Promise<LocalChatTarget | null> {
  const flowId = createLocalChatFlowId('local-chat-target-detail');
  const seed = toTargetSeed(targetInput);
  if (!seed) {
    emitLocalChatLog({
      level: 'warn',
      message: 'local-chat:target-detail:skipped',
      flowId,
      source: 'resolveLocalChatTargetDetail',
      details: { reason: 'invalid-target' },
    });
    return null;
  }

  const cached = targetDetailCache.get(seed.id);
  if (cached) return cached;

  const inFlight = targetDetailInFlight.get(seed.id);
  if (inFlight) return inFlight;

  const task = (async () => {
    emitLocalChatLog({
      level: 'info',
      message: 'local-chat:target-detail:start',
      flowId,
      source: 'resolveLocalChatTargetDetail',
      details: { targetId: seed.id, handle: seed.handle },
    });

    if (seed.isAgent) {
      const worldContext = await resolveWorldContext(seed.worldId);
      const fastResolved: LocalChatTarget = {
        ...seed,
        world: seed.world || worldContext.world,
        worldview: seed.worldview || worldContext.worldview,
      };
      targetDetailCache.set(seed.id, fastResolved);
      emitLocalChatLog({
        level: 'info',
        message: 'local-chat:target-detail:done',
        flowId,
        source: 'resolveLocalChatTargetDetail',
        details: {
          targetId: seed.id,
          hasWorld: Boolean(fastResolved.world || fastResolved.worldview),
          worldId: fastResolved.worldId || null,
          source: 'seed-fast-path',
        },
      });
      return fastResolved;
    }

    const resolved = await withReadContext(
      context,
      async () => {
        let profile: Record<string, unknown> | null = null;

        if (!profile && isAgentHandle(seed.handle)) {
          const denyKey = `handle:${seed.handle}`;
          const denyUntil = profileDenyCache.get(denyKey) || 0;
          if (denyUntil <= Date.now()) {
            profile = await requireLocalChatCoreQueryBridge()
              .query(CORE_DATA_API_USER_BY_HANDLE_GET, { handle: seed.handle })
              .then((payload) => asNullableRecord(payload))
              .catch(() => null);
            if (!profile) {
              profileDenyCache.set(denyKey, Date.now() + PROFILE_DENY_CACHE_TTL_MS);
            }
          }
        }

        const profilePayload = asNullableRecord(profile) || {};
        const handle = asString(profilePayload.handle) || seed.handle || seed.id;
        const isAgent = Boolean(profilePayload.isAgent) || isAgentHandle(handle);
        if (!isAgent) {
          return null;
        }

        const worldId = extractWorldId(seed.payload, profilePayload) || seed.worldId;
        const worldContext = await resolveWorldContext(worldId);

        return {
          id: seed.id,
          handle,
          displayName: asString(profilePayload.displayName) || seed.displayName || handle,
          avatarUrl: asNullableString(profilePayload.avatarUrl) ?? seed.avatarUrl,
          bio: asNullableString(profilePayload.bio) ?? seed.bio,
          friendsSince: seed.friendsSince,
          isAgent: true,
          worldId,
          worldResolvedBy: worldId ? 'profile' : 'unresolved',
          agentMetadata: asNullableRecord(profilePayload.agent) || {},
          agentProfile: asNullableRecord(profilePayload.agentProfile) || {},
          world: worldContext.world,
          worldview: worldContext.worldview,
          payload: Object.keys(profilePayload).length > 0 ? profilePayload : seed.payload,
        } as LocalChatTarget;
      },
      {
        flowId,
        source: 'resolveLocalChatTargetDetail',
      },
    );

    if (resolved) {
      targetDetailCache.set(seed.id, resolved);
    }

    emitLocalChatLog({
      level: 'info',
      message: 'local-chat:target-detail:done',
      flowId,
      source: 'resolveLocalChatTargetDetail',
      details: {
        targetId: seed.id,
        hasWorld: Boolean(resolved?.world || resolved?.worldview),
        worldId: resolved?.worldId || null,
      },
    });

    return resolved;
  })().finally(() => {
    targetDetailInFlight.delete(seed.id);
  });

  targetDetailInFlight.set(seed.id, task);
  return task;
}
