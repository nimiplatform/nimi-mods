import React from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { EventGraphWorkbench } from '../shared/event-graph-workbench.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

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
  const { t } = useModTranslation('world-studio');
  const graph = props.events;
  const totalEvents = graph.primary.length + graph.secondary.length;

  return (
    <EventGraphWorkbench
      title={t('eventGraphMaintenance.title', 'Events (Primary / Secondary)')}
      events={graph}
      layout={props.eventGraphLayout}
      onEventsChange={props.onEventsChange}
      onLayoutChange={props.onEventGraphLayoutChange}
      sync={{
        mode: props.syncMode,
        snapshotVersion: props.editorSnapshotVersion,
        showActions: props.showActions,
        working: props.working,
        onModeChange: props.onSyncModeChange,
        onSync: () => {
          if (props.syncMode === 'replace' && totalEvents > 0) {
            const confirmed = typeof window !== 'undefined'
              ? window.confirm(
                'Replace mode will archive current active remote events and rewrite them from your graph. Continue?',
              )
              : true;
            if (!confirmed) return;
          }
          props.onSyncEvents();
        },
      }}
    />
  );
}
