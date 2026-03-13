import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellAuth, useShellStatusBanner } from '@nimiplatform/sdk/mod/shell';
import {
  createHookClient,
  createModRuntimeClient,
  useModTranslation,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from "@nimiplatform/sdk/mod";
import {
  createNarrativeEngineModule,
  exportStoryState,
  hydrateStoryState,
  resetStoryState,
} from '../../../../modules/narrative-engine/src/index.js';
import type { TextplayShellProps } from '../components/textplay-shell.js';
import { TEXTPLAY_MOD_ID } from '../contracts.js';
import { listEntryAgentOptions } from '../data/creator-agents.js';
import { getPlayableEntryDetail, listPlayableEntries } from '../data/entry-catalog.js';
import { queryTextplayChatRouteOptions } from '../data/route-options.js';
import { loadEntryStartupPackage } from '../data/startup-package.js';
import { publishTextplayStoryDraft } from '../data/publish-story.js';
import { listMyWorlds } from '../data/world-catalog.js';
import {
  buildTextplayDraftKey,
  buildTextplayDraftWorldScope,
  deleteTextplayDraft,
  listTextplayDraftsByWorldScope,
  loadTextplayDraft,
  saveTextplayDraft,
} from '../draft-store.js';
import { createTextplayFlowId, emitTextplayLog } from '../logging.js';
import { runTextplayRender } from '../pipeline/run-textplay-render.js';
import { createTextplayPresenceMachine } from '../presence/state-machine.js';
import { createTextplayRuntimeAiClient } from '../runtime-ai-client.js';
import { loadTextplayRouteBinding, persistTextplayRouteBinding } from '../route-override-store.js';
import { createUlid } from '../utils/ulid.js';
import { buildContextualUserMessage, buildInitiativeSystemPayload, buildOpeningSystemPayload } from './story-briefing.js';
import { selectTextplayInitiativeScheduleDecision } from './initiative-scheduler.js';
import type {
  TextplayAgentOption,
  TextplayDraftRecord,
  TextplayEntryDetail,
  TextplayEntrySummary,
  TextplayPersistRecord,
  TextplayPresenceState,
  TextplayRenderResult,
  TextplayStartupPackage,
  TextplayWorldSummary,
} from '../types.js';

type BannerNotice = {
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function nowIso(): string {
  return new Date().toISOString();
}

function toMs(value: unknown, fallback = Date.now()): number {
  const numeric = Date.parse(String(value || ''));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readDraftCurrentTension(draft: TextplayDraftRecord | null): number {
  if (!draft) {
    return 0;
  }
  const latestTurnId = draft.engineSnapshot.latestTurnId;
  if (!latestTurnId) {
    return 0;
  }
  const projection = draft.engineSnapshot.projections[latestTurnId];
  const metrics = projection && typeof projection === 'object'
    ? (projection as { metrics?: Record<string, unknown> }).metrics
    : null;
  const tension = Number(metrics?.tension);
  return Number.isFinite(tension) ? Math.max(0, Math.min(1, tension)) : 0;
}

function createStoryId(): string {
  return `story_${createUlid()}`;
}

function createSessionId(): string {
  return `session_${createUlid()}`;
}

function asBindingRecord(binding: RuntimeRouteBinding | null): Record<string, unknown> | undefined {
  return binding ? { ...binding } : undefined;
}

function buildPersistRecord(input: {
  request: {
    storyId: string;
    worldId: string;
    agentId: string;
    userId: string;
    playerName: string;
    playerIdentity: string;
    triggerSource: TextplayPersistRecord['triggerSource'];
    userMessage?: string;
    systemPayload?: Record<string, unknown>;
  };
  result: Extract<TextplayRenderResult, { ok: true }>;
}): TextplayPersistRecord {
  const timestamp = nowIso();
  return {
    id: createUlid(),
    storyId: input.result.meta.storyId,
    worldId: input.request.worldId,
    agentId: input.request.agentId,
    turnId: input.result.meta.turnId,
    runId: input.result.meta.runId,
    traceId: input.result.meta.traceId,
    triggerSource: input.request.triggerSource,
    userId: input.request.userId,
    playerName: input.request.playerName,
    playerIdentity: input.request.playerIdentity || undefined,
    userMessage: input.request.userMessage || '',
    systemPayload: input.request.systemPayload || null,
    text: input.result.text,
    meta: input.result.meta,
    runEvents: input.result.runEvents,
    runSnapshot: input.result.meta.runSnapshot,
    warnings: input.result.meta.warnings || [],
    presenceReports: input.result.meta.presenceReports || [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function toEntryDetailFromStartup(startup: TextplayStartupPackage): TextplayEntryDetail {
  return {
    entryEventId: startup.entryEventId,
    worldId: startup.worldId,
    timelineSeq: startup.entry.timelineSeq,
    title: startup.entry.title,
    summary: startup.entry.summary,
    entryBackdrop: startup.entry.entryBackdrop,
    entryHook: startup.entry.entryHook,
    participants: [...startup.cast.participants],
    characterRefs: [...startup.entry.characterRefs],
    eventHorizon: startup.entry.eventHorizon,
    entryMode: startup.entry.entryMode,
    updatedAt: startup.snapshot.loadedAt,
    playable: true,
    cause: startup.entry.cause,
    process: startup.entry.process,
    result: startup.entry.result,
    timeRef: startup.entry.timeRef,
    locationRefs: [...startup.entry.locationRefs],
    recommendedSceneId: startup.entry.recommendedSceneId,
  };
}

export function useTextplayController(): TextplayShellProps {
  const { t } = useModTranslation('textplay');
  const hookClient = useMemo(() => createHookClient(TEXTPLAY_MOD_ID), []);
  const runtimeClient = useMemo(() => createModRuntimeClient(TEXTPLAY_MOD_ID), []);
  const aiClient = useMemo(() => createTextplayRuntimeAiClient(runtimeClient), [runtimeClient]);
  const narrativeEngine = useMemo(() => createNarrativeEngineModule({
    queryData: (capability, query) => hookClient.data.query({ capability, query }),
    generateText: async (payload) => {
      const result = await aiClient.generateText(payload);
      return { text: result.text };
    },
  }), [aiClient, hookClient]);
  const flowId = useMemo(() => createTextplayFlowId('textplay-controller'), []);
  const { showStatusBanner } = useShellStatusBanner();
  const { user } = useShellAuth();
  const userId = toText((user as Record<string, unknown> | null)?.id);

  const [worlds, setWorlds] = useState<TextplayWorldSummary[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(true);
  const [worldsError, setWorldsError] = useState<string | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState('');

  const [entries, setEntries] = useState<TextplayEntrySummary[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [selectedEntryEventId, setSelectedEntryEventId] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<TextplayEntryDetail | null>(null);

  const [agentOptions, setAgentOptions] = useState<TextplayAgentOption[]>([]);
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const [playerName, setPlayerName] = useState('');
  const [playerIdentity, setPlayerIdentity] = useState('');

  const [drafts, setDrafts] = useState<TextplayDraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [selectedDraftKey, setSelectedDraftKey] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<TextplayDraftRecord | null>(null);

  const [inputText, setInputText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<BannerNotice | null>(null);

  const [routeOptions, setRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeBinding, setRouteBindingState] = useState<RuntimeRouteBinding | null>(() => loadTextplayRouteBinding());

  const activeDraftRef = useRef<TextplayDraftRecord | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const presenceMachineRef = useRef<ReturnType<typeof createTextplayPresenceMachine> | null>(null);
  const presenceStateRef = useRef<TextplayPresenceState>('active');
  const presenceStateSinceRef = useRef<number>(Date.now());
  const presenceReportMarkRef = useRef<number>(0);
  const pausedSinceRef = useRef<number | null>(null);
  const initiativeWarningAtRef = useRef<number>(0);

  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);

  const dispatchPresenceEvent = useCallback((event: 'onUserComposing' | 'onUserPaused' | 'onUserActive' | 'onInitiativeReceived') => {
    const machine = presenceMachineRef.current;
    if (!machine) {
      return presenceStateRef.current;
    }
    const previousState = presenceStateRef.current;
    const nextState = machine.dispatch(event);
    const nowMs = Date.now();
    presenceStateRef.current = nextState;
    if (event === 'onInitiativeReceived') {
      presenceStateSinceRef.current = nowMs;
      if (nextState === 'paused') {
        pausedSinceRef.current = nowMs;
      }
      return nextState;
    }
    if (nextState !== previousState) {
      presenceStateSinceRef.current = nowMs;
    }
    if (nextState === 'paused') {
      pausedSinceRef.current = nowMs;
    } else if (previousState === 'paused') {
      pausedSinceRef.current = null;
    }
    return nextState;
  }, []);

  const collectPresenceReports = useCallback(() => {
    const machine = presenceMachineRef.current;
    if (!machine) {
      return [];
    }
    const reports = machine.collectSince(presenceReportMarkRef.current);
    presenceReportMarkRef.current = machine.mark();
    return reports;
  }, []);

  const effectiveRouteBinding = useMemo(
    () => routeBinding || routeOptions?.selected || null,
    [routeBinding, routeOptions],
  );

  const pushNotice = useCallback((next: BannerNotice | null) => {
    setNotice(next);
    if (next) {
      showStatusBanner(next);
    }
  }, [showStatusBanner]);

  useEffect(() => {
    const machine = presenceMachineRef.current;
    machine?.destroy();
    presenceMachineRef.current = null;
    presenceReportMarkRef.current = 0;
    pausedSinceRef.current = null;
    presenceStateSinceRef.current = Date.now();
    presenceStateRef.current = 'active';

    if (!activeDraft) {
      return;
    }

    const policy = activeDraft.startupPackage.startupPolicy.initiative;
    const initialState: TextplayPresenceState = activeDraft.status === 'paused' ? 'paused' : 'active';
    const nextMachine = createTextplayPresenceMachine({
      idleTimeoutSeconds: policy.idleSeconds,
      awayTimeoutSeconds: policy.awaySeconds,
      initialState,
    });
    presenceMachineRef.current = nextMachine;
    presenceReportMarkRef.current = nextMachine.mark();
    presenceStateRef.current = initialState;
    const initialSince = activeDraft.status === 'paused'
      ? toMs(activeDraft.updatedAt)
      : Date.now();
    presenceStateSinceRef.current = initialSince;
    pausedSinceRef.current = activeDraft.status === 'paused' ? initialSince : null;

    return () => {
      nextMachine.destroy();
      if (presenceMachineRef.current === nextMachine) {
        presenceMachineRef.current = null;
      }
    };
  }, [activeDraft?.key, activeDraft?.status, activeDraft?.updatedAt, activeDraft?.startupPackage.startupPolicy.initiative.awaySeconds, activeDraft?.startupPackage.startupPolicy.initiative.idleSeconds]);

  useEffect(() => {
    if (!activeDraft || !presenceMachineRef.current) {
      return;
    }
    if (activeDraft.status === 'paused') {
      dispatchPresenceEvent('onUserPaused');
      return;
    }
    if (inputText.trim()) {
      dispatchPresenceEvent('onUserComposing');
      return;
    }
    dispatchPresenceEvent('onUserActive');
  }, [activeDraft?.key, activeDraft?.status, dispatchPresenceEvent, inputText]);

  const refreshDraftsForWorld = useCallback(async (worldId: string) => {
    const normalizedWorldId = toText(worldId);
    if (!userId || !normalizedWorldId) {
      setDrafts([]);
      setSelectedDraftKey(null);
      return;
    }
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const nextDrafts = await listTextplayDraftsByWorldScope(
        buildTextplayDraftWorldScope({ userId, worldId: normalizedWorldId }),
      );
      setDrafts(nextDrafts);
      setSelectedDraftKey((current) => {
        if (current && nextDrafts.some((item) => item.key === current)) {
          return current;
        }
        return nextDrafts[0]?.key || null;
      });
    } catch (error) {
      setDrafts([]);
      setSelectedDraftKey(null);
      setDraftsError(toErrorMessage(error));
    } finally {
      setDraftsLoading(false);
    }
  }, [userId]);

  const saveDraft = useCallback(async (draft: TextplayDraftRecord): Promise<TextplayDraftRecord> => {
    const saved = await saveTextplayDraft(draft);
    if (saved.worldId === selectedWorldId) {
      await refreshDraftsForWorld(saved.worldId);
    }
    return saved;
  }, [refreshDraftsForWorld, selectedWorldId]);

  const applyRouteBinding = useCallback(async (next: RuntimeRouteBinding | null) => {
    setRouteBindingState(next);
    persistTextplayRouteBinding(next);
    const current = activeDraftRef.current;
    if (!current) {
      return;
    }
    const saved = await saveDraft({
      ...current,
      routeOverride: next,
      updatedAt: nowIso(),
    });
    setActiveDraft(saved);
  }, [saveDraft]);

  const reloadRouteOptions = useCallback(async () => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const nextOptions = await queryTextplayChatRouteOptions({
        runtimeClient: runtimeClient.route,
      });
      setRouteOptions(nextOptions);
    } catch (error) {
      const message = toErrorMessage(error);
      setRouteError(message);
      pushNotice({
        kind: 'warning',
        message: `${t('messages.routeUnavailable')} ${message}`,
      });
    } finally {
      setRouteLoading(false);
    }
  }, [pushNotice, runtimeClient, t]);

  const upsertStartupContext = useCallback(async (startup: TextplayStartupPackage) => {
    await narrativeEngine.contextResolve({
      storyId: startup.storyId,
      action: 'upsert',
      scopes: startup.narrativeScopes,
    });
  }, [narrativeEngine]);

  const persistCurrentActiveAsPaused = useCallback(async (input: {
    clearFromActive?: boolean;
    resetStory?: boolean;
  } = {}): Promise<TextplayDraftRecord | null> => {
    const current = activeDraftRef.current;
    if (!current) {
      return null;
    }
    const snapshot = exportStoryState(current.storyId);
    const saved = await saveDraft({
      ...current,
      status: 'paused',
      engineSnapshot: snapshot,
      routeOverride: routeBinding,
      updatedAt: nowIso(),
    });
    if (input.resetStory) {
      resetStoryState(current.storyId);
    }
    if (input.clearFromActive) {
      setActiveDraft(null);
    } else {
      setActiveDraft(saved);
    }
    return saved;
  }, [routeBinding, saveDraft]);

  const syncDraftSnapshot = useCallback(async (draft: TextplayDraftRecord, status: TextplayDraftRecord['status']) => {
    const snapshot = exportStoryState(draft.storyId);
    const saved = await saveDraft({
      ...draft,
      status,
      engineSnapshot: snapshot,
      routeOverride: routeBinding,
      updatedAt: nowIso(),
    });
    setActiveDraft(saved);
    return saved;
  }, [routeBinding, saveDraft]);

  const resolveDraftByKey = useCallback(async (draftKey: string): Promise<TextplayDraftRecord | null> => {
    const fromList = drafts.find((item) => item.key === draftKey) || null;
    if (fromList) {
      return fromList;
    }
    return loadTextplayDraft(draftKey);
  }, [drafts]);

  const executeRender = useCallback(async (input: {
    draftSeed?: TextplayDraftRecord;
    request: {
      storyId: string;
      entryEventId: string;
      worldId: string;
      agentId: string;
      userId: string;
      playerName: string;
      playerIdentity: string;
      triggerSource: TextplayPersistRecord['triggerSource'];
      userMessage?: string;
      systemPayload?: Record<string, unknown>;
      binding?: RuntimeRouteBinding | null;
      presence?: TextplayPresenceState;
    };
  }): Promise<Extract<TextplayRenderResult, { ok: true }> | null> => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsRunning(true);
    try {
      const result = await runTextplayRender({
        request: {
          storyId: input.request.storyId,
          entryEventId: input.request.entryEventId,
          worldId: input.request.worldId,
          agentId: input.request.agentId,
          userId: input.request.userId,
          playerName: input.request.playerName,
          playerIdentity: input.request.playerIdentity,
          triggerSource: input.request.triggerSource,
          userMessage: input.request.userMessage,
          systemPayload: input.request.systemPayload,
          binding: asBindingRecord(input.request.binding || null),
          presence: input.request.presence,
          runId: createUlid(),
          traceId: createUlid(),
        },
        deps: {
          hookClient,
          runtimeClient: runtimeClient.route,
          aiClient,
          narrativeEngine,
          abortSignal: abortController.signal,
        },
        presenceReports: collectPresenceReports(),
      });
      if (!result.ok) {
        if (input.draftSeed) {
          await syncDraftSnapshot(input.draftSeed, input.draftSeed.status);
        }
        pushNotice({
          kind: 'warning',
          message: `${t('messages.renderFailed')} ${result.reasonCode}`,
        });
        return null;
      }
      return result;
    } catch (error) {
      if (input.draftSeed) {
        await syncDraftSnapshot(input.draftSeed, input.draftSeed.status);
      }
      pushNotice({
        kind: 'error',
        message: `${t('messages.renderCrashed')} ${toErrorMessage(error)}`,
      });
      return null;
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsRunning(false);
    }
  }, [aiClient, collectPresenceReports, hookClient, narrativeEngine, pushNotice, runtimeClient, syncDraftSnapshot, t]);

  useEffect(() => {
    emitTextplayLog({
      level: 'info',
      message: 'textplay:controller:mounted',
      flowId,
      source: 'useTextplayController',
      details: { userId },
    });
  }, [flowId, userId]);

  useEffect(() => {
    let disposed = false;
    setWorldsLoading(true);
    setWorldsError(null);
    void listMyWorlds({ hookClient })
      .then((nextWorlds) => {
        if (disposed) {
          return;
        }
        setWorlds(nextWorlds);
        setSelectedWorldId((current) => {
          if (current && nextWorlds.some((item) => item.id === current)) {
            return current;
          }
          return nextWorlds[0]?.id || '';
        });
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        setWorlds([]);
        setWorldsError(toErrorMessage(error));
      })
      .finally(() => {
        if (!disposed) {
          setWorldsLoading(false);
        }
      });

    void reloadRouteOptions();

    return () => {
      disposed = true;
    };
  }, [hookClient, reloadRouteOptions]);

  useEffect(() => {
    if (!selectedWorldId) {
      setEntries([]);
      setSelectedEntryEventId('');
      setSelectedEntry(null);
      void refreshDraftsForWorld('');
      return;
    }
    let disposed = false;
    setEntriesLoading(true);
    setEntriesError(null);
    void listPlayableEntries({
      hookClient,
      worldId: selectedWorldId,
    }).then((nextEntries) => {
      if (disposed) {
        return;
      }
      setEntries(nextEntries);
      setSelectedEntryEventId((current) => {
        if (current && nextEntries.some((item) => item.entryEventId === current)) {
          return current;
        }
        return nextEntries[0]?.entryEventId || '';
      });
    }).catch((error) => {
      if (disposed) {
        return;
      }
      setEntries([]);
      setSelectedEntryEventId('');
      setEntriesError(toErrorMessage(error));
    }).finally(() => {
      if (!disposed) {
        setEntriesLoading(false);
      }
    });
    void refreshDraftsForWorld(selectedWorldId);
    return () => {
      disposed = true;
    };
  }, [hookClient, refreshDraftsForWorld, selectedWorldId]);

  useEffect(() => {
    if (!selectedWorldId || !selectedEntryEventId) {
      setSelectedEntry(null);
      return;
    }
    let disposed = false;
    void getPlayableEntryDetail({
      hookClient,
      worldId: selectedWorldId,
      entryEventId: selectedEntryEventId,
    }).then((detail) => {
      if (!disposed) {
        setSelectedEntry(detail);
      }
    }).catch((error) => {
      if (!disposed) {
        setSelectedEntry(null);
        pushNotice({
          kind: 'warning',
          message: `${t('messages.entryLoadFailed')} ${toErrorMessage(error)}`,
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [hookClient, pushNotice, selectedEntryEventId, selectedWorldId, t]);

  useEffect(() => {
    if (!selectedEntry) {
      setAgentOptions([]);
      setSelectedAgentId('');
      return;
    }
    let disposed = false;
    setAgentOptionsLoading(true);
    void listEntryAgentOptions({
      hookClient,
      characterRefs: selectedEntry.characterRefs,
    }).then((options) => {
      if (disposed) {
        return;
      }
      setAgentOptions(options);
      if (options.length === 1) {
        setSelectedAgentId(options[0]!.id);
        return;
      }
      setSelectedAgentId((current) => (
        current && options.some((item) => item.id === current) ? current : ''
      ));
    }).catch((error) => {
      if (!disposed) {
        setAgentOptions([]);
        setSelectedAgentId('');
        pushNotice({
          kind: 'warning',
          message: `${t('messages.agentLoadFailed')} ${toErrorMessage(error)}`,
        });
      }
    }).finally(() => {
      if (!disposed) {
        setAgentOptionsLoading(false);
      }
    });
    return () => {
      disposed = true;
    };
  }, [hookClient, pushNotice, selectedEntry, t]);

  const onStart = useCallback(async () => {
    if (!userId) {
      pushNotice({ kind: 'warning', message: t('messages.userMissing') });
      return;
    }
    if (!selectedWorldId || !selectedEntry || !playerName.trim()) {
      pushNotice({ kind: 'warning', message: t('messages.startIncomplete') });
      return;
    }
    if (selectedEntry.characterRefs.length === 0) {
      pushNotice({ kind: 'warning', message: t('messages.noAgentAvailable') });
      return;
    }
    if (!selectedAgentId) {
      pushNotice({ kind: 'warning', message: t('messages.agentRequired') });
      return;
    }

    await persistCurrentActiveAsPaused({ clearFromActive: true, resetStory: true });

    const storyId = createStoryId();
    const sessionId = createSessionId();
    const selectedAgent = agentOptions.find((item) => item.id === selectedAgentId) || {
      id: selectedAgentId,
      name: selectedAgentId,
      avatarUrl: null,
    };

    try {
      const startupPackage = await loadEntryStartupPackage({
        hookClient,
        detail: selectedEntry,
        storyId,
        agentId: selectedAgentId,
        userId,
      });

      await upsertStartupContext(startupPackage);

      const renderSuccess = await executeRender({
        request: {
          storyId,
          entryEventId: selectedEntry.entryEventId,
          worldId: selectedWorldId,
          agentId: selectedAgentId,
          userId,
          playerName: playerName.trim(),
          playerIdentity: playerIdentity.trim(),
          triggerSource: 'SystemEvent',
          systemPayload: buildOpeningSystemPayload({
            entry: selectedEntry,
            startup: startupPackage,
            userId,
            playerName: playerName.trim(),
            playerIdentity: playerIdentity.trim(),
          }),
          binding: routeBinding,
          presence: 'active',
        },
      });

      if (!renderSuccess) {
        resetStoryState(storyId);
        return;
      }

      const snapshot = exportStoryState(storyId);
      const openingRecord = buildPersistRecord({
        request: {
          storyId,
          worldId: selectedWorldId,
          agentId: selectedAgentId,
          userId,
          playerName: playerName.trim(),
          playerIdentity: playerIdentity.trim(),
          triggerSource: 'SystemEvent',
          systemPayload: buildOpeningSystemPayload({
            entry: selectedEntry,
            startup: startupPackage,
            userId,
            playerName: playerName.trim(),
            playerIdentity: playerIdentity.trim(),
          }),
        },
        result: renderSuccess,
      });

      const timestamp = nowIso();
      const draft = await saveDraft({
        key: buildTextplayDraftKey({
          userId,
          worldId: selectedWorldId,
          storyId,
          agentId: selectedAgentId,
        }),
        worldScope: buildTextplayDraftWorldScope({
          userId,
          worldId: selectedWorldId,
        }),
        userId,
        worldId: selectedWorldId,
        storyId,
        agentId: selectedAgentId,
        entryEventId: selectedEntry.entryEventId,
        sessionId,
        status: 'active',
        playerName: playerName.trim(),
        playerIdentity: playerIdentity.trim(),
        entryTitle: selectedEntry.title,
        agentName: selectedAgent.name,
        agentAvatar: selectedAgent.avatarUrl,
        startupPackage,
        engineSnapshot: snapshot,
        records: [openingRecord],
        routeOverride: routeBinding,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      setActiveDraft(draft);
      setSelectedDraftKey(draft.key);
      setInputText('');
      pushNotice({
        kind: 'success',
        message: t('messages.storyStarted'),
      });
    } catch (error) {
      resetStoryState(storyId);
      pushNotice({
        kind: 'error',
        message: `${t('messages.startFailed')} ${toErrorMessage(error)}`,
      });
    }
  }, [
    agentOptions,
    executeRender,
    hookClient,
    playerIdentity,
    playerName,
    pushNotice,
    routeBinding,
    saveDraft,
    selectedAgentId,
    selectedEntry,
    selectedWorldId,
    t,
    upsertStartupContext,
    userId,
    persistCurrentActiveAsPaused,
  ]);

  const onPause = useCallback(async () => {
    const current = activeDraftRef.current;
    if (!current) {
      return;
    }
    await syncDraftSnapshot(current, 'paused');
    pushNotice({
      kind: 'info',
      message: t('messages.sessionPaused'),
    });
  }, [pushNotice, syncDraftSnapshot, t]);

  const onResumeActive = useCallback(async () => {
    const current = activeDraftRef.current;
    if (!current) {
      return;
    }
    const saved = await syncDraftSnapshot(current, 'active');
    setActiveDraft(saved);
    pushNotice({
      kind: 'info',
      message: t('messages.sessionResumed'),
    });
  }, [pushNotice, syncDraftSnapshot, t]);

  const onResumeDraft = useCallback(async (draftKey: string) => {
    const draft = await resolveDraftByKey(draftKey);
    if (!draft) {
      pushNotice({ kind: 'warning', message: t('messages.draftMissing') });
      return;
    }
    await persistCurrentActiveAsPaused({ clearFromActive: true, resetStory: true });
    hydrateStoryState(draft.engineSnapshot);
    await applyRouteBinding(draft.routeOverride);
    const saved = await saveDraft({
      ...draft,
      status: 'active',
      updatedAt: nowIso(),
    });
    setActiveDraft(saved);
    setSelectedWorldId(saved.worldId);
    setSelectedEntryEventId(saved.entryEventId);
    setSelectedAgentId(saved.agentId);
    setPlayerName(saved.playerName);
    setPlayerIdentity(saved.playerIdentity);
    setSelectedDraftKey(saved.key);
    setInputText('');
    pushNotice({
      kind: 'info',
      message: t('messages.sessionResumed'),
    });
  }, [applyRouteBinding, persistCurrentActiveAsPaused, pushNotice, resolveDraftByKey, saveDraft, t]);

  const onRestartDraft = useCallback(async (draftKey: string) => {
    const draft = await resolveDraftByKey(draftKey);
    if (!draft) {
      pushNotice({ kind: 'warning', message: t('messages.draftMissing') });
      return;
    }

    const wasCurrent = activeDraftRef.current?.key === draft.key;
    if (!wasCurrent) {
      await persistCurrentActiveAsPaused({ clearFromActive: true, resetStory: true });
    }

    resetStoryState(draft.storyId);
    try {
      await upsertStartupContext(draft.startupPackage);
      const renderSuccess = await executeRender({
        request: {
          storyId: draft.storyId,
          entryEventId: draft.entryEventId,
          worldId: draft.worldId,
          agentId: draft.agentId,
          userId: draft.userId,
          playerName: draft.playerName,
          playerIdentity: draft.playerIdentity,
          triggerSource: 'SystemEvent',
          systemPayload: buildOpeningSystemPayload({
            entry: toEntryDetailFromStartup(draft.startupPackage),
            startup: draft.startupPackage,
            userId: draft.userId,
            playerName: draft.playerName,
            playerIdentity: draft.playerIdentity,
          }),
          binding: draft.routeOverride,
          presence: 'active',
        },
      });

      if (!renderSuccess) {
        if (wasCurrent) {
          hydrateStoryState(draft.engineSnapshot);
          setActiveDraft(draft);
        }
        return;
      }

      const snapshot = exportStoryState(draft.storyId);
      const openingPayload = buildOpeningSystemPayload({
        entry: toEntryDetailFromStartup(draft.startupPackage),
        startup: draft.startupPackage,
        userId: draft.userId,
        playerName: draft.playerName,
        playerIdentity: draft.playerIdentity,
      });
      const openingRecord = buildPersistRecord({
        request: {
          storyId: draft.storyId,
          worldId: draft.worldId,
          agentId: draft.agentId,
          userId: draft.userId,
          playerName: draft.playerName,
          playerIdentity: draft.playerIdentity,
          triggerSource: 'SystemEvent',
          systemPayload: openingPayload,
        },
        result: renderSuccess,
      });

      setRouteBindingState(draft.routeOverride);
      persistTextplayRouteBinding(draft.routeOverride);
      const saved = await saveDraft({
        ...draft,
        status: 'active',
        engineSnapshot: snapshot,
        records: [openingRecord],
        routeOverride: draft.routeOverride,
        updatedAt: nowIso(),
      });
      setActiveDraft(saved);
      setSelectedWorldId(saved.worldId);
      setSelectedEntryEventId(saved.entryEventId);
      setSelectedAgentId(saved.agentId);
      setPlayerName(saved.playerName);
      setPlayerIdentity(saved.playerIdentity);
      setSelectedDraftKey(saved.key);
      setInputText('');
      pushNotice({
        kind: 'success',
        message: t('messages.storyRestarted'),
      });
    } catch (error) {
      if (wasCurrent) {
        hydrateStoryState(draft.engineSnapshot);
        setActiveDraft(draft);
      }
      pushNotice({
        kind: 'error',
        message: `${t('messages.restartFailed')} ${toErrorMessage(error)}`,
      });
    }
  }, [
    applyRouteBinding,
    executeRender,
    persistCurrentActiveAsPaused,
    pushNotice,
    resolveDraftByKey,
    routeBinding,
    saveDraft,
    t,
    upsertStartupContext,
  ]);

  const onSend = useCallback(async () => {
    const current = activeDraftRef.current;
    if (!current || current.status === 'paused' || !inputText.trim()) {
      return;
    }
    const userMessage = buildContextualUserMessage({
      playerName: current.playerName,
      playerIdentity: current.playerIdentity,
      userMessage: inputText.trim(),
    });
    const renderSuccess = await executeRender({
      draftSeed: current,
      request: {
        storyId: current.storyId,
        entryEventId: current.entryEventId,
        worldId: current.worldId,
        agentId: current.agentId,
        userId: current.userId,
        playerName: current.playerName,
        playerIdentity: current.playerIdentity,
        triggerSource: 'UserTurn',
        userMessage,
        binding: routeBinding,
        presence: presenceStateRef.current,
      },
    });
    if (!renderSuccess) {
      return;
    }
    const snapshot = exportStoryState(current.storyId);
    const record = buildPersistRecord({
      request: {
        storyId: current.storyId,
        worldId: current.worldId,
        agentId: current.agentId,
        userId: current.userId,
        playerName: current.playerName,
        playerIdentity: current.playerIdentity,
        triggerSource: 'UserTurn',
        userMessage,
      },
      result: renderSuccess,
    });
    const saved = await saveDraft({
      ...current,
      status: 'active',
      engineSnapshot: snapshot,
      records: [...current.records, record],
      routeOverride: routeBinding,
      updatedAt: nowIso(),
    });
    setActiveDraft(saved);
    setSelectedDraftKey(saved.key);
    setInputText('');
  }, [executeRender, inputText, routeBinding, saveDraft]);

  const onCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const onStop = useCallback(async () => {
    const current = activeDraftRef.current;
    if (!current) {
      return;
    }
    const draftForPublish: TextplayDraftRecord = {
      ...current,
      status: 'paused',
      engineSnapshot: exportStoryState(current.storyId),
      routeOverride: routeBinding,
      updatedAt: nowIso(),
    };

    try {
      await publishTextplayStoryDraft({
        hookClient,
        draft: draftForPublish,
      });
      pushNotice({
        kind: 'success',
        message: t('messages.stopPublished'),
      });
    } catch (error) {
      emitTextplayLog({
        level: 'warn',
        message: 'textplay:stop:publish-failed',
        flowId,
        source: 'useTextplayController.onStop',
        details: {
          storyId: current.storyId,
          agentId: current.agentId,
          worldId: current.worldId,
          error: toErrorMessage(error),
        },
      });
      pushNotice({
        kind: 'warning',
        message: t('messages.stopPublishDropped'),
      });
    } finally {
      await deleteTextplayDraft(current.key);
      resetStoryState(current.storyId);
      if (current.worldId === selectedWorldId) {
        await refreshDraftsForWorld(current.worldId);
      }
      setActiveDraft(null);
      setSelectedDraftKey(null);
      setInputText('');
    }
  }, [flowId, hookClient, pushNotice, refreshDraftsForWorld, routeBinding, selectedWorldId, t]);

  useEffect(() => {
    const draft = activeDraft;
    if (!draft || isRunning) {
      return;
    }
    const policy = draft.startupPackage.startupPolicy.initiative;
    if (!policy.enabled) {
      return;
    }

    let disposed = false;
    let tickInFlight = false;

    const tick = async () => {
      if (disposed || tickInFlight) {
        return;
      }
      const current = activeDraftRef.current;
      if (!current || current.key !== draft.key || isRunning) {
        return;
      }

      const nowMs = Date.now();
      const presenceState = presenceStateRef.current;
      const presenceElapsedMs = toNonNegativeMs(nowMs - presenceStateSinceRef.current);
      const pausedElapsedMs = toNonNegativeMs(nowMs - (pausedSinceRef.current ?? nowMs));
      const decision = selectTextplayInitiativeScheduleDecision({
        status: current.status,
        presenceState,
        presenceElapsedMs,
        pausedElapsedMs,
        tension: readDraftCurrentTension(current),
        policy,
      });

      if (!decision) {
        return;
      }

      tickInFlight = true;
      try {
        const systemPayload = buildInitiativeSystemPayload({
          startup: current.startupPackage,
          records: current.records,
          playerName: current.playerName,
          triggerSource: decision.triggerSource,
          presence: presenceState,
        });
        const renderSuccess = await executeRender({
          draftSeed: current,
          request: {
            storyId: current.storyId,
            entryEventId: current.entryEventId,
            worldId: current.worldId,
            agentId: current.agentId,
            userId: current.userId,
            playerName: current.playerName,
            playerIdentity: current.playerIdentity,
            triggerSource: decision.triggerSource,
            systemPayload,
            binding: current.routeOverride,
            presence: presenceState,
          },
        });
        if (!renderSuccess) {
          return;
        }

        const snapshot = exportStoryState(current.storyId);
        const record = buildPersistRecord({
          request: {
            storyId: current.storyId,
            worldId: current.worldId,
            agentId: current.agentId,
            userId: current.userId,
            playerName: current.playerName,
            playerIdentity: current.playerIdentity,
            triggerSource: decision.triggerSource,
            systemPayload,
          },
          result: renderSuccess,
        });
        const timestamp = nowIso();
        const saved = await saveDraft({
          ...current,
          status: current.status,
          engineSnapshot: snapshot,
          records: [...current.records, record],
          routeOverride: current.routeOverride,
          updatedAt: timestamp,
        });
        setActiveDraft(saved);
        setSelectedDraftKey(saved.key);
        dispatchPresenceEvent('onInitiativeReceived');
        presenceStateSinceRef.current = nowMs;
        if (saved.status === 'paused') {
          pausedSinceRef.current = nowMs;
        }
      } catch (error) {
        const currentMs = Date.now();
        if (currentMs - initiativeWarningAtRef.current >= 60_000) {
          initiativeWarningAtRef.current = currentMs;
          emitTextplayLog({
            level: 'warn',
            message: 'textplay:initiative:tick-failed',
            flowId,
            source: 'useTextplayController.initiativeScheduler',
            details: {
              storyId: current.storyId,
              reason: decision.reason,
              error: toErrorMessage(error),
            },
          });
        }
      } finally {
        tickInFlight = false;
      }
    };

    const intervalId = setInterval(() => {
      void tick();
    }, Math.max(1, policy.tickSeconds) * 1000);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [activeDraft, dispatchPresenceEvent, executeRender, flowId, isRunning, saveDraft]);

  const onRouteSourceChange = useCallback((source: 'local' | 'cloud') => {
    if (source === 'cloud') {
      const fallbackConnector = routeOptions?.connectors[0] || null;
      void applyRouteBinding({
        source: 'cloud',
        connectorId: fallbackConnector?.id || '',
        model: fallbackConnector?.models[0] || '',
      });
      return;
    }
    const fallbackLocal = routeOptions?.local.models[0] || null;
    void applyRouteBinding({
      source: 'local',
      connectorId: '',
      model: fallbackLocal?.model || '',
      localModelId: fallbackLocal?.localModelId,
      engine: fallbackLocal?.engine,
    });
  }, [applyRouteBinding, routeOptions]);

  const onRouteConnectorChange = useCallback((connectorId: string) => {
    const connector = routeOptions?.connectors.find((item) => item.id === connectorId) || null;
    void applyRouteBinding({
      source: 'cloud',
      connectorId,
      model: connector?.models[0] || '',
    });
  }, [applyRouteBinding, routeOptions]);

  const onRouteModelChange = useCallback((model: string) => {
    const normalizedModel = toText(model);
    if (!normalizedModel) {
      return;
    }
    if ((effectiveRouteBinding?.source || 'local') === 'cloud') {
      void applyRouteBinding({
        source: 'cloud',
        connectorId: effectiveRouteBinding?.connectorId || routeOptions?.connectors[0]?.id || '',
        model: normalizedModel,
      });
      return;
    }
    const localMatch = routeOptions?.local.models.find((item) => item.model === normalizedModel) || null;
    void applyRouteBinding({
      source: 'local',
      connectorId: '',
      model: normalizedModel,
      localModelId: localMatch?.localModelId,
      engine: localMatch?.engine,
    });
  }, [applyRouteBinding, effectiveRouteBinding, routeOptions]);

  const canStart = Boolean(
    userId
    && selectedWorldId
    && selectedEntry
    && playerName.trim()
    && !isRunning
    && (
      (selectedEntry.characterRefs.length === 1 && selectedAgentId)
      || (selectedEntry.characterRefs.length > 1 && selectedAgentId)
    ),
  );

  const canSend = Boolean(
    activeDraft
    && activeDraft.status === 'active'
    && inputText.trim()
    && !isRunning,
  );

  return {
    userId,
    worlds,
    worldsLoading,
    worldsError,
    selectedWorldId,
    setSelectedWorldId,
    entries,
    entriesLoading,
    entriesError,
    selectedEntryEventId,
    setSelectedEntryEventId,
    selectedEntry,
    agentOptions,
    agentOptionsLoading,
    selectedAgentId,
    setSelectedAgentId,
    playerName,
    setPlayerName,
    playerIdentity,
    setPlayerIdentity,
    drafts,
    draftsLoading,
    draftsError,
    selectedDraftKey,
    setSelectedDraftKey,
    activeDraft,
    inputText,
    setInputText,
    isRunning,
    onStart,
    onPause,
    onResumeActive,
    onResumeDraft,
    onRestartDraft,
    onStop,
    onSend,
    onCancel,
    canStart,
    canSend,
    routeOptions,
    routeLoading,
    routeError,
    routeBinding,
    effectiveRouteBinding,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onRouteClear: () => {
      void applyRouteBinding(null);
    },
    onRouteReload: () => {
      void reloadRouteOptions();
    },
    notice,
  };
}
