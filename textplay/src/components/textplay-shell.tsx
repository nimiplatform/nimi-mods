import React from 'react';
import type { RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type {
  TextplayPersistRecord,
  TextplayPresenceReport,
  TextplayPresenceState,
  TextplayRenderFailure,
  TextplayStoryDetail,
  TextplayStorySnapshot,
  TextplayStorySummary,
  TextplayWorldSummary,
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
  playerName: string;
  routeLabel: string;
  worlds: TextplayWorldSummary[];
  selectedWorldId: string | null;
  worldsLoading: boolean;
  worldsError: string | null;
  stories: TextplayStorySummary[];
  selectedStoryId: string | null;
  selectedStory: TextplayStoryDetail | null;
  startupPackage: TextplayStartupPackage | null;
  startupLoading: boolean;
  startupError: string | null;
  storySnapshot: TextplayStorySnapshot | null;
  presenceState: TextplayPresenceState;
  presenceReports: TextplayPresenceReport[];
  inputText: string;
  inputPlaceholder: string;
  storyStarted: boolean;
  isRunning: boolean;
  canStartStory: boolean;
  canSend: boolean;
  canSelectStory: boolean;
  routeSource: RuntimeRouteSource;
  routeConnectorId: string;
  routeModel: string;
  routeConnectors: Array<{
    id: string;
    label: string;
    models: string[];
  }>;
  routeModelOptions: string[];
  routeOverrideActive: boolean;
  runId: string | null;
  records: TextplayPersistRecord[];
  selectedRecordRunId: string | null;
  lastRenderedText: string;
  runEvents: TextplayRunEvent[];
  warnings: TextplayWarning[];
  runSnapshot: TextplayRunSnapshot | null;
  gapRefillApplied: boolean;
  failure: TextplayRenderFailure | null;
  setPlayerName: (value: string) => void;
  setInputText: (value: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onStartStory: () => void;
  onSend: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  onInitiativeReceived: () => void;
  onSelectWorld: (worldId: string) => void;
  onSelectStory: (storyId: string) => void;
  onSelectRecord: (runId: string) => void;
  onLoadRecoveryDelta: () => void;
  onRouteSourceChange: (source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onClearRouteOverride: () => void;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstNonEmptyText(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function isStoryStartRecord(record: TextplayPersistRecord): boolean {
  if (record.triggerSource !== 'SystemEvent') {
    return false;
  }
  const openingPayload = asRecord(asRecord(record.systemPayload)?.opening);
  return String(openingPayload?.mode || '').trim() === 'story-start';
}

function resolveOpeningNarration(props: TextplayShellProps): string {
  const openingRecord = props.records.find(isStoryStartRecord);
  const openingText = String(openingRecord?.text || '').trim();
  if (openingText) {
    return openingText;
  }
  if (props.records.length <= 1) {
    return String(props.lastRenderedText || '').trim();
  }
  return '';
}

function renderOpeningCard(props: TextplayShellProps): React.ReactNode {
  const startup = props.startupPackage;
  const story = props.selectedStory;
  const openingNarration = resolveOpeningNarration(props);

  if (!props.selectedStoryId) {
    return null;
  }

  if (props.startupLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Loading opening brief...
      </div>
    );
  }

  if (props.startupError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        {props.startupError}
      </div>
    );
  }

  if (!startup || !story) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Startup package is required before showing opening brief.
      </div>
    );
  }

  const storyScope = asRecord(startup.narrativeScopes.STORY) || {};
  const subjectScope = asRecord(startup.narrativeScopes.SUBJECT) || {};
  const relationScope = asRecord(startup.narrativeScopes.RELATION) || {};

  const phase = firstNonEmptyText([storyScope.phase]) || 'opening';
  const objective = firstNonEmptyText([storyScope.objective]) || 'advance-story';
  const playerRole = firstNonEmptyText([
    relationScope.playerRole,
    relationScope.playerIdentity,
    relationScope.relationType,
    relationScope.role,
    subjectScope.playerRole,
    subjectScope.identity,
    subjectScope.role,
  ]) || '未声明';
  const selectedScene = startup.materials.scenes.find((scene) => scene.id === startup.entry.recommendedSceneId)
    || startup.materials.scenes[0]
    || null;
  const sceneLabel = firstNonEmptyText([
    selectedScene?.name,
    selectedScene?.id,
    startup.entry.locationRefs[0],
  ]) || '未知';
  const playerBackground = firstNonEmptyText([
    relationScope.playerBackground,
    relationScope.background,
    relationScope.summary,
    subjectScope.playerBackground,
    subjectScope.background,
    subjectScope.summary,
    story.summary,
  ]);
  const currentSituation = [
    startup.entry.summary,
    startup.entry.cause ? `缘起：${startup.entry.cause}` : '',
    startup.entry.process ? `局势：${startup.entry.process}` : '',
    startup.entry.timeRef ? `时间：${startup.entry.timeRef}` : '',
    `地点：${sceneLabel}`,
  ].filter((line) => line.trim().length > 0).join('；');
  const backgroundLines = [
    startup.background.summary || story.summary || '暂无背景信息。',
    `玩家身份：${props.playerName || '你'}（${playerRole}）`,
    playerBackground ? `玩家背景：${playerBackground}` : '',
    currentSituation ? `当前处境：${currentSituation}` : '',
  ].filter((line) => line.trim().length > 0);

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-900">Opening Brief</div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-full bg-white px-2 py-0.5 text-emerald-700">phase: {phase}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-emerald-700">objective: {objective}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-900 md:grid-cols-2">
        <div className="rounded bg-white px-2 py-1">玩家称呼: {props.playerName || '(未设置)'}</div>
        <div className="rounded bg-white px-2 py-1">主视角角色: {startup.cast.primaryAgentId || '(missing)'}</div>
        <div className="rounded bg-white px-2 py-1">玩家角色: {playerRole}</div>
        <div className="rounded bg-white px-2 py-1">当前地点: {sceneLabel}</div>
        <div className="rounded bg-white px-2 py-1">玩家实体ID: {props.playerId || '(missing)'}</div>
      </div>

      <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Background</div>
        <div className="mt-1 space-y-1 text-sm leading-6 text-emerald-900">
          {backgroundLines.map((line, index) => (
            <div key={`background-line-${index}`}>{line}</div>
          ))}
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Opening Narration</div>
        <div className="mt-1 whitespace-pre-line text-sm leading-6 text-emerald-900">
          {openingNarration || 'Click Start to generate opening narration.'}
        </div>
      </div>
    </section>
  );
}

