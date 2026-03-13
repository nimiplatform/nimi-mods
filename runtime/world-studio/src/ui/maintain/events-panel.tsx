import React from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { EventGraphMaintenance } from './event-graph-maintenance.js';

type EventsPanelProps = {
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  syncMode: 'merge' | 'replace';
  editorSnapshotVersion?: string;
  eventGraphLayout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  working: boolean;
  onEventsChange: (value: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onEventGraphLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onSyncModeChange: (mode: 'merge' | 'replace') => void;
  onSyncEvents: () => void;
  onDeleteFirstEvent: () => void;
  showActions?: boolean;
};

export function EventsPanel(props: EventsPanelProps) {
  const graph = props.events;
  const totalEvents = graph.primary.length + graph.secondary.length;

  return (
    <EventGraphMaintenance
      events={graph}
      syncMode={props.syncMode}
      editorSnapshotVersion={props.editorSnapshotVersion}
      layout={props.eventGraphLayout}
      working={props.working}
      onSyncModeChange={props.onSyncModeChange}
      onSyncEvents={() => {
        if (props.syncMode === 'replace' && totalEvents > 0) {
          const confirmed = typeof window !== 'undefined'
            ? window.confirm(
              'Replace mode will archive current active remote events and rewrite them from your graph. Continue?',
            )
            : true;
          if (!confirmed) return;
        }
        props.onSyncEvents();
      }}
      onDeleteFirstEvent={props.onDeleteFirstEvent}
      onLayoutChange={props.onEventGraphLayoutChange}
      onEventsChange={props.onEventsChange}
      showActions={props.showActions}
    />
  );
}
