import React from 'react';
import type {
  TextplayPersistRecord,
  TextplayPresenceReport,
  TextplayPresenceState,
  TextplayRenderFailure,
  TextplayReplicaDetail,
  TextplayReplicaSnapshot,
  TextplayReplicaSummary,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayStartupPackage,
  TextplayWarning,
} from '../types.js';

export type TextplayShellProps = {
  storyId: string;
  worldId: string;
  agentId: string;
  playerId: string;
  routeLabel: string;
  replicas: TextplayReplicaSummary[];
  selectedReplicaId: string | null;
  selectedReplica: TextplayReplicaDetail | null;
  startupPackage: TextplayStartupPackage | null;
  startupLoading: boolean;
  startupError: string | null;
  replicaSnapshot: TextplayReplicaSnapshot | null;
  presenceState: TextplayPresenceState;
  presenceReports: TextplayPresenceReport[];
  inputText: string;
  inputPlaceholder: string;
  isRunning: boolean;
  canSend: boolean;
  canSelectReplica: boolean;
  runId: string | null;
  records: TextplayPersistRecord[];
  selectedRecordRunId: string | null;
  lastRenderedText: string;
  runEvents: TextplayRunEvent[];
  warnings: TextplayWarning[];
  runSnapshot: TextplayRunSnapshot | null;
  gapRefillApplied: boolean;
  failure: TextplayRenderFailure | null;
  setPlayerId: (value: string) => void;
  setInputText: (value: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onSend: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  onInitiativeReceived: () => void;
  onSelectReplica: (replicaId: string) => void;
  onSelectRecord: (runId: string) => void;
  onLoadRecoveryDelta: () => void;
};

function formatRunEvent(event: TextplayRunEvent): string {
  const parts = [
    `#${event.seq}`,
    event.eventType,
    event.step,
  ];
  if (event.reasonCode) {
    parts.push(event.reasonCode);
  }
  return parts.join(' · ');
}

function formatRecordTitle(record: TextplayPersistRecord): string {
  const message = String(record.userMessage || '').trim();
  if (message.length === 0) {
    return `${record.turnId} (${record.runId})`;
  }
  if (message.length <= 40) {
    return message;
  }
  return `${message.slice(0, 40)}...`;
}

function renderReplicaSummary(replica: TextplayReplicaDetail | null) {
  if (!replica) {
    return <div className="text-xs text-gray-500">Select a playable story to load context.</div>;
  }

  return (
    <div className="space-y-1 text-xs text-gray-600">
      <div className="font-medium text-gray-800">{replica.title}</div>
      <div className="text-[11px] text-gray-500">storyId: {replica.storyId}</div>
      <div>{replica.summary}</div>
      <div className="text-[11px] text-gray-500">primaryAgent: {replica.primaryAgentId || '(missing)'}</div>
      <div className="text-[11px] text-gray-500">participants: {replica.participants.length}</div>
    </div>
  );
}

export function TextplayShell(props: TextplayShellProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside className="w-full border-b border-gray-200 bg-slate-50 p-3 lg:w-80 lg:border-b-0 lg:border-r">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Context</div>

        <label className="mt-3 block text-xs text-gray-600">
          Playable Replica
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={props.selectedReplicaId || ''}
            onChange={(event) => props.onSelectReplica(event.target.value)}
            disabled={!props.canSelectReplica || props.replicas.length === 0}
          >
            <option value="" disabled>
              {props.replicas.length > 0 ? 'Select a playable story' : 'No playable story'}
            </option>
            {props.replicas.map((replica) => (
              <option key={replica.replicaId} value={replica.replicaId}>
                {replica.title}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-xs">
          {props.replicas.length === 0 ? (
            <div className="text-gray-500">No PRIMARY world events available for play.</div>
          ) : (
            <div className="space-y-1">
              {props.replicas.map((replica) => {
                const active = replica.replicaId === props.selectedReplicaId;
                return (
                  <button
                    key={replica.replicaId}
                    type="button"
                    disabled={!props.canSelectReplica}
                    className={`w-full rounded border px-2 py-1 text-left text-[11px] ${active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                    onClick={() => props.onSelectReplica(replica.replicaId)}
                  >
                    <div className="font-medium text-gray-800">{replica.title}</div>
                    <div className="text-gray-500">{replica.storyId}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
          {renderReplicaSummary(props.selectedReplica)}
        </div>

        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Startup Package</div>
          {props.startupLoading ? <div className="mt-1 text-gray-500">Loading startup package...</div> : null}
          {!props.startupLoading && props.startupError ? <div className="mt-1 text-rose-600">{props.startupError}</div> : null}
          {!props.startupLoading && !props.startupError && props.startupPackage ? (
            <div className="mt-1 space-y-1">
              <div>phase: {props.startupPackage.phase}</div>
              <div>objective: {props.startupPackage.objective}</div>
              <div>lorebooks: {props.startupPackage.availableMaterials.lorebooks.length}</div>
              <div>memories: {props.startupPackage.availableMaterials.memories.length}</div>
            </div>
          ) : null}
        </div>

        <label className="mt-2 block text-xs text-gray-600">
          Player ID
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={props.playerId}
            onChange={(event) => props.setPlayerId(event.target.value)}
            placeholder="player-..."
          />
        </label>

        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Route</div>
          <div className="mt-1 break-all">{props.routeLabel}</div>
        </div>

        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Runtime Binding</div>
          <div className="mt-1 break-all">storyId: {props.storyId || '(missing)'}</div>
          <div className="mt-1 break-all">worldId: {props.worldId || '(missing)'}</div>
          <div className="mt-1 break-all">agentId: {props.agentId || '(missing)'}</div>
        </div>

        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <div className="font-medium text-gray-800">Presence</div>
          <div className="mt-1">{props.presenceState}</div>
          <div className="mt-2 max-h-24 overflow-auto border-t border-gray-100 pt-2">
            {props.presenceReports.slice(-5).map((report) => (
              <div key={report.id} className="mb-1 text-[11px] text-gray-500">
                {report.event}: {report.fromState} {'->'} {report.toState}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs hover:bg-gray-50"
            onClick={props.onRefresh}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs hover:bg-gray-50"
            onClick={props.onInitiativeReceived}
          >
            Initiative
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-gray-200 lg:border-b-0 lg:border-r">
        <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
          Runs ({props.records.length})
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {props.records.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No runs yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {props.records.map((record) => {
                const active = record.runId === props.selectedRecordRunId;
                return (
                  <button
                    key={record.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => props.onSelectRecord(record.runId)}
                  >
                    <div className="text-sm font-medium text-gray-900">{formatRecordTitle(record)}</div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      turn={record.turnId} · run={record.runId}
                    </div>
                    <div className="mt-1 text-xs text-gray-700">{record.text.slice(0, 120)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white p-3">
          <textarea
            className="h-24 w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            placeholder={props.inputPlaceholder}
            value={props.inputText}
            onFocus={props.onInputFocus}
            onBlur={props.onInputBlur}
            onChange={(event) => props.setInputText(event.target.value)}
            disabled={props.isRunning}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {props.runId ? `Current run: ${props.runId}` : 'No active run'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={props.onCancel}
                disabled={!props.isRunning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={props.onSend}
                disabled={!props.canSend}
              >
                {props.isRunning ? 'Rendering...' : 'Send'}
              </button>
            </div>
          </div>

          {!props.selectedReplicaId ? (
            <div className="mt-2 text-xs text-amber-700">Select a playable story before sending.</div>
          ) : null}
          {props.selectedReplicaId && !props.startupPackage && !props.startupLoading ? (
            <div className="mt-2 text-xs text-amber-700">Startup package is required before sending.</div>
          ) : null}

          {props.lastRenderedText ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {props.lastRenderedText}
            </div>
          ) : null}

          {props.failure ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {props.failure.reasonCode}: {props.failure.actionHint}
            </div>
          ) : null}
        </div>
      </main>

      <aside className="w-full bg-slate-50 p-3 lg:w-80">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Replica Snapshot</div>
        <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          {props.replicaSnapshot ? (
            <div className="space-y-1">
              <div>replicaId: {props.replicaSnapshot.replicaId}</div>
              <div>storyId: {props.replicaSnapshot.storyId}</div>
              <div>primaryAgentId: {props.replicaSnapshot.primaryAgentId || '(missing)'}</div>
              <div>version: {props.replicaSnapshot.version}</div>
              <div>source: {props.replicaSnapshot.source}</div>
              <div>loadedAt: {props.replicaSnapshot.loadedAt}</div>
            </div>
          ) : (
            <div>none</div>
          )}
        </div>

        <div className="mb-2 mt-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run Diagnostics</div>
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
            onClick={props.onLoadRecoveryDelta}
            disabled={!props.selectedRecordRunId}
          >
            Load Delta
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <div>gapRefillApplied: {String(props.gapRefillApplied)}</div>
          {props.runSnapshot ? (
            <div className="mt-1">
              status={props.runSnapshot.status} · lastSeq={props.runSnapshot.lastSeq}
            </div>
          ) : null}
        </div>

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <div className="text-xs font-medium text-amber-900">Warnings ({props.warnings.length})</div>
          <div className="mt-1 max-h-24 overflow-auto text-[11px] text-amber-800">
            {props.warnings.length === 0 ? 'none' : props.warnings.map((warning, index) => (
              <div key={`${warning.code}-${index}`}>{warning.code} · {warning.actionHint}</div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-2">
          <div className="text-xs font-medium text-gray-800">Events ({props.runEvents.length})</div>
          <div className="mt-1 max-h-[40vh] overflow-auto text-[11px] text-gray-600">
            {props.runEvents.length === 0 ? 'none' : props.runEvents.map((event) => (
              <div key={`${event.runId}-${event.seq}`} className="mb-1 rounded border border-gray-100 bg-gray-50 px-2 py-1">
                {formatRunEvent(event)}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
