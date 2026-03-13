import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  filterModelOptions,
  normalizeRuntimeRouteSource,
  useModTranslation,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from "@nimiplatform/sdk/mod";
import type {
  TextplayAgentOption,
  TextplayDraftRecord,
  TextplayEntryDetail,
  TextplayEntrySummary,
  TextplayPendingUserTurn,
  TextplayPersistRecord,
  TextplayWorldSummary,
} from '../types.js';

type BannerNotice = {
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

export type TextplayShellProps = {
  userId: string;
  worlds: TextplayWorldSummary[];
  worldsLoading: boolean;
  worldsError: string | null;
  selectedWorldId: string;
  setSelectedWorldId: (worldId: string) => void;
  entries: TextplayEntrySummary[];
  entriesLoading: boolean;
  entriesError: string | null;
  selectedEntryEventId: string;
  setSelectedEntryEventId: (entryEventId: string) => void;
  selectedEntry: TextplayEntryDetail | null;
  agentOptions: TextplayAgentOption[];
  agentOptionsLoading: boolean;
  selectedAgentId: string;
  setSelectedAgentId: (agentId: string) => void;
  playerName: string;
  setPlayerName: (value: string) => void;
  playerIdentity: string;
  setPlayerIdentity: (value: string) => void;
  drafts: TextplayDraftRecord[];
  draftsLoading: boolean;
  draftsError: string | null;
  selectedDraftKey: string | null;
  setSelectedDraftKey: (key: string | null) => void;
  activeDraft: TextplayDraftRecord | null;
  pendingUserTurn: TextplayPendingUserTurn | null;
  inputText: string;
  setInputText: (value: string) => void;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onResumeActive: () => void;
  onResumeDraft: (draftKey: string) => void;
  onRestartDraft: (draftKey: string) => void;
  onStop: () => void;
  onSend: () => void;
  onCancel: () => void;
  canStart: boolean;
  canSend: boolean;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  routeLoading: boolean;
  routeError: string | null;
  routeBinding: RuntimeRouteBinding | null;
  effectiveRouteBinding: RuntimeRouteBinding | null;
  onRouteSourceChange: (source: 'local' | 'cloud') => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onRouteClear: () => void;
  onRouteReload: () => void;
  notice: BannerNotice | null;
};

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function toDisplayText(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function triggerSourceLabel(triggerSource: TextplayPersistRecord['triggerSource']): string {
  if (triggerSource === 'SystemEvent') return 'Opening';
  if (triggerSource === 'AgentInitiative') return 'World Event';
  return 'Narrative Turn';
}

function triggerSourceTone(triggerSource: TextplayPersistRecord['triggerSource']): string {
  if (triggerSource === 'SystemEvent') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (triggerSource === 'AgentInitiative') return 'border-violet-200 bg-violet-50 text-violet-900';
  return 'border-slate-200 bg-white text-slate-900';
}

function RouteConfigDrawer(props: {
  open: boolean;
  onClose: () => void;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  routeLoading: boolean;
  routeError: string | null;
  routeBinding: RuntimeRouteBinding | null;
  effectiveRouteBinding: RuntimeRouteBinding | null;
  onRouteSourceChange: (source: 'local' | 'cloud') => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onRouteClear: () => void;
  onRouteReload: () => void;
}) {
  const { t } = useModTranslation('textplay');
  const effectiveBinding = props.effectiveRouteBinding || {
    source: 'local' as const,
    connectorId: '',
    model: '',
  };
  const connectors = props.routeOptions?.connectors || [];
  const selectedSource = effectiveBinding.source;
  const selectedConnectorId = selectedSource === 'cloud'
    ? (effectiveBinding.connectorId || connectors[0]?.id || '')
    : '';
  const selectedConnector = connectors.find((item) => item.id === selectedConnectorId) || null;
  const modelOptionsRaw = selectedSource === 'local'
    ? (props.routeOptions?.local.models.map((item) => item.model) || [])
    : (selectedConnector?.models || []);
  const modelOptions = useMemo(() => Array.from(new Set(modelOptionsRaw.filter(Boolean))), [modelOptionsRaw]);
  const [modelQuery, setModelQuery] = useState(effectiveBinding.model || '');

  useEffect(() => {
    setModelQuery(effectiveBinding.model || '');
  }, [effectiveBinding.model]);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.open, props.onClose]);

  const filteredModels = useMemo(
    () => filterModelOptions(modelOptions, modelQuery),
    [modelOptions, modelQuery],
  );

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 z-20 bg-slate-900/12 backdrop-blur-[1px] transition-opacity duration-300',
          props.open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={props.onClose}
        aria-hidden={!props.open}
      />

      <aside
        className={cn(
          'absolute inset-y-0 right-0 z-30 w-[360px] max-w-[92vw] border-l border-white/60 bg-[#f7fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          props.open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        aria-hidden={!props.open}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('settings.title')}</p>
              <p className="mt-1 text-xs text-gray-500">{t('settings.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
              aria-label={t('settings.close')}
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {props.routeError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <div>{t('settings.routeLoadFailed')}</div>
                <div className="mt-1 break-all">{props.routeError}</div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">{t('settings.source')}</label>
              <select
                value={selectedSource}
                onChange={(event) => props.onRouteSourceChange(normalizeRuntimeRouteSource(event.target.value))}
                disabled={!props.routeOptions}
                className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="local">{t('settings.sourceLocal')}</option>
                <option value="cloud">{t('settings.sourceCloud')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">{t('settings.connector')}</label>
              <select
                value={selectedConnectorId}
                onChange={(event) => props.onRouteConnectorChange(event.target.value)}
                disabled={!props.routeOptions || selectedSource !== 'cloud'}
                className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">{t('settings.connectorEmpty')}</option>
                {connectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.label || connector.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">{t('settings.model')}</label>
              <input
                list="textplay-model-options"
                value={modelQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setModelQuery(nextValue);
                  if (modelOptions.includes(nextValue)) {
                    props.onRouteModelChange(nextValue);
                  }
                }}
                onBlur={() => {
                  if (modelQuery && modelOptions.includes(modelQuery)) {
                    props.onRouteModelChange(modelQuery);
                    return;
                  }
                  setModelQuery(effectiveBinding.model || '');
                }}
                placeholder={t('settings.modelPlaceholder')}
                disabled={!props.routeOptions}
                className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <datalist id="textplay-model-options">
                {filteredModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              {props.routeLoading ? (
                <p className="text-[11px] text-gray-500">{t('settings.loading')}</p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={props.onRouteClear}
                className="h-10 flex-1 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
              >
                {t('settings.useRuntimeDefault')}
              </button>
              <button
                type="button"
                onClick={props.onRouteReload}
                className="h-10 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
              >
                {t('settings.reload')}
              </button>
            </div>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs leading-5 text-gray-500">
              {props.routeBinding
                ? t('settings.overrideActive')
                : t('settings.overrideDefault')}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SessionCard(props: Pick<TextplayShellProps, 'activeDraft' | 'isRunning' | 'onPause' | 'onResumeActive' | 'onStop'>) {
  const { t } = useModTranslation('textplay');
  const activeDraft = props.activeDraft;
  if (!activeDraft) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{t('session.title')}</div>
        <p className="mt-3 text-sm text-slate-500">{t('session.empty')}</p>
      </section>
    );
  }

  const paused = activeDraft.status === 'paused';
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t('session.title')}</div>
          <div className="mt-1 text-xs text-slate-500">{activeDraft.entryTitle}</div>
        </div>
        <div className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-medium',
          paused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
        )}>
          {paused ? t('status.paused') : (props.isRunning ? t('status.running') : t('status.active'))}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('labels.agent')}</dt>
          <dd className="text-right text-slate-900">{activeDraft.agentName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('labels.playerName')}</dt>
          <dd className="text-right text-slate-900">{activeDraft.playerName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('labels.playerIdentity')}</dt>
          <dd className="text-right text-slate-900">{toDisplayText(activeDraft.playerIdentity, t('labels.unspecified'))}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">{t('labels.updatedAt')}</dt>
          <dd className="text-right text-slate-900">{formatUpdatedAt(activeDraft.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2">
        {paused ? (
          <button
            type="button"
            onClick={props.onResumeActive}
            disabled={props.isRunning}
            className="h-10 flex-1 rounded-2xl bg-gradient-to-r from-[#4ECCA3] to-[#18B7D4] px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('actions.resume')}
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onPause}
            disabled={props.isRunning}
            className="h-10 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {t('actions.pause')}
          </button>
        )}
        <button
          type="button"
          onClick={props.onStop}
          disabled={props.isRunning}
          className="h-10 flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 disabled:opacity-50"
        >
          {t('actions.stop')}
        </button>
      </div>
    </section>
  );
}

export function TextplayShell(props: TextplayShellProps) {
  const { t } = useModTranslation('textplay');
  const [entryTab, setEntryTab] = useState<'new' | 'drafts'>('new');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const timelineBottomRef = useRef<HTMLDivElement | null>(null);

  const selectedDraft = props.drafts.find((item) => item.key === props.selectedDraftKey) || null;
  const selectedEntryHasNoAgents = (props.selectedEntry?.characterRefs.length || 0) === 0 && Boolean(props.selectedEntry);
  const autoSelectedAgent = props.agentOptions.length === 1 ? props.agentOptions[0] : null;
  const timelineScrollKey = useMemo(() => {
    const draftKey = props.activeDraft?.key || 'none';
    const lastRecordId = props.activeDraft?.records[props.activeDraft.records.length - 1]?.id || '';
    const pendingId = props.pendingUserTurn?.id || '';
    return `${draftKey}:${lastRecordId}:${pendingId}`;
  }, [props.activeDraft?.key, props.activeDraft?.records, props.pendingUserTurn?.id]);

  useEffect(() => {
    if (!props.activeDraft && !props.pendingUserTurn) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      timelineBottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.activeDraft, props.pendingUserTurn, timelineScrollKey]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 w-full bg-[#f4f8f8] text-slate-900">
      <div className="textplay-shell-root grid min-h-0 min-w-0 flex-1 grid-cols-1">
        <aside className="textplay-shell-side min-h-0 overflow-y-auto border-b border-slate-200 bg-[#f7fbfb] p-4">
          <div className="space-y-4">
            <SessionCard
              activeDraft={props.activeDraft}
              isRunning={props.isRunning}
              onPause={props.onPause}
              onResumeActive={props.onResumeActive}
              onStop={props.onStop}
            />

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{t('entry.title')}</div>
                <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setEntryTab('new')}
                    className={cn(
                      'rounded-full px-3 py-1 transition-colors',
                      entryTab === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                    )}
                  >
                    {t('entry.tabs.new')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryTab('drafts')}
                    className={cn(
                      'rounded-full px-3 py-1 transition-colors',
                      entryTab === 'drafts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                    )}
                  >
                    {t('entry.tabs.drafts')}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">{t('labels.world')}</label>
                  <select
                    value={props.selectedWorldId}
                    onChange={(event) => props.setSelectedWorldId(event.target.value)}
                    disabled={props.worldsLoading || props.worlds.length === 0}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="">{t('entry.selectWorld')}</option>
                    {props.worlds.map((world) => (
                      <option key={world.id} value={world.id}>
                        {world.name}
                      </option>
                    ))}
                  </select>
                  {props.worldsError ? (
                    <p className="text-[11px] text-rose-600">{props.worldsError}</p>
                  ) : null}
                </div>

                {entryTab === 'new' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">{t('labels.entry')}</label>
                      <select
                        value={props.selectedEntryEventId}
                        onChange={(event) => props.setSelectedEntryEventId(event.target.value)}
                        disabled={!props.selectedWorldId || props.entriesLoading || props.entries.length === 0}
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="">{t('entry.selectEntry')}</option>
                        {props.entries.map((entry) => (
                          <option key={entry.entryEventId} value={entry.entryEventId}>
                            {entry.title}
                          </option>
                        ))}
                      </select>
                      {props.entriesError ? (
                        <p className="text-[11px] text-rose-600">{props.entriesError}</p>
                      ) : null}
                    </div>

                    {props.selectedEntry ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="font-medium text-slate-900">{props.selectedEntry.title}</div>
                        <p className="mt-2 leading-6">{props.selectedEntry.entryBackdrop}</p>
                      </div>
                    ) : null}

                    {props.agentOptions.length > 1 ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">{t('labels.agent')}</label>
                        <select
                          value={props.selectedAgentId}
                          onChange={(event) => props.setSelectedAgentId(event.target.value)}
                          disabled={props.agentOptionsLoading}
                          className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                        >
                          <option value="">{t('entry.selectAgent')}</option>
                          {props.agentOptions.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : autoSelectedAgent ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        {t('entry.autoAgent')}: {autoSelectedAgent.name}
                      </div>
                    ) : null}

                    {selectedEntryHasNoAgents ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {t('entry.noAgentAvailable')}
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">{t('labels.playerName')}</label>
                      <input
                        value={props.playerName}
                        onChange={(event) => props.setPlayerName(event.target.value)}
                        placeholder={t('entry.playerNamePlaceholder')}
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">{t('labels.playerIdentity')}</label>
                      <input
                        value={props.playerIdentity}
                        onChange={(event) => props.setPlayerIdentity(event.target.value)}
                        placeholder={t('entry.playerIdentityPlaceholder')}
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={props.onStart}
                      disabled={!props.canStart}
                      className="h-11 w-full rounded-2xl bg-gradient-to-r from-[#4ECCA3] to-[#18B7D4] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('actions.start')}
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    {props.draftsLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        {t('drafts.loading')}
                      </div>
                    ) : null}
                    {props.draftsError ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {props.draftsError}
                      </div>
                    ) : null}
                    {props.drafts.length === 0 && !props.draftsLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        {t('drafts.empty')}
                      </div>
                    ) : null}
                    {props.drafts.map((draft) => {
                      const isSelected = draft.key === selectedDraft?.key;
                      return (
                        <div
                          key={draft.key}
                          className={cn(
                            'rounded-2xl border p-3 transition-colors',
                            isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => props.setSelectedDraftKey(draft.key)}
                            className="w-full text-left"
                          >
                            <div className="text-sm font-medium text-slate-900">{draft.entryTitle}</div>
                            <div className="mt-1 text-xs text-slate-500">{draft.agentName} · {draft.playerName}</div>
                            <div className="mt-2 text-xs text-slate-500">{formatUpdatedAt(draft.updatedAt)}</div>
                          </button>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => props.onResumeDraft(draft.key)}
                              disabled={props.isRunning}
                              className="h-9 flex-1 rounded-2xl bg-white px-3 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50"
                            >
                              {t('actions.resume')}
                            </button>
                            <button
                              type="button"
                              onClick={() => props.onRestartDraft(draft.key)}
                              disabled={props.isRunning}
                              className="h-9 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                            >
                              {t('actions.restart')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </aside>

        <main className="textplay-shell-main relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {props.activeDraft ? props.activeDraft.entryTitle : t('timeline.title')}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {props.activeDraft
                  ? `${props.activeDraft.agentName} · ${props.activeDraft.playerName}`
                  : t('timeline.subtitle')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              <span>⚙</span>
              <span>{t('actions.settings')}</span>
            </button>
          </div>

          {props.notice ? (
            <div className={cn(
              'mx-4 mt-4 rounded-2xl border px-3 py-2 text-sm',
              props.notice.kind === 'error' && 'border-rose-200 bg-rose-50 text-rose-700',
              props.notice.kind === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800',
              props.notice.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              props.notice.kind === 'info' && 'border-sky-200 bg-sky-50 text-sky-700',
            )}>
              {props.notice.message}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!props.activeDraft ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                {t('timeline.empty')}
              </div>
            ) : props.activeDraft.records.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                {t('timeline.waitingOpening')}
              </div>
            ) : (
              <div className="space-y-3">
                {props.activeDraft.records.map((record) => (
                  <article
                    key={record.id}
                    className={cn(
                      'rounded-3xl border p-4 shadow-sm',
                      triggerSourceTone(record.triggerSource),
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{triggerSourceLabel(record.triggerSource)}</div>
                      <div className="text-xs text-slate-500">{formatUpdatedAt(record.updatedAt)}</div>
                    </div>
                    {record.userMessage ? (
                      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                        {record.userMessage}
                      </div>
                    ) : null}
                    <div className="mt-3 whitespace-pre-wrap text-[15px] leading-8">{record.text}</div>
                  </article>
                ))}
                {props.pendingUserTurn ? (
                  <article className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm text-sky-900">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{t('timeline.pendingLabel')}</div>
                      <div className="text-xs text-sky-600">{t('timeline.pendingStatus')}</div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                      {props.pendingUserTurn.userMessage}
                    </div>
                  </article>
                ) : null}
                <div ref={timelineBottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
              <textarea
                value={props.inputText}
                onChange={(event) => props.setInputText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) {
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (props.canSend) {
                      props.onSend();
                    }
                  }
                }}
                placeholder={props.activeDraft
                  ? (props.activeDraft.status === 'paused' ? t('timeline.pausedInputPlaceholder') : t('timeline.inputPlaceholder'))
                  : t('timeline.noSessionPlaceholder')}
                disabled={!props.activeDraft || props.activeDraft.status === 'paused' || props.isRunning}
                className="min-h-[128px] w-full resize-none bg-transparent text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={props.onCancel}
                  disabled={!props.isRunning}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="button"
                  onClick={props.onSend}
                  disabled={!props.canSend}
                  className="h-10 rounded-2xl bg-gradient-to-r from-[#4ECCA3] to-[#18B7D4] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.isRunning ? t('actions.running') : t('actions.send')}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <RouteConfigDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        routeOptions={props.routeOptions}
        routeLoading={props.routeLoading}
        routeError={props.routeError}
        routeBinding={props.routeBinding}
        effectiveRouteBinding={props.effectiveRouteBinding}
        onRouteSourceChange={props.onRouteSourceChange}
        onRouteConnectorChange={props.onRouteConnectorChange}
        onRouteModelChange={props.onRouteModelChange}
        onRouteClear={props.onRouteClear}
        onRouteReload={props.onRouteReload}
      />
    </div>
  );
}
