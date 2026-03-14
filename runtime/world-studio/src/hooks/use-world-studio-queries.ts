import { useQuery } from '@tanstack/react-query';
import {
  getCreatorAgent,
  getWorldMaintenance,
  listCreatorAgents,
  listMyWorlds,
  listWorldDrafts,
  listWorldEvents,
  listWorldLorebooks,
  listWorldMediaBindings,
  listWorldMutations,
} from '../data.js';
import type {
  WorldDraftSummary,
  WorldEventSummary,
  WorldMutationSummary,
  WorldStudioCreatorAgentSummary,
  WorldStudioMediaBindingSummary,
  WorldSummary,
} from '../ui/types.js';
import { type HookClient } from "@nimiplatform/sdk/mod";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function toDraftSummaryList(payload: unknown): WorldDraftSummary[] {
  const items = Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : [];
  return items
    .map((item) => toRecord(item))
    .map((item) => ({
      id: String(item.id || ''),
      targetWorldId: toStringOrNull(item.targetWorldId),
      status: String(item.status || 'DRAFT') as WorldDraftSummary['status'],
      sourceType: String(item.sourceType || 'TEXT') as WorldDraftSummary['sourceType'],
      sourceRef: toStringOrNull(item.sourceRef),
      updatedAt: String(item.updatedAt || ''),
      publishedAt: toStringOrNull(item.publishedAt),
    }))
    .filter((item) => Boolean(item.id));
}

function toWorldSummaryList(payload: unknown): WorldSummary[] {
  const items = Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : [];
  return items
    .map((item) => toRecord(item))
    .map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || 'Untitled World'),
      status: String(item.status || 'DRAFT') as WorldSummary['status'],
      tagline: toStringOrNull(item.tagline),
      motto: toStringOrNull(item.motto),
      overview: toStringOrNull(item.overview),
      description: toStringOrNull(item.description),
      contentRating: toStringOrNull(item.contentRating),
      updatedAt: String(item.updatedAt || ''),
    }))
    .filter((item) => Boolean(item.id));
}

function toMutationSummaryList(payload: unknown): WorldMutationSummary[] {
  const items = Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : [];
  return items
    .map((item) => toRecord(item))
    .map((item) => ({
      id: String(item.id || ''),
      worldId: String(item.worldId || ''),
      mutationType: String(item.mutationType || 'SETTING_CHANGE') as WorldMutationSummary['mutationType'],
      targetPath: String(item.targetPath || ''),
      reason: toStringOrNull(item.reason),
      creatorId: String(item.creatorId || ''),
      createdAt: String(item.createdAt || ''),
    }))
    .filter((item) => Boolean(item.id));
}

function toEventSummaryList(payload: unknown): WorldEventSummary[] {
  const items = Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : [];
  return items
    .map((item) => toRecord(item))
    .map((item) => ({
      id: String(item.id || ''),
      worldId: String(item.worldId || ''),
      timelineSeq: Number.isFinite(Number(item.timelineSeq)) ? Number(item.timelineSeq) : 0,
      level: String(item.level || 'PRIMARY') as WorldEventSummary['level'],
      eventHorizon: String(item.eventHorizon || 'PAST') as WorldEventSummary['eventHorizon'],
      parentEventId: toStringOrNull(item.parentEventId),
      title: String(item.title || 'Untitled Event'),
      summary: toStringOrNull(item.summary),
      cause: toStringOrNull(item.cause),
      process: toStringOrNull(item.process),
      result: toStringOrNull(item.result),
      timeRef: toStringOrNull(item.timeRef),
      locationRefs: toStringArray(item.locationRefs),
      characterRefs: toStringArray(item.characterRefs),
      dependsOnEventIds: toStringArray(item.dependsOnEventIds),
      evidenceRefs: Array.isArray(item.evidenceRefs)
        ? item.evidenceRefs.filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>
        : [],
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.5,
      needsEvidence: Boolean(item.needsEvidence),
      createdBy: String(item.createdBy || ''),
      updatedBy: String(item.updatedBy || ''),
      createdAt: String(item.createdAt || ''),
      updatedAt: String(item.updatedAt || ''),
    }))
    .filter((item) => Boolean(item.id));
}

function toCreatorAgentSummaryFromUser(
  userInput: unknown,
  overrides?: {
    capabilities?: unknown;
  },
): WorldStudioCreatorAgentSummary | null {
  const user = toRecord(userInput);
  const agent = toRecord(user.agent);
  const agentProfile = toRecord(user.agentProfile);
  const id = String(user.id || '').trim();
  if (!id) {
    return null;
  }
  const capabilities = toRecord(overrides?.capabilities || user.capabilities || agentProfile.dna);
  const statsRaw = toRecord(agentProfile.stats || agent.stats);
  return {
    id,
    handle: String(user.handle || ''),
    displayName: String(user.displayName || user.handle || id),
    avatarUrl: toStringOrNull(user.avatarUrl),
    bio: toStringOrNull(user.bio),
    tags: toStringArray(user.tags),
    category: toStringOrNull(user.category || agent.category),
    contentRating: toStringOrNull(user.contentRating),
    webhookUrl: toStringOrNull(user.webhookUrl),
    capabilities,
    ownershipType: toStringOrNull(agentProfile.ownershipType || agent.ownershipType),
    importance: toStringOrNull(agentProfile.importance || agent.importance),
    state: toStringOrNull(agentProfile.state || agent.state),
    worldId: toStringOrNull(agentProfile.worldId || agent.worldId),
    activeWorldId: toStringOrNull(agentProfile.activeWorldId || agent.activeWorldId),
    ownerWorldId: toStringOrNull(agentProfile.ownerWorldId || agent.ownerWorldId),
    dna: Object.keys(capabilities).length > 0 ? capabilities : null,
    liveState: Object.keys(toRecord(agentProfile.liveState || agent.liveState)).length > 0
      ? toRecord(agentProfile.liveState || agent.liveState)
      : null,
    stats: Object.keys(statsRaw).length > 0
      ? {
          influenceTier: toStringOrNull(statsRaw.influenceTier),
          interactionTier: toStringOrNull(statsRaw.interactionTier),
          vitalityScore: Number.isFinite(Number(statsRaw.vitalityScore)) ? Number(statsRaw.vitalityScore) : null,
          lastActiveAt: toStringOrNull(statsRaw.lastActiveAt),
          engagementCount: Number.isFinite(Number(statsRaw.engagementCount)) ? Number(statsRaw.engagementCount) : null,
        }
      : null,
  };
}

