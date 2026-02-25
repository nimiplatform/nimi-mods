import React from 'react';
import type { EventNodeDraft, WorldLorebookDraftRow } from '../../contracts.js';
import { WorldBasePanel } from '../maintain/world-base-panel.js';
import { WorldviewPanel } from '../maintain/worldview-panel.js';
import { LorebooksPanel } from '../maintain/lorebooks-panel.js';
import { EventGraphEditor } from './event-graph-editor.js';

type DraftEditorPanelProps = {
  sourceText: string;
  worldPatch: Record<string, unknown>;
  worldviewPatch: Record<string, unknown>;
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  lorebooksDraft: WorldLorebookDraftRow[];
  onWorldPatchChange: (value: Record<string, unknown>) => void;
  onWorldviewPatchChange: (value: Record<string, unknown>) => void;
  onEventsChange: (value: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
  eventGraphLayout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  onEventGraphLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
};

export function DraftEditorPanel(props: DraftEditorPanelProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Draft Editor</h3>
        <p className="mt-1 text-xs text-gray-500">
          Structured editing path. Raw JSON is only shown in debug folds.
        </p>
      </section>

      <WorldBasePanel
        worldPatch={props.worldPatch}
        onWorldPatchChange={props.onWorldPatchChange}
      />

      <WorldviewPanel
        worldviewPatch={props.worldviewPatch}
        onWorldviewPatchChange={props.onWorldviewPatchChange}
      />

      <EventGraphEditor
        title="Event Graph"
        events={props.events}
        sourceContextText={props.sourceText}
        onChange={props.onEventsChange}
        layout={props.eventGraphLayout}
        onLayoutChange={props.onEventGraphLayoutChange}
      />

      <LorebooksPanel
        lorebooksDraft={props.lorebooksDraft}
        working={false}
        onLorebooksChange={props.onLorebooksChange}
        onSyncLorebooks={() => undefined}
        onDeleteFirstLorebook={() => undefined}
        showActions={false}
      />
    </div>
  );
}