function renderStorySummary(story: TextplayStoryDetail | null) {
  if (!story) {
    return <div className="text-xs text-gray-500">Select a playable story to load context.</div>;
  }

  return (
    <div className="space-y-2 text-xs text-gray-600">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-5 text-gray-900">{story.title}</div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {story.eventHorizon}
        </span>
      </div>
      <div className="leading-5 text-gray-600">{story.summary}</div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
          agent: {story.primaryAgentId || '(missing)'}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
          participants: {story.participants.length}
        </span>
      </div>
      <div className="break-all text-[10px] text-gray-400">storyId: {story.storyId}</div>
    </div>
  );
}

export function TextplayShell(props: TextplayShellProps) {
  const routeModelListId = 'textplay-route-model-list';
  const activeConnector = props.routeConnectors.find((item) => item.id === props.routeConnectorId) || null;
  const openingNarration = resolveOpeningNarration(props);
  const currentReplyText = String(props.lastRenderedText || '').trim();
  const showCurrentReplyCard = currentReplyText.length > 0 && currentReplyText !== openingNarration;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside className="w-full overflow-y-auto border-b border-gray-200 bg-slate-50 p-3 lg:w-80 lg:border-b-0 lg:border-r">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">World</div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              stories {props.stories.length}
            </span>
          </div>

          <label className="mt-3 block text-xs text-gray-600">
            World
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              value={props.selectedWorldId || ''}
              onChange={(event) => props.onSelectWorld(event.target.value)}
              disabled={props.isRunning || props.worldsLoading || props.worlds.length === 0}
            >
              <option value="" disabled>
                {props.worlds.length > 0 ? 'Select world' : (props.worldsLoading ? 'Loading worlds...' : 'No world')}
              </option>
              {props.worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
          </label>

          {props.worldsError ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
              {props.worldsError}
            </div>
          ) : null}

          <label className="mt-3 block text-xs text-gray-600">
            Story
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              value={props.selectedStoryId || ''}
              onChange={(event) => props.onSelectStory(event.target.value)}
              disabled={!props.canSelectStory || props.stories.length === 0 || !props.selectedWorldId}
            >
              <option value="" disabled>
                {props.stories.length > 0 ? 'Select a playable story' : 'No playable story'}
              </option>
              {props.stories.map((story) => (
                <option key={story.storyId} value={story.storyId}>
                  {story.title}
                </option>
              ))}
            </select>
          </label>

          {props.stories.length === 0 ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              No PRIMARY world events available for play.
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            {renderStorySummary(props.selectedStory)}
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-gray-600">
            <div className="font-medium text-gray-800">Story Startup</div>
            {props.startupLoading ? <div className="mt-1 text-gray-500">Loading startup package...</div> : null}
            {!props.startupLoading && props.startupError ? (
              <div className="mt-1 rounded bg-rose-50 px-1.5 py-1 text-rose-700">{props.startupError}</div>
            ) : null}
            {!props.startupLoading && !props.startupError && props.startupPackage ? (
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-600">
                <div>phase: {String(props.startupPackage.narrativeScopes.STORY.phase || 'opening')}</div>
                <div>objective: {String(props.startupPackage.narrativeScopes.STORY.objective || 'advance-story')}</div>
                <div>lorebooks: {props.startupPackage.materials.lorebooks.length}</div>
                <div>memories: {props.startupPackage.materials.memories.length}</div>
                <div>scenes: {props.startupPackage.materials.scenes.length}</div>
                <div>contexts: {props.startupPackage.materials.contexts.length}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Session</div>
          <div className="block text-xs text-gray-600">
            Player ID
            <div className="mt-1.5 break-all rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm text-slate-700">
              {props.playerId || '(missing)'}
            </div>
          </div>

          <label className="mt-2 block text-xs text-gray-600">
            Player Name
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              value={props.playerName}
              onChange={(event) => props.setPlayerName(event.target.value)}
              placeholder="输入你的角色名/称呼"
              disabled={props.isRunning}
            />
          </label>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-gray-600">
            <div className="font-medium text-gray-800">Route</div>
            <div className="mt-1 break-all text-[11px]">{props.routeLabel}</div>
          </div>

          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-800">Presence</div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                {props.presenceState}
              </span>
            </div>
            <div className="mt-2 max-h-20 overflow-auto border-t border-slate-200 pt-2">
              {props.presenceReports.slice(-3).map((report) => (
                <div key={report.id} className="mb-1 text-[11px] text-gray-500">
                  {report.fromState} {'->'} {report.toState}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-gray-500">
            <div className="break-all">world: {props.worldId || '(missing)'}</div>
            <div className="mt-1 break-all">agent: {props.agentId || '(missing)'}</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={props.onRefresh}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={props.onInitiativeReceived}
            >
              Initiative
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-gray-200 lg:border-b-0 lg:border-r">
        <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
          Runs ({props.records.length})
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          <div className="space-y-3 p-3">
            {renderOpeningCard(props)}

            {showCurrentReplyCard ? (
              <section className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700">Latest Response</div>
                <div className="mt-1 whitespace-pre-line text-sm leading-6 text-blue-900">
                  {currentReplyText}
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Run History
              </div>
              {props.records.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No runs yet.</div>
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
            </section>
          </div>
        </div>

        <div className="border-t border-gray-200 bg-white p-3">
          <textarea
            className="h-24 w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            placeholder={props.inputPlaceholder}
            value={props.inputText}
            onFocus={props.onInputFocus}
            onBlur={props.onInputBlur}
            onChange={(event) => props.setInputText(event.target.value)}
            disabled={props.isRunning || !props.storyStarted}
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
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={props.onStartStory}
                disabled={!props.canStartStory}
              >
                {props.storyStarted ? 'Started' : props.isRunning ? 'Starting...' : 'Start'}
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

          {!props.selectedStoryId ? (
            <div className="mt-2 text-xs text-amber-700">Select a playable story before sending.</div>
          ) : null}
          {props.selectedStoryId && !props.startupPackage && !props.startupLoading ? (
            <div className="mt-2 text-xs text-amber-700">Startup package is required before sending.</div>
          ) : null}
          {props.selectedStoryId && props.startupPackage && !props.storyStarted ? (
            <div className="mt-2 text-xs text-amber-700">Click Start to generate opening narration before sending.</div>
          ) : null}

          {props.failure ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {props.failure.reasonCode}: {props.failure.actionHint}
            </div>
          ) : null}
        </div>
      </main>

      <aside className="w-full min-h-0 overflow-y-auto bg-slate-50 p-3 lg:w-80">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Route Config</div>
        <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          <label className="block">
            <div className="mb-1 text-gray-500">Source</div>
            <select
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              value={props.routeSource}
              onChange={(event) => props.onRouteSourceChange(event.target.value === 'token-api' ? 'token-api' : 'local-runtime')}
            >
              <option value="local-runtime">local-runtime</option>
              <option value="token-api">token-api</option>
            </select>
          </label>

          {props.routeSource === 'token-api' ? (
            <label className="mt-2 block">
              <div className="mb-1 text-gray-500">Connector</div>
              <select
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                value={props.routeConnectorId}
                onChange={(event) => props.onRouteConnectorChange(event.target.value)}
              >
                {props.routeConnectors.length === 0 ? (
                  <option value="">No connector</option>
                ) : null}
                {props.routeConnectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.label || connector.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="mt-2 block">
            <div className="mb-1 text-gray-500">Model</div>
            <input
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              list={routeModelListId}
              value={props.routeModel}
              onChange={(event) => props.onRouteModelChange(event.target.value)}
              placeholder={props.routeSource === 'token-api' && !activeConnector ? 'Select connector first' : 'model id'}
            />
            <datalist id={routeModelListId}>
              {props.routeModelOptions.map((model) => (
                <option key={`textplay-route-model-${model}`} value={model} />
              ))}
            </datalist>
          </label>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-[11px] text-gray-500">
              override: {props.routeOverrideActive ? 'on' : 'off'}
            </div>
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              onClick={props.onClearRouteOverride}
            >
              Use Runtime Default
            </button>
          </div>
        </div>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Story Snapshot</div>
        <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
          {props.storySnapshot ? (
            <div className="space-y-1">
              <div>storyId: {props.storySnapshot.storyId}</div>
              <div>entryEventId: {props.storySnapshot.entryEventId}</div>
              <div>primaryAgentId: {props.storySnapshot.primaryAgentId || '(missing)'}</div>
              <div>version: {props.storySnapshot.version}</div>
              <div>source: {props.storySnapshot.source}</div>
              <div>loadedAt: {props.storySnapshot.loadedAt}</div>
              {props.startupPackage ? (
                <div>
                  initiative: tick={props.startupPackage.startupPolicy.initiative.tickSeconds}s
                  {' '}cooldown={props.startupPackage.startupPolicy.initiative.cooldownSeconds}s
                  {' '}max={props.startupPackage.startupPolicy.initiative.maxConsecutive}
                </div>
              ) : null}
              <div>
                coverage: canon={String(props.storySnapshot.contextCoverage.canon)}
                {' '}story={String(props.storySnapshot.contextCoverage.story)}
                {' '}subject={String(props.storySnapshot.contextCoverage.subject)}
                {' '}relation={String(props.storySnapshot.contextCoverage.relation)}
                {' '}scene={String(props.storySnapshot.contextCoverage.scene)}
              </div>
              <div>gapWarnings: {props.storySnapshot.gapWarnings.length}</div>
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
            disabled={!props.selectedRecordRunId && !props.runId}
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
