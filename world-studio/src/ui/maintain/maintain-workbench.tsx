import React from 'react';
import type { EventNodeDraft, WorldLorebookDraftRow } from '../../contracts.js';
import { WorldBasePanel } from './world-base-panel.js';
import { WorldviewPanel } from './worldview-panel.js';
import { EventsPanel } from './events-panel.js';
import { LorebooksPanel } from './lorebooks-panel.js';
import { MutationsPanel } from './mutations-panel.js';
import type { WorldMutationSummary } from '../types.js';

type MaintainTab = 'WORLD' | 'WORLDVIEW' | 'EVENTS' | 'LOREBOOKS' | 'MUTATIONS';

type MaintainWorkbenchProps = {
  activeTab: MaintainTab;
  onTabChange: (tab: MaintainTab) => void;
  worldPatch: Record<string, unknown>;
  worldviewPatch: Record<string, unknown>;
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  eventsSyncMode: 'merge' | 'replace';
  editorSnapshotVersion?: string;
  eventGraphLayout: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  lorebooksDraft: WorldLorebookDraftRow[];
  mutations: WorldMutationSummary[];
  working: boolean;
  onWorldPatchChange: (value: Record<string, unknown>) => void;
  onWorldviewPatchChange: (value: Record<string, unknown>) => void;
  onEventsChange: (value: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onEventGraphLayoutChange: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onEventsSyncModeChange: (mode: 'merge' | 'replace') => void;
  onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
  onSyncEvents: () => void;
  onDeleteFirstEvent: () => void;
  onSyncLorebooks: () => void;
  onDeleteFirstLorebook: () => void;
};

const TABS: MaintainTab[] = ['WORLD', 'WORLDVIEW', 'EVENTS', 'LOREBOOKS', 'MUTATIONS'];

export function MaintainWorkbench(props: MaintainWorkbenchProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => props.onTabChange(item)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                props.activeTab === item
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-500'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {props.activeTab === 'WORLD' ? (
          <WorldBasePanel
            worldPatch={props.worldPatch}
            onWorldPatchChange={props.onWorldPatchChange}
          />
        ) : null}
        {props.activeTab === 'WORLDVIEW' ? (
          <WorldviewPanel
            worldviewPatch={props.worldviewPatch}
            onWorldviewPatchChange={props.onWorldviewPatchChange}
          />
        ) : null}
        {props.activeTab === 'LOREBOOKS' ? (
          <LorebooksPanel
            lorebooksDraft={props.lorebooksDraft}
            onLorebooksChange={props.onLorebooksChange}
            onSyncLorebooks={props.onSyncLorebooks}
            onDeleteFirstLorebook={props.onDeleteFirstLorebook}
            working={props.working}
          />
        ) : null}
        {props.activeTab === 'EVENTS' ? (
          <EventsPanel
            events={props.events}
            syncMode={props.eventsSyncMode}
            editorSnapshotVersion={props.editorSnapshotVersion}
            eventGraphLayout={props.eventGraphLayout}
            onEventsChange={props.onEventsChange}
            onEventGraphLayoutChange={props.onEventGraphLayoutChange}
            onSyncModeChange={props.onEventsSyncModeChange}
            onSyncEvents={props.onSyncEvents}
            onDeleteFirstEvent={props.onDeleteFirstEvent}
            working={props.working}
          />
        ) : null}
        {props.activeTab === 'MUTATIONS' ? (
          <MutationsPanel mutations={props.mutations} />
        ) : null}
      </div>
    </div>
  );
}
