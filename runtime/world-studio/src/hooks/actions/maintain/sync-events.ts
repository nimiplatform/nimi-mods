import { emitWorldStudioLog } from '../../../logging.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import { WORLD_STUDIO_HISTORY_EVENT_TYPE, WORLD_STUDIO_STATE_TARGET_PATH } from '../../../contracts.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";

function requireWorkspaceStateRef(payload: unknown): {
    recordId: string;
    scope: 'WORLD' | 'ENTITY' | 'RELATION';
    scopeKey: string;
    version?: string;
} {
    const record = asRecord(payload);
    const items = Array.isArray(record.items) ? record.items : [];
    const workspaceItem = items.find((item) => asRecord(item).targetPath === WORLD_STUDIO_STATE_TARGET_PATH);
    if (!workspaceItem) {
        throw new Error('WORLD_STUDIO_HISTORY_RELATED_STATE_REF_REQUIRED');
    }
    const itemRecord = asRecord(workspaceItem);
    const scope = String(itemRecord.scope || '').trim();
    if (scope !== 'WORLD' && scope !== 'ENTITY' && scope !== 'RELATION') {
        throw new Error('WORLD_STUDIO_HISTORY_RELATED_STATE_SCOPE_REQUIRED');
    }
    const recordId = String(itemRecord.id || '').trim();
    const scopeKey = String(itemRecord.scopeKey || '').trim();
    if (!recordId || !scopeKey) {
        throw new Error('WORLD_STUDIO_HISTORY_RELATED_STATE_REF_REQUIRED');
    }
    const version = String(itemRecord.version || '').trim();
    return {
        recordId,
        scope,
        scopeKey,
        ...(version ? { version } : {}),
    };
}

function toHistoryAppend(event: Record<string, unknown>, relatedStateRefs: Array<{
    recordId: string;
    scope: 'WORLD' | 'ENTITY' | 'RELATION';
    scopeKey: string;
    version?: string;
}>) {
    const timeRef = String(event.timeRef || '').trim();
    return {
        eventId: typeof event.id === 'string' ? event.id : undefined,
        eventType: WORLD_STUDIO_HISTORY_EVENT_TYPE,
        title: String(event.title || '').trim(),
        happenedAt: timeRef || new Date().toISOString(),
        operation: 'APPEND',
        visibility: 'WORLD',
        summary: typeof event.summary === 'string' ? event.summary : undefined,
        cause: typeof event.cause === 'string' ? event.cause : undefined,
        process: typeof event.process === 'string' ? event.process : undefined,
        result: typeof event.result === 'string' ? event.result : undefined,
        timeRef: timeRef || undefined,
        locationRefs: Array.isArray(event.locationRefs) ? event.locationRefs : [],
        characterRefs: Array.isArray(event.characterRefs) ? event.characterRefs : [],
        dependsOnEventIds: Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : [],
        evidenceRefs: Array.isArray(event.evidenceRefs) ? event.evidenceRefs : [],
        relatedStateRefs,
        payload: {
            timelineSeq: Number(event.timelineSeq || 0),
            level: event.level === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
            eventHorizon: event.eventHorizon === 'ONGOING'
                ? 'ONGOING'
                : event.eventHorizon === 'FUTURE'
                    ? 'FUTURE'
                    : 'PAST',
            parentEventId: typeof event.parentEventId === 'string' ? event.parentEventId : null,
            confidence: Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0.5,
            needsEvidence: Boolean(event.needsEvidence),
        },
    };
}

export async function syncEvents(context: WorldStudioMaintainActionContext, payload?: WorldStudioMaintainActionPayload) {
    if (!context.selectedWorldId)
        return;
    const started = context.taskController.startTask({
        kind: 'MAINTAIN_SYNC_EVENTS',
        label: worldStudioMessage('task.syncEventsLabel', 'Sync events'),
        atomic: false,
        resumable: false,
        canPause: false,
        canCancel: true,
        step: 'MAINTAIN',
        message: worldStudioMessage('task.syncingEvents', 'Syncing events'),
    });
    if (!started) {
        context.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
        return;
    }
    context.setError(null);
    const force = Boolean(payload?.force);
    emitWorldStudioLog({
        level: 'info',
        message: 'world:event:batch-upsert:start',
        flowId: context.flowId,
        source: 'WorldStudioPage.onSyncEvents',
        details: { worldId: context.selectedWorldId },
    });
    try {
        if (context.eventSyncMode === 'replace') {
            throw new Error('WORLD_HISTORY_APPEND_ONLY');
        }
        if (context.taskController.shouldCancel(started.taskId)) {
            context.taskController.cancelTask(started.taskId, worldStudioMessage('task.eventSyncCanceled', 'Event sync canceled'));
            context.setNotice(worldStudioMessage('notice.eventSyncCanceled', 'Event sync canceled.'));
            return;
        }
        context.taskController.updateTask(started.taskId, {
            canCancel: false,
            message: worldStudioMessage('task.submittingEventSync', 'Submitting event sync'),
            progress: 0.2,
        });
        const relatedStateRef = requireWorkspaceStateRef(context.queries.stateQuery.data);
        const historyAppends = [
            ...context.eventsGraph.primary,
            ...context.eventsGraph.secondary,
        ].map((event) => toHistoryAppend(asRecord(event), [relatedStateRef]));
        const data = asRecord(await context.mutations.syncEventsMutation.mutateAsync({
            worldId: context.selectedWorldId,
            historyAppends,
            reason: 'World Studio events sync',
            sessionId: context.flowId,
            ...(!force ? { ifSnapshotVersion: context.snapshot.editorSnapshotVersion || undefined } : {}),
        }));
        context.patchSnapshot({
            editorSnapshotVersion: String(data.version || context.snapshot.editorSnapshotVersion || ''),
            unsavedChangesByPanel: {
                ...context.snapshot.unsavedChangesByPanel,
                worldEvents: false,
            },
        });
        context.setStatusBanner({
            kind: 'success',
            message: worldStudioMessage('banner.eventsSynchronized', 'Events synchronized'),
        });
        context.taskController.completeTask(started.taskId, worldStudioMessage('task.eventsSynchronized', 'Events synchronized'));
        await Promise.all([
            context.queries.stateQuery.refetch(),
            context.queries.eventsQuery.refetch(),
        ]);
        emitWorldStudioLog({
            level: 'info',
            message: 'world:event:batch-upsert:done',
            flowId: context.flowId,
            source: 'WorldStudioPage.onSyncEvents',
            details: { worldId: context.selectedWorldId, count: historyAppends.length },
        });
    }
    catch (syncError) {
        context.taskController.failTask(started.taskId, syncError);
        context.setError(syncError instanceof Error ? syncError.message : String(syncError));
        emitWorldStudioLog({
            level: 'error',
            message: 'world:event:batch-upsert:failed',
            flowId: context.flowId,
            source: 'WorldStudioPage.onSyncEvents',
            details: {
                worldId: context.selectedWorldId,
                error: syncError instanceof Error ? syncError.message : String(syncError),
            },
        });
        if ((syncError instanceof Error ? syncError.message : String(syncError)).includes('WORLD_MAINTENANCE_VERSION_CONFLICT')) {
            context.setError('WORLD_STUDIO_MAINTENANCE_CONFLICT: event graph is stale. Use Reload Remote or Force Sync Events.');
        }
    }
}
