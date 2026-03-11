import React from 'react';
import type { EventNodeDraft } from '../../../contracts.js';
import { EventDetailDrawer } from '../event-detail-drawer.js';

type EventGraphEditorCanvasProps = {
  readonly?: boolean;
  graphPrimary: EventNodeDraft[];
  graphSecondary: EventNodeDraft[];
  selectedEventId: string;
  expandedPrimaryIds: string[];
  activePrimaryId: string;
  secondaryForPrimary: EventNodeDraft[];
  selected: EventNodeDraft | null;
  sourceContextText?: string;
  onToggleExpanded: (primaryId: string) => void;
  onMovePrimary: (eventId: string, direction: 'up' | 'down') => void;
  onMoveSecondary: (eventId: string, parentEventId: string, direction: 'up' | 'down') => void;
  onSelect: (eventId: string) => void;
  onChangeSelected: (next: EventNodeDraft) => void;
  onDeleteSelected: () => void;
};

export function EventGraphEditorCanvas(props: EventGraphEditorCanvasProps) {
  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-[280px_280px_1fr]">
      <div className="ui-sync-soft-card p-2.5">
        <p className="text-xs font-semibold text-gray-700">Primary Events</p>
        <div className="mt-2 max-h-[420px] space-y-2 overflow-auto">
          {props.graphPrimary.length === 0 ? (
            <p className="text-[11px] text-gray-500">No primary events yet.</p>
          ) : props.graphPrimary.map((event) => (
            <div
              key={`primary-${event.id}`}
              className={`ui-sync-node-card w-full px-2 py-1.5 text-left ${
                props.selectedEventId === event.id
                  ? 'ui-sync-node-card-selected border-brand-300 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600"
                  onClick={() => props.onToggleExpanded(event.id)}
                  title={props.expandedPrimaryIds.includes(event.id) ? 'Collapse' : 'Expand'}
                >
                  {props.expandedPrimaryIds.includes(event.id) ? '-' : '+'}
                </button>
                {!props.readonly ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMovePrimary(event.id, 'up')}
                      disabled={props.graphPrimary.findIndex((item) => item.id === event.id) === 0}
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMovePrimary(event.id, 'down')}
                      disabled={props.graphPrimary.findIndex((item) => item.id === event.id) === props.graphPrimary.length - 1}
                      title="Move Down"
                    >
                      ↓
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => props.onSelect(event.id)}
                >
                  <p className="truncate text-xs font-semibold text-gray-900">{event.title || event.id}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Secondary {props.graphSecondary.filter((item) => item.parentEventId === event.id).length} · Evidence {event.evidenceRefs.length}
                  </p>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-sync-soft-card p-2.5">
        <p className="text-xs font-semibold text-gray-700">Secondary Events</p>
        <p className="mt-0.5 text-[11px] text-gray-500">Parent Event: {props.activePrimaryId || '-'}</p>
        <div className="mt-2 max-h-[420px] space-y-2 overflow-auto">
          {props.secondaryForPrimary.length === 0 ? (
            <p className="text-[11px] text-gray-500">No secondary events under the selected parent.</p>
          ) : props.secondaryForPrimary.map((event) => (
            <div
              key={`secondary-${event.id}`}
              className={`ui-sync-node-card w-full px-2 py-1.5 text-left ${
                props.selectedEventId === event.id
                  ? 'ui-sync-node-card-selected border-brand-300 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {!props.readonly ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMoveSecondary(event.id, props.activePrimaryId, 'up')}
                      disabled={props.secondaryForPrimary.findIndex((item) => item.id === event.id) === 0}
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMoveSecondary(event.id, props.activePrimaryId, 'down')}
                      disabled={props.secondaryForPrimary.findIndex((item) => item.id === event.id) === props.secondaryForPrimary.length - 1}
                      title="Move Down"
                    >
                      ↓
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => props.onSelect(event.id)}
                >
                  <p className="truncate text-xs font-semibold text-gray-900">{event.title || event.id}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">Evidence {event.evidenceRefs.length}</p>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {props.selected ? (
        <EventDetailDrawer
          event={props.selected}
          sourceContextText={props.sourceContextText}
          onChange={props.onChangeSelected}
          onDelete={props.onDeleteSelected}
        />
      ) : (
        <div className="ui-sync-empty-card p-4 text-xs text-gray-500">
          Select an event to edit details.
        </div>
      )}
    </div>
  );
}
