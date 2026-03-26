import { useQuery } from '@tanstack/react-query';
import {
  getCreatorAgent,
  getWorldState,
  getWorldTruth,
  getWorldviewTruth,
  listCreatorAgents,
  listMyWorlds,
  listWorldDrafts,
  listWorldHistory,
  listWorldLorebooks,
  listWorldBindings,
} from '../data.js';
import type {
  WorldDraftSummary,
  WorldEventSummary,
  WorldMutationSummary,
  WorldStudioCreatorAgentSummary,
  WorldStudioResourceBindingSummary,
  WorldSummary,
} from '../ui/types.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function requireNonEmptyString(value: unknown, code: string): string {
  if (typeof value !== 'string') {
    throw new Error(code);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(code);
  }
  return normalized;
}

function requireFiniteNumber(value: unknown, code: string): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(code);
  }
  return normalized;
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

function toHistorySummaryList(payload: unknown): WorldEventSummary[] {
  const items = Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : [];
  return items
    .map((item, index) => {
      const record = toRecord(item);
      const metadata = toRecord(record.payload);
      const title = requireNonEmptyString(record.title, 'WORLD_STUDIO_HISTORY_TITLE_REQUIRED');
      const eventId = requireNonEmptyString(record.eventId, 'WORLD_STUDIO_HISTORY_EVENT_ID_REQUIRED');
      const worldId = requireNonEmptyString(record.worldId, 'WORLD_STUDIO_HISTORY_WORLD_ID_REQUIRED');
      const level = String(metadata.level || '').trim().toUpperCase();
      const eventHorizon = String(metadata.eventHorizon || '').trim().toUpperCase();
      const confidence = metadata.confidence === undefined
        ? (
            Array.isArray(record.evidenceRefs) && record.evidenceRefs.length > 0
              ? record.evidenceRefs.reduce((sum, entry) => {
                  const evidence = toRecord(entry);
                  return sum + requireFiniteNumber(evidence.confidence, 'WORLD_STUDIO_HISTORY_EVIDENCE_CONFIDENCE_REQUIRED');
                }, 0) / record.evidenceRefs.length
              : 0
          )
        : requireFiniteNumber(metadata.confidence, 'WORLD_STUDIO_HISTORY_CONFIDENCE_REQUIRED');
      return {
        id: eventId,
        worldId,
        timelineSeq: metadata.timelineSeq === undefined
          ? index + 1
          : requireFiniteNumber(metadata.timelineSeq, 'WORLD_STUDIO_HISTORY_TIMELINE_SEQ_REQUIRED'),
        level: level === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
        eventHorizon: eventHorizon === 'ONGOING'
          ? 'ONGOING'
          : eventHorizon === 'FUTURE'
            ? 'FUTURE'
            : 'PAST',
        parentEventId: toStringOrNull(metadata.parentEventId),
        title,
        summary: toStringOrNull(record.summary),
        cause: toStringOrNull(record.cause),
        process: toStringOrNull(record.process),
        result: toStringOrNull(record.result),
        timeRef: toStringOrNull(record.timeRef) || toStringOrNull(record.happenedAt),
        locationRefs: toStringArray(record.locationRefs),
        characterRefs: toStringArray(record.characterRefs),
        dependsOnEventIds: toStringArray(record.dependsOnEventIds),
        evidenceRefs: Array.isArray(record.evidenceRefs)
          ? record.evidenceRefs.filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>
          : [],
        confidence,
        needsEvidence: metadata.needsEvidence === undefined ? !(Array.isArray(record.evidenceRefs) && record.evidenceRefs.length > 0) : Boolean(metadata.needsEvidence),
        createdBy: requireNonEmptyString(record.createdBy, 'WORLD_STUDIO_HISTORY_CREATED_BY_REQUIRED'),
        updatedBy: requireNonEmptyString(record.createdBy || record.updatedBy, 'WORLD_STUDIO_HISTORY_UPDATED_BY_REQUIRED'),
        createdAt: requireNonEmptyString(record.committedAt || record.createdAt, 'WORLD_STUDIO_HISTORY_CREATED_AT_REQUIRED'),
        updatedAt: requireNonEmptyString(record.committedAt || record.updatedAt || record.createdAt, 'WORLD_STUDIO_HISTORY_UPDATED_AT_REQUIRED'),
      };
    });
}

