import { useQuery } from '@tanstack/react-query';
import { listMyWorlds, listWorldDrafts, listWorldEvents, getWorldMaintenance, listWorldLorebooks, listWorldVisualBindings, listWorldMutations, } from '../data.js';
import type { WorldDraftSummary, WorldEventSummary, WorldMutationSummary, WorldSummary, } from '../ui/types.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function toStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
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
        description: toStringOrNull(item.description),
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
        locationRefs: Array.isArray(item.locationRefs)
            ? item.locationRefs.map((entry) => String(entry || '')).filter(Boolean)
            : [],
        characterRefs: Array.isArray(item.characterRefs)
            ? item.characterRefs.map((entry) => String(entry || '')).filter(Boolean)
            : [],
        dependsOnEventIds: Array.isArray(item.dependsOnEventIds)
            ? item.dependsOnEventIds.map((entry) => String(entry || '')).filter(Boolean)
            : [],
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
export function useWorldStudioResourceQueries(hookClient: HookClient, input: {
    enabled: boolean;
    worldId: string;
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
    const visualBindingsQuery = useQuery({
        queryKey: ['world-studio', 'visual-bindings', input.worldId],
        enabled: input.enabled && Boolean(input.worldId),
        retry: false,
        queryFn: async () => await listWorldVisualBindings(hookClient, input.worldId),
    });
    return {
        draftsQuery,
        worldsQuery,
        maintenanceQuery,
        eventsQuery,
        lorebooksQuery,
        mutationsQuery,
        visualBindingsQuery,
    };
}
