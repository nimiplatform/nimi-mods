import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { emitWorldStudioLog } from '../../../logging.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { EventNodeDraft } from '../../../contracts.js';
import { toWorldEventUpsertPayloadList } from '../../../services/world-event-upsert-payload.js';
import type { WorldStudioMaintainActionContext, WorldStudioMaintainActionPayload } from './types.js';

export async function syncEvents(
  context: WorldStudioMaintainActionContext,
  payload?: WorldStudioMaintainActionPayload,
) {
  if (!context.selectedWorldId) return;

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

    const events = context.eventsGraph;
    const eventUpserts = toWorldEventUpsertPayloadList([
      ...events.primary,
      ...events.secondary,
    ]);
    const data = asRecord(await context.mutations.syncEventsMutation.mutateAsync({
      worldId: context.selectedWorldId,
      eventUpserts,
      mode: context.eventSyncMode,
      reason: 'World Studio events sync',
      ...(!force ? { ifSnapshotVersion: context.snapshot.editorSnapshotVersion || undefined } : {}),
    }));
    const syncedItems = Array.isArray(data.items)
      ? (data.items as Array<Record<string, unknown>>)
      : [];
    if (syncedItems.length > 0) {
      const primary = syncedItems.filter((item) => String(item.level || '').toUpperCase() === 'PRIMARY');
      const secondary = syncedItems.filter((item) => String(item.level || '').toUpperCase() === 'SECONDARY');
      context.patchSnapshot({
        eventsDraft: {
          primary: primary as EventNodeDraft[],
          secondary: secondary as EventNodeDraft[],
        },
        knowledgeGraph: {
          ...context.snapshot.knowledgeGraph,
          events: {
            primary: primary as EventNodeDraft[],
            secondary: secondary as EventNodeDraft[],
          },
        },
      });
    }
    context.patchSnapshot({
      editorSnapshotVersion: String(data.editorSnapshotVersion || context.snapshot.editorSnapshotVersion || ''),
      unsavedChangesByPanel: {
        ...context.snapshot.unsavedChangesByPanel,
        events: false,
      },
    });
    context.setStatusBanner({
      kind: 'success',
      message: worldStudioMessage('banner.eventsSynchronized', 'Events synchronized'),
    });
    context.taskController.completeTask(started.taskId, worldStudioMessage('task.eventsSynchronized', 'Events synchronized'));
    await Promise.all([
      context.queries.eventsQuery.refetch(),
      context.queries.mutationsQuery.refetch(),
    ]);
    emitWorldStudioLog({
      level: 'info',
      message: 'world:event:batch-upsert:done',
      flowId: context.flowId,
      source: 'WorldStudioPage.onSyncEvents',
      details: { worldId: context.selectedWorldId, count: eventUpserts.length },
    });
  } catch (syncError) {
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
