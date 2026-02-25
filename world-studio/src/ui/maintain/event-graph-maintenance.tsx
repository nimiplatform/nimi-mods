import React from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { EventGraphEditor } from '../create/event-graph-editor.js';

type EventGraphMaintenanceProps = {
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  syncMode: 'merge' | 'replace';
  editorSnapshotVersion?: string;
  layout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  working: boolean;
  onEventsChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onSyncModeChange: (mode: 'merge' | 'replace') => void;
  onSyncEvents: () => void;
  onDeleteFirstEvent: () => void;
};

export function EventGraphMaintenance(props: EventGraphMaintenanceProps) {
  const totalEvents = props.events.primary.length + props.events.secondary.length;
  const missingPrimaryEvidence = props.events.primary.filter((item) => item.evidenceRefs.length === 0).length;
  const primaryIds = new Set(props.events.primary.map((item) => String(item.id || '').trim()).filter(Boolean));
  const orphanSecondary = props.events.secondary.filter((item) => {
    const parentId = String(item.parentEventId || '').trim();
    return !parentId || !primaryIds.has(parentId);
  }).length;

  return (
    <div className="space-y-3">
      <EventGraphEditor
        title="Events (Primary / Secondary)"
        events={props.events}
        onChange={props.onEventsChange}
        layout={props.layout}
        onLayoutChange={props.onLayoutChange}
      />

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <p>Snapshot: {props.editorSnapshotVersion || '-'}</p>
          <p>Events: total {totalEvents} · primary {props.events.primary.length} · secondary {props.events.secondary.length}</p>
          <p>Primary missing evidence: {missingPrimaryEvidence} · orphan secondary: {orphanSecondary}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <label className="text-xs text-gray-700">
            <span className="mb-1 block font-medium">Bulk Sync Mode</span>
            <select
              className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
              value={props.syncMode}
              onChange={(event) => props.onSyncModeChange(
                event.target.value === 'replace' ? 'replace' : 'merge',
              )}
            >
              <option value="merge">merge (incremental update)</option>
              <option value="replace">replace (full graph overwrite)</option>
            </select>
          </label>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            `replace` clears existing events first then rewrites from current graph; `merge` only does incremental upsert.
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={props.onSyncEvents}
          disabled={props.working}
          >
            Sync Events ({props.syncMode})
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
          onClick={props.onDeleteFirstEvent}
          disabled={props.working}
          >
            Delete First Event
          </button>
        </div>
      </section>
    </div>
  );
}