function toMutationSummaryList(statePayload: unknown, historyItems: WorldEventSummary[]): WorldMutationSummary[] {
  const stateItems = Array.isArray(toRecord(statePayload).items) ? (toRecord(statePayload).items as unknown[]) : [];
  const stateTimeline = stateItems
    .map((item) => toRecord(item))
    .map((item) => ({
      id: requireNonEmptyString(item.id, 'WORLD_STUDIO_STATE_RECORD_ID_REQUIRED'),
      worldId: requireNonEmptyString(item.worldId, 'WORLD_STUDIO_STATE_RECORD_WORLD_ID_REQUIRED'),
      mutationType: 'SETTING_CHANGE' as const,
      targetPath: requireNonEmptyString(item.targetPath, 'WORLD_STUDIO_STATE_RECORD_TARGET_PATH_REQUIRED'),
      title: 'State commit',
      summary: requireNonEmptyString(item.targetPath, 'WORLD_STUDIO_STATE_RECORD_TARGET_PATH_REQUIRED'),
      reason: toStringOrNull(toRecord(item.metadata).reason),
      creatorId: requireNonEmptyString(item.createdBy, 'WORLD_STUDIO_STATE_RECORD_CREATED_BY_REQUIRED'),
      createdAt: requireNonEmptyString(item.committedAt, 'WORLD_STUDIO_STATE_RECORD_COMMITTED_AT_REQUIRED'),
    }));

  const historyTimeline = historyItems.map((item) => ({
    id: item.id,
    worldId: item.worldId,
    mutationType: 'EVENT_BATCH_UPSERT' as const,
    targetPath: `history:${item.level}`,
    title: item.title,
    summary: item.summary || item.title,
    reason: null,
    creatorId: item.createdBy,
    createdAt: item.createdAt,
  }));

  return [...stateTimeline, ...historyTimeline]
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
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

function toResourceBindingSummaryList(payload: unknown): WorldStudioResourceBindingSummary[] {
  const directItems = Array.isArray(payload)
    ? (payload as unknown[])
    : (Array.isArray(toRecord(payload).items) ? (toRecord(payload).items as unknown[]) : []);
  return directItems
    .map((item) => toRecord(item))
    .map((item) => {
      const resource = toRecord(item.resource);
      return {
        id: String(item.id || ''),
        targetType: String(item.hostType || ''),
        targetId: String(item.hostId || ''),
        slot: String(item.bindingPoint || ''),
        priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
        conditions: Object.keys(toRecord(item.conditions)).length > 0 ? toRecord(item.conditions) : null,
        tags: toStringArray(item.tags),
        resource: {
          id: toStringOrNull(resource.id),
          resourceType: toStringOrNull(resource.resourceType),
          storageRef: toStringOrNull(resource.storageRef || resource.url),
          label: toStringOrNull(resource.label || resource.title),
          provenance: toStringOrNull(resource.provenance),
          sourceRef: toStringOrNull(resource.sourceRef),
          tags: toStringArray(resource.tags),
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

  const stateQuery = useQuery({
    queryKey: ['world-studio', 'state', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await getWorldState(hookClient, input.worldId),
  });

  const worldTruthQuery = useQuery({
    queryKey: ['world-studio', 'truth', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await getWorldTruth(hookClient, input.worldId),
  });

  const worldviewTruthQuery = useQuery({
    queryKey: ['world-studio', 'truth-worldview', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await getWorldviewTruth(hookClient, input.worldId),
  });

  const lorebooksQuery = useQuery({
    queryKey: ['world-studio', 'lorebooks', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => await listWorldLorebooks(hookClient, input.worldId),
  });

  const eventsQuery = useQuery({
    queryKey: ['world-studio', 'history', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => toHistorySummaryList(await listWorldHistory(hookClient, input.worldId)),
  });

  const resourceBindingsQuery = useQuery({
    queryKey: ['world-studio', 'bindings', input.worldId],
    enabled: input.enabled && Boolean(input.worldId),
    retry: false,
    queryFn: async () => toResourceBindingSummaryList(await listWorldBindings(hookClient, input.worldId)),
  });

  const maintenanceTimeline = toMutationSummaryList(stateQuery.data, eventsQuery.data || []);

  return {
    draftsQuery,
    worldsQuery,
    creatorAgentsQuery,
    selectedAgentQuery,
    stateQuery,
    worldTruthQuery,
    worldviewTruthQuery,
    eventsQuery,
    lorebooksQuery,
    resourceBindingsQuery,
    maintenanceTimeline,
  };
}
