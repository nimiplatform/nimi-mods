import React from 'react';
import type { Phase1Result } from '../../generation/pipeline.js';
import type { EventNodeDraft } from '../../contracts.js';
import { EventGraphEditor } from './event-graph-editor.js';

type CheckpointsPanelProps = {
  phase1: Phase1Result | null;
  sourceText: string;
  selectedStartTimeId: string;
  selectedCharacters: string[];
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  eventGraphLayout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  onSelectStartTimeId: (id: string) => void;
  onToggleCharacter: (name: string, checked: boolean) => void;
  onEventsChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onEventGraphLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onRefreshQualityGate: () => void;
  onRunPhase2: () => void;
  working: boolean;
};

export function CheckpointsPanel(props: CheckpointsPanelProps) {
  if (!props.phase1) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Checkpoints</h3>
        <p className="mt-2 text-xs text-gray-500">Run Phase 1 first to unlock checkpoint selection.</p>
      </section>
    );
  }

  const primaryMissingEvidence = props.events.primary.filter((item) => item.evidenceRefs.length === 0).length;
  const canRunSynthesize = !props.working
    && Boolean(props.selectedStartTimeId)
    && props.selectedCharacters.length > 0
    && props.events.primary.length > 0
    && primaryMissingEvidence === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Checkpoints</h3>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
            onClick={props.onRefreshQualityGate}
            disabled={props.working}
          >
            Refresh Quality Gate
          </button>
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-gray-700">Checkpoint 1: Start Time</label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.selectedStartTimeId}
            onChange={(event) => props.onSelectStartTimeId(event.target.value)}
          >
            {props.phase1.startTimeOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-gray-700">Checkpoint 2: Character Selection</label>
          <div className="mt-1 max-h-56 overflow-auto rounded-md border border-gray-200 p-2">
            {props.phase1.characterCandidates.map((item) => {
              const checked = props.selectedCharacters.includes(item.name);
              return (
                <label key={item.name} className="mb-1 flex items-center gap-2 text-xs text-gray-800">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => props.onToggleCharacter(item.name, event.target.checked)}
                  />
                  <span>{item.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <EventGraphEditor
        title="Checkpoint 3: Event Graph Editor"
        events={props.events}
        sourceContextText={props.sourceText}
        onChange={props.onEventsChange}
        layout={props.eventGraphLayout}
        onLayoutChange={props.onEventGraphLayoutChange}
      />

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Run Synthesis</h3>
            <p className="mt-1 text-xs text-gray-600">
              Requires a start time, selected characters, and complete primary evidence.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={props.onRunPhase2}
            disabled={!canRunSynthesize}
          >
            Run Synthesis
          </button>
        </div>
        {primaryMissingEvidence > 0 ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
            {primaryMissingEvidence} primary events are still missing evidence refs.
          </p>
        ) : null}
        {props.events.primary.length === 0 ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
            WORLD_STUDIO_EVENT_GRAPH_INVALID: at least one primary event is required.
          </p>
        ) : null}
      </section>
    </div>
  );
}
