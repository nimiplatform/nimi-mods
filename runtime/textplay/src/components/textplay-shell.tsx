import React, { useEffect, useState } from 'react';
import type { TextplayHistorySession, TextplayPersistRecord, TextplayPresenceReport, TextplayPresenceState, TextplayRenderFailure, TextplayStoryDetail, TextplayStoryBrief, TextplayStorySnapshot, TextplayStorySummary, TextplayWorldSummary, TextplayRunEvent, TextplayRunSnapshot, TextplayStartupPackage, TextplayWarning, } from '../types.js';
import { TextplayVisualStyles } from './textplay-visual-styles.js';
import { type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
import { rightPanelSectionHeader, formatRunEvent, formatRecordTitle, formatTriggerSourceLabel, triggerSourceBadgeClass, formatRouteLabelFromRecord, formatHistorySessionTitle, formatHistorySessionUpdatedAt, findLastStepError, normalizeUserTurnMessage, formatTimelineStageLabel, formatTimelineResponseLabel, responsePanelClass, renderOpeningCard, renderStorySummary, } from './textplay-shell-helpers.js';
export type TextplayShellProps = {
    storyId: string;
    worldId: string;
    agentId: string;
    playerId: string;
    playerName: string;
    playerIdentity: string;
    routeLabel: string;
    worlds: TextplayWorldSummary[];
    selectedWorldId: string | null;
    worldsLoading: boolean;
    worldsError: string | null;
    historySessions: TextplayHistorySession[];
    historyLoading: boolean;
    historyError: string | null;
    selectedHistoryRunId: string | null;
    stories: TextplayStorySummary[];
    selectedStoryId: string | null;
    selectedStory: TextplayStoryDetail | null;
    startupPackage: TextplayStartupPackage | null;
    startupLoading: boolean;
    startupError: string | null;
    storyBrief: TextplayStoryBrief | null;
    storySnapshot: TextplayStorySnapshot | null;
    presenceState: TextplayPresenceState;
    presenceReports: TextplayPresenceReport[];
    inputText: string;
    inputPlaceholder: string;
    storyStarted: boolean;
    sessionPaused: boolean;
    isRunning: boolean;
    canStartStory: boolean;
    canSend: boolean;
    canTogglePause: boolean;
    canContinueHistory: boolean;
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
    bindingActive: boolean;
    runId: string | null;
    records: TextplayPersistRecord[];
    selectedRecordRunId: string | null;
    lastRenderedText: string;
    runEvents: TextplayRunEvent[];
    warnings: TextplayWarning[];
    runSnapshot: TextplayRunSnapshot | null;
    gapRefillApplied: boolean;
    deltaStatus: {
        kind: 'info' | 'warning' | 'success' | 'error';
        message: string;
    } | null;
    failure: TextplayRenderFailure | null;
    pendingUserTurn: {
        message: string;
        runId: string;
        traceId: string;
        status: 'rendering' | 'failed';
        reasonCode?: string;
    } | null;
    setPlayerName: (value: string) => void;
    setPlayerIdentity: (value: string) => void;
    setInputText: (value: string) => void;
    onInputFocus: () => void;
    onInputBlur: () => void;
    onStartStory: () => void;
    onToggleSessionPause: () => void;
    onSend: () => void;
    onCancel: () => void;
    onRefresh: () => void;
    onCopyDiagnostics: () => void;
    onInitiativeReceived: () => void;
    onRequestHistorySessions: () => void;
    onSelectHistorySession: (runId: string) => void;
    onContinueHistorySession: () => void;
    onSelectWorld: (worldId: string) => void;
    onSelectStory: (storyId: string) => void;
    onSelectRecord: (runId: string) => void;
    onLoadRecoveryDelta: () => void;
    onRouteSourceChange: (source: RuntimeRouteSource) => void;
    onRouteConnectorChange: (connectorId: string) => void;
    onRouteModelChange: (model: string) => void;
    onClearRouteBinding: () => void;
};
type TextplayRightPanelSection = 'health' | 'route' | 'debug' | null;
export function TextplayShell(props: TextplayShellProps) {
    const routeModelListId = 'textplay-route-model-list';
    const activeConnector = props.routeConnectors.find((item) => item.id === props.routeConnectorId) || null;
    const timelineRecords = [...props.records].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    const selectedHistorySession = props.historySessions.find((item) => item.runId === props.selectedHistoryRunId)
        || props.historySessions[0]
        || null;
    const transientRecapText = props.storyBrief?.mode === 'recap'
        ? String(props.storyBrief.text || '').trim()
        : '';
    const selectedRecord = props.records.find((record) => record.runId === props.selectedRecordRunId) || null;
    const pendingUserTurn = props.pendingUserTurn && props.pendingUserTurn.message.trim().length > 0
        ? props.pendingUserTurn
        : null;
    const lastErrorEvent = findLastStepError(props.failure?.runEvents || props.runEvents);
    const diagnosticReasonCode = props.failure?.reasonCode || lastErrorEvent?.reasonCode || '';
    const diagnosticTraceId = props.failure?.traceId
        || selectedRecord?.traceId
        || '';
    const diagnosticStep = lastErrorEvent?.step || '';
    const playerNameMissingForStart = Boolean(props.selectedStoryId)
        && !props.storyStarted
        && props.playerName.trim().length === 0;
    const [sessionEntryExpanded, setSessionEntryExpanded] = useState<boolean>(() => !props.storyStarted);
    const [sessionEntryTab, setSessionEntryTab] = useState<'continue' | 'new'>(() => (props.storyStarted ? 'continue' : 'new'));
    const [openRightPanelSection, setOpenRightPanelSection] = useState<TextplayRightPanelSection>('health');
    useEffect(() => {
        if (props.storyStarted) {
            setSessionEntryExpanded(false);
            return;
        }
        setSessionEntryExpanded(true);
    }, [props.storyStarted]);
    useEffect(() => {
        if (!props.storyStarted && props.historySessions.length === 0) {
            setSessionEntryTab('new');
        }
    }, [props.historySessions.length, props.storyStarted]);
    const onToggleSessionEntry = () => {
        const next = !sessionEntryExpanded;
        setSessionEntryExpanded(next);
        if (next) {
            setSessionEntryTab('continue');
            props.onRequestHistorySessions();
        }
    };
    const onSelectSessionTab = (tab: 'continue' | 'new') => {
        setSessionEntryTab(tab);
        if (tab === 'continue') {
            props.onRequestHistorySessions();
        }
    };
    const onContinueSelectedSession = () => {
        props.onContinueHistorySession();
        setSessionEntryExpanded(false);
    };
    return (<div className="ui-sync-root textplay-shell-root flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <TextplayVisualStyles />
      <aside className="ui-sync-pane ui-sync-pane-side textplay-shell-side w-full overflow-y-auto border-b border-gray-200 bg-slate-50 p-3 md:w-64 md:border-b-0 md:border-r xl:w-80">
        <div className="ui-sync-card rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Session</div>
          {props.storyStarted ? (<div className="mt-3 space-y-1 text-xs text-slate-700">
              <div>
                World: {props.worlds.find((world) => world.id === props.worldId)?.name || props.worldId || '(unknown)'}
              </div>
              <div>Story: {props.selectedStory?.title || props.storyId || '(unknown)'}</div>
              <div>Player: {props.playerName || '(missing)'} · {props.playerIdentity || 'default'}</div>
              <div>Status: {props.sessionPaused ? 'Paused' : 'Active'}</div>
              <div>Run: {props.selectedRecordRunId || props.runId || '(none)'}</div>
              <div>
                Updated: {selectedRecord?.updatedAt ? formatHistorySessionUpdatedAt(selectedRecord.updatedAt) : '-'}
              </div>
            </div>) : (<div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
              No active session.
            </div>)}
          {props.storyStarted ? (<div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onStartStory} disabled={!props.canStartStory}>
                {props.isRunning ? 'Recapping...' : 'Recap'}
              </button>
              <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onToggleSessionPause} disabled={!props.canTogglePause}>
                {props.sessionPaused ? 'Resume' : 'Pause'}
              </button>
            </div>) : null}
        </div>

        <button type="button" className="ui-sync-btn ui-sync-btn-secondary mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={onToggleSessionEntry}>
          {sessionEntryExpanded ? 'Hide Session Entry' : 'Change Session'}
        </button>

        {sessionEntryExpanded ? (<div className="ui-sync-card ui-sync-card-inset mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Session Entry</div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className={`ui-sync-btn rounded-lg border px-2 py-1.5 text-xs font-medium ${sessionEntryTab === 'continue'
                ? 'ui-sync-btn-selected border-blue-300 bg-blue-50 text-blue-700'
                : 'ui-sync-btn-secondary border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => onSelectSessionTab('continue')}>
                Continue
              </button>
              <button type="button" className={`ui-sync-btn rounded-lg border px-2 py-1.5 text-xs font-medium ${sessionEntryTab === 'new'
                ? 'ui-sync-btn-selected border-blue-300 bg-blue-50 text-blue-700'
                : 'ui-sync-btn-secondary border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => onSelectSessionTab('new')}>
                New
              </button>
            </div>

            {sessionEntryTab === 'continue' ? (<>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-600">History Session</div>
                  <span className="ui-sync-pill rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    history {props.historySessions.length}
                  </span>
                </div>
                <select className="mt-1.5 w-full max-w-full truncate rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" value={props.selectedHistoryRunId || ''} onChange={(event) => props.onSelectHistorySession(event.target.value)} disabled={props.isRunning || props.historyLoading || props.historySessions.length === 0}>
                  <option value="" disabled>
                    {props.historyLoading
                    ? 'Loading history sessions...'
                    : (props.historySessions.length > 0 ? 'Select session' : 'No historical session')}
                  </option>
                  {props.historySessions.map((session) => (<option key={session.runId} value={session.runId}>
                      {formatHistorySessionTitle(session)}
                    </option>))}
                </select>

                {props.historyError ? (<div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                    {props.historyError}
                  </div>) : null}

                {selectedHistorySession ? (<div className="ui-sync-soft-card mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="break-all text-xs font-medium leading-5 text-slate-800">
                      {selectedHistorySession.storyTitle}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      updated: {formatHistorySessionUpdatedAt(selectedHistorySession.updatedAt)}
                    </div>
                    <div className="mt-2 break-words text-xs leading-5 text-slate-700">
                      {selectedHistorySession.preview}
                    </div>
                    <div className="mt-2 break-all text-[10px] text-slate-500">
                      world: {selectedHistorySession.worldId} · story: {selectedHistorySession.storyId}
                    </div>
                  </div>) : (<div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                    No historical session for current player.
                  </div>)}

                  <button type="button" className="ui-sync-btn ui-sync-btn-primary mt-3 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={onContinueSelectedSession} disabled={!props.canContinueHistory}>
                  {props.historyLoading ? 'Loading...' : 'Continue Selected Session'}
                </button>
              </>) : (<>
                <label className="mt-3 block text-xs text-gray-600">
                  World
                  <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" value={props.selectedWorldId || ''} onChange={(event) => props.onSelectWorld(event.target.value)} disabled={props.isRunning || props.worldsLoading || props.worlds.length === 0}>
                    <option value="" disabled>
                      {props.worlds.length > 0 ? 'Select world' : (props.worldsLoading ? 'Loading worlds...' : 'No world')}
                    </option>
                    {props.worlds.map((world) => (<option key={world.id} value={world.id}>
                        {world.name}
                      </option>))}
                  </select>
                </label>

                {props.worldsError ? (<div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                    {props.worldsError}
                  </div>) : null}

                <label className="mt-3 block text-xs text-gray-600">
                  Story
                  <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" value={props.selectedStoryId || ''} onChange={(event) => props.onSelectStory(event.target.value)} disabled={!props.canSelectStory || props.stories.length === 0 || !props.selectedWorldId}>
                    <option value="" disabled>
                      {props.stories.length > 0 ? 'Select a playable story' : 'No playable story'}
                    </option>
                    {props.stories.map((story) => (<option key={story.storyId} value={story.storyId}>
                        {story.title}
                      </option>))}
                  </select>
                </label>

                {props.stories.length === 0 ? (<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                    No PRIMARY world events available for play.
                  </div>) : null}

                <div className="ui-sync-soft-card mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  {renderStorySummary(props.selectedStory)}
                </div>

                <div className="mt-3 text-xs text-gray-600">
                  Player ID
                  <div className="mt-1.5 break-all font-mono text-[11px] leading-5 text-slate-600">
                    {props.playerId || '(missing)'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Auto-generated and read-only.</div>
                </div>

                <label className="mt-2 block text-xs text-gray-600">
                  Player Name
                  <input className={`mt-1.5 w-full rounded-lg border bg-white px-2.5 py-2 text-sm ${playerNameMissingForStart ? 'border-rose-300' : 'border-slate-300'}`} value={props.playerName} onChange={(event) => props.setPlayerName(event.target.value)} placeholder="输入你的角色名/称呼" disabled={props.isRunning} required aria-invalid={playerNameMissingForStart}/>
                  {playerNameMissingForStart ? (<div className="mt-1 text-[11px] text-rose-600">Player Name is required before Start.</div>) : null}
                </label>

                <label className="mt-2 block text-xs text-gray-600">
                  Player Identity
                  <input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" value={props.playerIdentity} onChange={(event) => props.setPlayerIdentity(event.target.value)} placeholder="例如：天南散修 / 玄门弟子 / 游历剑修" disabled={props.isRunning}/>
                  <div className="mt-1 text-[11px] text-gray-500">用于叙事身份绑定；留空将使用剧情上下文默认身份。</div>
                </label>

                {!props.storyStarted ? (<button type="button" className="ui-sync-btn ui-sync-btn-primary mt-3 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onStartStory} disabled={!props.canStartStory}>
                    {props.isRunning ? 'Starting...' : 'Start'}
                  </button>) : null}

                <button type="button" className="ui-sync-btn ui-sync-btn-secondary mt-3 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={props.onRefresh}>
                  Refresh
                </button>
              </>)}
          </div>) : null}
      </aside>

      <main className="ui-sync-pane ui-sync-pane-main textplay-shell-main flex min-h-0 min-w-0 flex-1 flex-col border-b border-gray-200 md:border-b-0 md:border-r">
        <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
          Narrative Timeline ({timelineRecords.length})
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          <div className="space-y-3 p-3">
            {transientRecapText ? (<section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                  Story Recap (Current)
                </div>
                <div className="mt-1 whitespace-pre-line text-sm leading-6 text-amber-900">
                  {transientRecapText}
                </div>
              </section>) : null}

            {pendingUserTurn ? (<section className={`rounded-xl border p-3 ${pendingUserTurn.status === 'failed'
                ? 'border-rose-200 bg-rose-50'
                : 'border-blue-200 bg-blue-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className={`text-[11px] font-medium uppercase tracking-wide ${pendingUserTurn.status === 'failed' ? 'text-rose-700' : 'text-blue-700'}`}>
                    Pending Player Action
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pendingUserTurn.status === 'failed'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-blue-100 text-blue-700'}`}>
                    {pendingUserTurn.status === 'failed' ? 'render failed' : 'rendering'}
                  </span>
                </div>
                <div className={`mt-1 whitespace-pre-line text-sm leading-6 ${pendingUserTurn.status === 'failed' ? 'text-rose-900' : 'text-blue-900'}`}>
                  {pendingUserTurn.message}
                </div>
                <div className={`mt-2 text-[11px] ${pendingUserTurn.status === 'failed' ? 'text-rose-700' : 'text-blue-700'}`}>
                  run={pendingUserTurn.runId} · traceId={pendingUserTurn.traceId}
                </div>
                {pendingUserTurn.reasonCode ? (<div className="mt-1 text-[11px] text-rose-700">
                    reasonCode: {pendingUserTurn.reasonCode}
                  </div>) : null}
              </section>) : null}

            {timelineRecords.length === 0 ? (<section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
                {!props.selectedStoryId
                ? 'Select a playable story to load timeline.'
                : (props.storyStarted
                    ? 'No persisted timeline records yet.'
                    : 'Click Start in Session Entry to generate opening narration and begin timeline.')}
              </section>) : (<section className="space-y-2">
                {timelineRecords.map((record) => {
                const active = record.runId === props.selectedRecordRunId;
                const routeLabel = formatRouteLabelFromRecord(record);
                const userTurnMessage = record.triggerSource === 'UserTurn'
                    ? normalizeUserTurnMessage(String(record.userMessage || ''))
                    : '';
                const responseText = String(record.text || '').trim();
                const responseTextClass = record.triggerSource === 'AgentInitiative'
                    ? 'text-violet-900'
                    : record.triggerSource === 'SystemEvent'
                        ? 'text-emerald-900'
                        : 'text-slate-900';
                const responseLabelClass = record.triggerSource === 'AgentInitiative'
                    ? 'text-violet-700'
                    : record.triggerSource === 'SystemEvent'
                        ? 'text-emerald-700'
                        : 'text-slate-600';
                return (<button key={record.id} type="button" className={`w-full rounded-xl border px-3 py-2 text-left ${active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'}`} onClick={() => props.onSelectRecord(record.runId)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-700">
                          {formatTimelineStageLabel(record)}
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${triggerSourceBadgeClass(record.triggerSource)}`}>
                          {formatTriggerSourceLabel(record.triggerSource)}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        turn={record.turnId} · run={record.runId}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        status={record.runSnapshot.status} · seq={record.runSnapshot.lastSeq} · route={routeLabel}
                      </div>
                      {userTurnMessage ? (<div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700">
                            {props.playerName || 'Player'} · Action
                          </div>
                          <div className="mt-1 whitespace-pre-line text-sm leading-6 text-blue-900">
                            {userTurnMessage}
                          </div>
                        </div>) : null}
                      <div className={`mt-2 rounded-lg border px-3 py-2 ${responsePanelClass(record)}`}>
                        <div className={`text-[11px] font-medium uppercase tracking-wide ${responseLabelClass}`}>
                          {formatTimelineResponseLabel(record)}
                        </div>
                        <div className={`mt-1 whitespace-pre-line text-sm leading-6 ${responseTextClass}`}>
                          {responseText || '(empty response)'}
                        </div>
                      </div>
                    </button>);
            })}
              </section>)}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-white p-3">
          <div className="ui-sync-input-shell p-2">
            <textarea className="h-24 w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" placeholder={props.inputPlaceholder} value={props.inputText} onFocus={props.onInputFocus} onBlur={props.onInputBlur} onChange={(event) => props.setInputText(event.target.value)} disabled={props.isRunning || !props.storyStarted}/>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {props.runId ? `Current run: ${props.runId}` : 'No active run'}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onCancel} disabled={!props.isRunning}>
                Cancel
              </button>
              <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onSend} disabled={!props.canSend}>
                {props.isRunning ? 'Rendering...' : 'Send'}
              </button>
            </div>
          </div>

          {!props.selectedStoryId ? (<div className="mt-2 text-xs text-amber-700">Select a playable story before sending.</div>) : null}
          {props.selectedStoryId && !props.storyStarted ? (<div className="mt-2 text-xs text-amber-700">
              {props.playerName.trim()
                ? 'Click Start in Session Entry to load background and opening narration before sending.'
                : 'Player Name is required. Fill Player Name first, then click Start in Session Entry.'}
            </div>) : null}
          {props.storyStarted && props.sessionPaused ? (<div className="mt-2 text-xs text-amber-700">
              Session is paused. Click Resume in Current Session to re-enable Send and auto progression.
            </div>) : null}
          {props.selectedStoryId && props.storyStarted && !props.sessionPaused ? (<div className="mt-2 text-xs text-gray-500">
              Click Recap in Current Session to refresh a concise "previously on" summary before your next move.
            </div>) : null}

          {props.failure ? (<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {props.failure.reasonCode}: {props.failure.actionHint}
            </div>) : null}
        </div>
      </main>

      <aside className="ui-sync-pane ui-sync-pane-right textplay-shell-right w-full min-h-0 overflow-y-auto bg-slate-50 p-3 md:w-64 xl:w-80">
        <div className="ui-sync-card min-h-0 rounded-[10px] border border-gray-200 bg-white">
          <section className="px-3 py-3 text-xs">
            {rightPanelSectionHeader({
            title: 'Session Health',
            open: openRightPanelSection === 'health',
            onToggle: () => setOpenRightPanelSection((prev) => (prev === 'health' ? null : 'health')),
        })}
            {openRightPanelSection === 'health' ? (<div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-gray-500">Run status and warning overview.</div>
                  <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={props.onLoadRecoveryDelta} disabled={!props.selectedRecordRunId && !props.runId}>
                    Load Delta
                  </button>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
                  <div>gapRefillApplied: {String(props.gapRefillApplied)}</div>
                  {props.runSnapshot ? (<div className="mt-1">
                      status={props.runSnapshot.status} · lastSeq={props.runSnapshot.lastSeq}
                    </div>) : null}
                  {props.deltaStatus ? (<div className={`mt-2 rounded px-2 py-1 text-[11px] ${props.deltaStatus.kind === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : props.deltaStatus.kind === 'warning'
                        ? 'bg-amber-50 text-amber-700'
                        : props.deltaStatus.kind === 'error'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-700'}`}>
                      delta: {props.deltaStatus.message}
                    </div>) : null}
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="text-xs font-medium text-amber-900">Warnings ({props.warnings.length})</div>
                  <div className="mt-1 max-h-24 overflow-auto text-[11px] text-amber-800">
                    {props.warnings.length === 0 ? 'none' : props.warnings.map((warning, index) => (<div key={`${warning.code}-${index}`}>{warning.code} · {warning.actionHint}</div>))}
                  </div>
                </div>
              </div>) : null}
          </section>

          <section className="border-t border-gray-200 px-3 py-3 text-xs">
            {rightPanelSectionHeader({
            title: 'Route Config',
            open: openRightPanelSection === 'route',
            onToggle: () => setOpenRightPanelSection((prev) => (prev === 'route' ? null : 'route')),
        })}
            {openRightPanelSection === 'route' ? (<div className="mt-3 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
                <label className="block">
                  <div className="mb-1 text-gray-500">Source</div>
                  <select className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs" value={props.routeSource} onChange={(event) => props.onRouteSourceChange(event.target.value === 'cloud' ? 'cloud' : 'local')}>
                    <option value="local">local</option>
                    <option value="cloud">cloud</option>
                  </select>
                </label>

                {props.routeSource === 'cloud' ? (<label className="mt-2 block">
                    <div className="mb-1 text-gray-500">Connector</div>
                    <select className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs" value={props.routeConnectorId} onChange={(event) => props.onRouteConnectorChange(event.target.value)}>
                      {props.routeConnectors.length === 0 ? (<option value="">No connector</option>) : null}
                      {props.routeConnectors.map((connector) => (<option key={connector.id} value={connector.id}>
                          {connector.label || connector.id}
                        </option>))}
                    </select>
                  </label>) : null}

                <label className="mt-2 block">
                  <div className="mb-1 text-gray-500">Model</div>
                  <input className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs" list={routeModelListId} value={props.routeModel} onChange={(event) => props.onRouteModelChange(event.target.value)} placeholder={props.routeSource === 'cloud' && !activeConnector ? 'Select connector first' : 'model id'}/>
                  <datalist id={routeModelListId}>
                    {props.routeModelOptions.map((model) => (<option key={`textplay-route-model-${model}`} value={model}/>))}
                  </datalist>
                </label>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[11px] text-gray-500">
                    override: {props.bindingActive ? 'on' : 'off'}
                  </div>
                  <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50" onClick={props.onClearRouteBinding}>
                    Use Runtime Default
                  </button>
                </div>
              </div>) : null}
          </section>

          <section className="border-t border-gray-200 px-3 py-3 text-xs">
            {rightPanelSectionHeader({
            title: 'Debug Trace',
            open: openRightPanelSection === 'debug',
            onToggle: () => setOpenRightPanelSection((prev) => (prev === 'debug' ? null : 'debug')),
        })}
            {openRightPanelSection === 'debug' ? (<div className="mt-3 space-y-3">
                <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-700">Story Snapshot</div>
                  {props.storySnapshot ? (<div className="mt-2 space-y-1">
                      <div>storyId: {props.storySnapshot.storyId}</div>
                      <div>entryEventId: {props.storySnapshot.entryEventId}</div>
                      <div>primaryAgentId: {props.storySnapshot.primaryAgentId || '(missing)'}</div>
                      <div>version: {props.storySnapshot.version}</div>
                      <div>source: {props.storySnapshot.source}</div>
                      <div>loadedAt: {props.storySnapshot.loadedAt}</div>
                      {props.startupPackage ? (<div>
                          initiative: tick={props.startupPackage.startupPolicy.initiative.tickSeconds}s
                          {' '}cooldown={props.startupPackage.startupPolicy.initiative.cooldownSeconds}s
                          {' '}max={props.startupPackage.startupPolicy.initiative.maxConsecutive}
                        </div>) : null}
                      <div>
                        coverage: canon={String(props.storySnapshot.contextCoverage.canon)}
                        {' '}story={String(props.storySnapshot.contextCoverage.story)}
                        {' '}subject={String(props.storySnapshot.contextCoverage.subject)}
                        {' '}relation={String(props.storySnapshot.contextCoverage.relation)}
                        {' '}scene={String(props.storySnapshot.contextCoverage.scene)}
                      </div>
                      <div>gapWarnings: {props.storySnapshot.gapWarnings.length}</div>
                    </div>) : (<div className="mt-2">none</div>)}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-700">Selected Turn Debug</div>
                  {selectedRecord ? (<div className="mt-2 space-y-1 text-[11px]">
                      <div>selectedRun: {selectedRecord.runId}</div>
                      <div>selectedTurn: {selectedRecord.turnId}</div>
                      <div>trigger: {selectedRecord.triggerSource}</div>
                      <div>route: {formatRouteLabelFromRecord(selectedRecord)}</div>
                      <div>traceId: {selectedRecord.traceId}</div>
                      <div>promptTraceId: {selectedRecord.meta.promptTraceId || '(none)'}</div>
                    </div>) : (<div className="mt-2 text-[11px] text-gray-500">none</div>)}
                  {(diagnosticReasonCode || diagnosticTraceId || diagnosticStep) ? (<div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-[11px] text-rose-700">
                      {diagnosticReasonCode ? <div>reasonCode: {diagnosticReasonCode}</div> : null}
                      {diagnosticTraceId ? <div>traceId: {diagnosticTraceId}</div> : null}
                      {diagnosticStep ? <div>step: {diagnosticStep}</div> : null}
                    </div>) : null}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-2">
                  <div className="text-xs font-medium text-gray-800">Run Steps ({props.runEvents.length})</div>
                  <div className="mt-1 text-[11px] text-gray-500">System pipeline events (not narrative cards).</div>
                  <div className="mt-1 max-h-[40vh] overflow-auto text-[11px] text-gray-600">
                    {props.runEvents.length === 0 ? 'none' : props.runEvents.map((event) => (<div key={`${event.runId}-${event.seq}`} className="mb-1 rounded border border-gray-100 bg-gray-50 px-2 py-1">
                        {formatRunEvent(event)}
                      </div>))}
                  </div>
                </div>
              </div>) : null}
          </section>
        </div>
      </aside>
    </div>);
}
