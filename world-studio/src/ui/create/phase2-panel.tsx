import React from 'react';
import type { WorldStudioAgentDraft, WorldStudioAssetDraft } from '../../contracts.js';
import type { Phase2Result } from '../../generation/pipeline.js';

type Phase2PanelProps = {
  phase2: Phase2Result | null;
  assets: WorldStudioAssetDraft;
  selectedCharacters: string[];
  selectedAgentSyncCharacters: string[];
  agentDraftsByCharacter: Record<string, WorldStudioAgentDraft>;
  timeFlowRatio: string;
  currentTimeNode: string;
  futureEventsText: string;
  onTimeFlowRatioChange: (value: string) => void;
  onCurrentTimeNodeChange: (value: string) => void;
  onFutureEventsTextChange: (value: string) => void;
  onGenerateWorldCover: () => void;
  onGenerateCharacterPortrait: (name: string) => void;
  onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
  onAgentDraftChange: (name: string, patch: Partial<WorldStudioAgentDraft>) => void;
  working: boolean;
};

function StatusTag(props: { status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' }) {
  const style = props.status === 'succeeded'
    ? 'ui-sync-status-success border-emerald-200 bg-emerald-50 text-emerald-700'
    : props.status === 'failed'
      ? 'ui-sync-status-danger border-red-200 bg-red-50 text-red-700'
      : props.status === 'running'
        ? 'ui-sync-status-info border-brand-200 bg-brand-50 text-brand-700'
        : 'border-gray-200 bg-gray-50 text-gray-600';
  return <span className={`ui-sync-pill rounded px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>{props.status}</span>;
}

export function Phase2Panel(props: Phase2PanelProps) {
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">Synthesis Result</h3>
      {!props.phase2 ? (
        <p className="mt-2 text-xs text-gray-500">No synthesis output yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 lg:grid-cols-4">
            <div className="ui-sync-metric-card p-2">
              <div className="font-medium text-gray-800">World</div>
              <div className="text-xs text-gray-500">name: {String(props.phase2.world?.name || 'Untitled')}</div>
            </div>
            <div className="ui-sync-metric-card p-2">
              <div className="font-medium text-gray-800">Worldview</div>
              <div className="text-xs text-gray-500">modules: {Object.keys(props.phase2.worldview || {}).length}</div>
            </div>
            <div className="ui-sync-metric-card p-2">
              <div className="font-medium text-gray-800">Lorebooks</div>
              <div className="text-xs text-gray-500">count: {Array.isArray(props.phase2.worldLorebooks) ? props.phase2.worldLorebooks.length : 0}</div>
            </div>
            <div className="ui-sync-metric-card p-2">
              <div className="font-medium text-gray-800">Events</div>
              <div className="text-xs text-gray-500">count: {Array.isArray(props.phase2.worldEvents) ? props.phase2.worldEvents.length : 0}</div>
            </div>
          </div>

          <div className="ui-sync-toolbar p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-xs text-gray-700">
                OASIS Time Flow Ratio
                <input
                  className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                  value={props.timeFlowRatio}
                  onChange={(event) => props.onTimeFlowRatioChange(event.target.value)}
                  placeholder="1"
                />
              </label>
              <label className="text-xs text-gray-700">
                Current Time Node
                <input
                  className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                  value={props.currentTimeNode}
                  onChange={(event) => props.onCurrentTimeNodeChange(event.target.value)}
                  placeholder="timeline:0"
                />
              </label>
            </div>
          </div>

          <div className="ui-sync-code-panel p-3">
            <div className="mb-1 text-xs font-semibold text-gray-800">Future Historical Events</div>
            <textarea
              className="h-28 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
              value={props.futureEventsText}
              onChange={(event) => props.onFutureEventsTextChange(event.target.value)}
            />
          </div>

          <div className="ui-sync-soft-card p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-800">World Cover</div>
              <StatusTag status={props.assets.worldCover.status} />
            </div>
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary mt-2 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
              onClick={props.onGenerateWorldCover}
              disabled={props.working}
            >
              Generate Image
            </button>
            {props.assets.worldCover.imageUrl ? (
              <p className="mt-1 truncate text-[11px] text-gray-500">{props.assets.worldCover.imageUrl}</p>
            ) : null}
          </div>

          <div className="ui-sync-card p-3">
            <div className="text-xs font-semibold text-gray-800">Character Portrait + Agent Sync</div>
            <div className="mt-2 max-h-44 space-y-2 overflow-auto">
              {props.selectedCharacters.length === 0 ? (
                <p className="text-xs text-gray-500">No character selected.</p>
              ) : props.selectedCharacters.map((name) => {
                const portrait = props.assets.characterPortraits[name]
                  || ({ status: 'idle', imageUrl: null } as const);
                const syncChecked = props.selectedAgentSyncCharacters.includes(name);
                const draft = props.agentDraftsByCharacter[name]
                  || ({
                    characterName: name,
                    handle: '',
                    concept: '',
                    backstory: '',
                    coreValues: '',
                    relationshipStyle: '',
                  } as WorldStudioAgentDraft);
                return (
                  <div key={name} className="ui-sync-soft-card p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">{name}</div>
                      <StatusTag status={portrait.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-60"
                        onClick={() => props.onGenerateCharacterPortrait(name)}
                        disabled={props.working}
                      >
                        Generate Portrait
                      </button>
                      <label className="flex items-center gap-1 text-[11px] text-gray-700">
                        <input
                          type="checkbox"
                          checked={syncChecked}
                          onChange={(event) => props.onToggleAgentSyncCharacter(name, event.target.checked)}
                        />
                        Sync as world-specific Agent
                      </label>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <label className="text-[11px] text-gray-700">
                        handle
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]"
                          value={draft.handle}
                          onChange={(event) => props.onAgentDraftChange(name, { handle: event.target.value })}
                          placeholder={`~${name}`}
                        />
                      </label>
                      <label className="text-[11px] text-gray-700">
                        DNA Primary Trait (optional)
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]"
                          value={draft.dnaPrimary || ''}
                          onChange={(event) => props.onAgentDraftChange(name, { dnaPrimary: event.target.value })}
                          placeholder="Calm, decisive, rational..."
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-[11px] text-gray-700">
                      Agent Concept
                      <textarea
                        className="mt-1 h-16 w-full rounded-md border border-gray-300 p-2 text-[11px]"
                        value={draft.concept}
                        onChange={(event) => props.onAgentDraftChange(name, { concept: event.target.value })}
                        placeholder="Role positioning, language style, behavior principles"
                      />
                    </label>
                    {portrait.imageUrl ? (
                      <p className="mt-1 truncate text-[11px] text-gray-500">{portrait.imageUrl}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