function toCreatorAgentSummaryList(payload: unknown): WorldStudioCreatorAgentSummary[] {
  const directItems = Array.isArray(payload)
    ? (payload as unknown[])
    : (Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : []);
  return directItems
    .map((item) => {
      const record = toRecord(item);
      if (record.user && typeof record.user === 'object') {
        return toCreatorAgentSummaryFromUser(record.user, { capabilities: record.capabilities || record.dna });
      }
      return toCreatorAgentSummaryFromUser(record);
    })
    .filter((item): item is WorldStudioCreatorAgentSummary => Boolean(item));
}

function toCreatorAgentSummary(payload: unknown): WorldStudioCreatorAgentSummary | null {
  const record = toRecord(payload);
  if (record.user && typeof record.user === 'object') {
    return toCreatorAgentSummaryFromUser(record.user, { capabilities: record.capabilities });
  }
  return toCreatorAgentSummaryFromUser(record);
}

function toMediaBindingSummaryList(payload: unknown): WorldStudioMediaBindingSummary[] {
  const directItems = Array.isArray(payload)
    ? (payload as unknown[])
    : (Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : []);
  return directItems
    .map((item) => toRecord(item))
    .map((item) => {
      const asset = toRecord(item.asset);
      return {
        id: String(item.id || ''),
        targetType: String(item.targetType || ''),
        targetId: String(item.targetId || ''),
        slot: String(item.slot || ''),
        priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
        conditions: Object.keys(toRecord(item.conditions)).length > 0 ? toRecord(item.conditions) : null,
        tags: toStringArray(item.tags),
        asset: {
          id: toStringOrNull(asset.id),
          mediaType: toStringOrNull(asset.mediaType),
          storageRef: toStringOrNull(asset.storageRef || asset.url),
          label: toStringOrNull(asset.label || asset.title),
          provenance: toStringOrNull(asset.provenance),
          sourceRef: toStringOrNull(asset.sourceRef),
          tags: toStringArray(asset.tags),
        },
      };
    })
    .filter((item) => Boolean(item.id || item.slot || item.targetId));
}

export function useWorldStudioResourceQueries(hookClient: HookClient, input: {
  enabled: boolean;
  worldId: string;
  selectedAgentId?: string;
  enableCollections?: boolean;
}) {
  const enableCollections = input.enableCollections !== false;

  const draftsQuery = useQuery({
    queryKey: ['world-studio', 'drafts'],
    enabled: input.enabled && enableCollections,
    retry: false,
    queryFn: async () => toDraftSummaryList(await listWorldDrafts(hookClient)),
  });

  const worldsQuery = useQuery({
    queryKey: ['world-studio', 'worlds-mine'],
    enabled: input.enabled && enableCollections,
    retry: false,
    queryFn: async () => toWorldSummaryList(await listMyWorlds(hookClient)),
  });

  const creatorAgentsQuery = useQuery({
    queryKey: ['world-studio', 'creator-agents'],
    enabled: input.enabled && enableCollections,
    retry: false,
    queryFn: async () => toCreatorAgentSummaryList(await listCreatorAgents(hookClient)),
  });

  const selectedAgentQuery = useQuery({
    queryKey: ['world-studio', 'creator-agent', input.selectedAgentId || ''],
    enabled: input.enabled && Boolean(input.selectedAgentId),
    retry: false,
    queryFn: async () => toCreatorAgentSummary(await getCreatorAgent(hookClient, String(input.selectedAgentId || ''))),
  });

  const maintenanceQuery = useQuery({
    queryKey: ['world-studio', 'maintenance', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await getWorldMaintenance(hookClient, input.worldId),
  });

  const lorebooksQuery = useQuery({
    queryKey: ['world-studio', 'lorebooks', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await listWorldLorebooks(hookClient, input.worldId),
  });

  const eventsQuery = useQuery({
    queryKey: ['world-studio', 'events', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => toEventSummaryList(await listWorldEvents(hookClient, input.worldId)),
  });

  const mutationsQuery = useQuery({
    queryKey: ['world-studio', 'mutations', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => toMutationSummaryList(await listWorldMutations(hookClient, input.worldId)),
  });

  const mediaBindingsQuery = useQuery({
    queryKey: ['world-studio', 'media-bindings', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => toMediaBindingSummaryList(await listWorldMediaBindings(hookClient, input.worldId)),
  });

  return {
    draftsQuery,
    worldsQuery,
    creatorAgentsQuery,
    selectedAgentQuery,
    maintenanceQuery,
    eventsQuery,
    lorebooksQuery,
    mutationsQuery,
    mediaBindingsQuery,
  };
}
