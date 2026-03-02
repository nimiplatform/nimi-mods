import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { createNarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_REASON,
} from '../contracts.js';
import { assertTextplayChatRouteAvailable } from '../data/route-options.js';
import {
  getPlayableStoryDetail,
  listPlayableStories,
  loadStoryStartupPackage,
} from '../data/story-catalog.js';
import { runTextplayRender } from '../pipeline/run-textplay-render.js';
import { createTextplayPresenceMachine } from '../presence/state-machine.js';
import type { TextplayShellProps } from '../components/textplay-shell.js';
import type {
  TextplayPersistRecord,
  TextplayPresenceReport,
  TextplayStoryDetail,
  TextplayStorySummary,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayWarning,
} from '../types.js';
import { createUlid } from '../utils/ulid.js';

type AppStoreShape = {
  runtimeFields?: Record<string, unknown>;
  setRuntimeField?: (field: string, value: string) => void;
  setStatusBanner?: (input: {
    kind: 'info' | 'error' | 'success' | 'warn';
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => void;
  auth?: {
    user?: Record<string, unknown> | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseRunEvent(value: unknown): TextplayRunEvent | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const traceId = toTrimmedString(record.traceId);
  const runId = toTrimmedString(record.runId);
  const stage = toTrimmedString(record.stage);
  const step = toTrimmedString(record.step);
  const eventType = toTrimmedString(record.eventType);
  const seq = Number(record.seq);
  const attempt = Number(record.attempt);
  const timestamp = toTrimmedString(record.timestamp);

  if (!traceId || !runId || !stage || !step || !eventType || !Number.isFinite(seq) || !Number.isFinite(attempt) || !timestamp) {
    return null;
  }

  return {
    traceId,
    runId,
    parentRunId: typeof record.parentRunId === 'string' ? record.parentRunId : null,
    taskId: typeof record.taskId === 'string' ? record.taskId : undefined,
    stage: 'textplay',
    step,
    eventType: eventType as TextplayRunEvent['eventType'],
    seq: Math.floor(seq),
    attempt: Math.floor(attempt),
    timestamp,
    reasonCode: typeof record.reasonCode === 'string' ? record.reasonCode : undefined,
    actionHint: typeof record.actionHint === 'string' ? record.actionHint : undefined,
    retryClass: record.retryClass === 'retryable' || record.retryClass === 'non-retryable'
      ? record.retryClass
      : undefined,
    idempotencyKey: typeof record.idempotencyKey === 'string' ? record.idempotencyKey : undefined,
    checkpointToken: typeof record.checkpointToken === 'string' ? record.checkpointToken : undefined,
    stepInputHash: typeof record.stepInputHash === 'string' ? record.stepInputHash : undefined,
    lastCompletedUnit: typeof record.lastCompletedUnit === 'string' ? record.lastCompletedUnit : undefined,
  };
}

function parseRunEvents(value: unknown): TextplayRunEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseRunEvent)
    .filter((item): item is TextplayRunEvent => item !== null)
    .sort((left, right) => left.seq - right.seq);
}

function parseWarning(value: unknown): TextplayWarning | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const code = toTrimmedString(record.code);
  const stage = toTrimmedString(record.stage);
  const actionHint = toTrimmedString(record.actionHint);
  const message = toTrimmedString(record.message);
  const at = toTrimmedString(record.at);
  if (!code || !stage || !actionHint || !message || !at) {
    return null;
  }
  return {
    code,
    stage,
    actionHint,
    message,
    at,
  };
}

function parseWarnings(value: unknown): TextplayWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseWarning)
    .filter((item): item is TextplayWarning => item !== null);
}

function parsePresenceReport(value: unknown): TextplayPresenceReport | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = toTrimmedString(record.id);
  const at = toTrimmedString(record.at);
  const fromState = toTrimmedString(record.fromState);
  const toState = toTrimmedString(record.toState);
  const event = toTrimmedString(record.event);
  if (!id || !at || !fromState || !toState || !event) {
    return null;
  }
  return {
    id,
    at,
    fromState: fromState as TextplayPresenceReport['fromState'],
    toState: toState as TextplayPresenceReport['toState'],
    event,
  };
}

function parsePresenceReports(value: unknown): TextplayPresenceReport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parsePresenceReport)
    .filter((item): item is TextplayPresenceReport => item !== null);
}

function parseRunSnapshot(value: unknown): TextplayRunSnapshot | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = toTrimmedString(record.status);
  const lastSeq = Number(record.lastSeq);
  const lastCompletedStep = toTrimmedString(record.lastCompletedStep);
  const checkpointToken = toTrimmedString(record.checkpointToken);
  const stepInputHash = toTrimmedString(record.stepInputHash);
  const lastCompletedUnit = toTrimmedString(record.lastCompletedUnit);
  const gapRefillApplied = Boolean(record.gapRefillApplied);

  if (!status || !Number.isFinite(lastSeq) || !lastCompletedStep || !checkpointToken || !stepInputHash || !lastCompletedUnit) {
    return null;
  }

  return {
    status: status as TextplayRunSnapshot['status'],
    lastSeq: Math.floor(lastSeq),
    lastCompletedStep,
    checkpointToken,
    stepInputHash,
    lastCompletedUnit,
    gapRefillApplied,
    terminalEventType: typeof record.terminalEventType === 'string'
      ? (record.terminalEventType as TextplayRunSnapshot['terminalEventType'])
      : undefined,
  };
}

function parsePersistRecord(value: unknown): TextplayPersistRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const storyId = toTrimmedString(record.storyId);
  const turnId = toTrimmedString(record.turnId);
  const runId = toTrimmedString(record.runId);
  const traceId = toTrimmedString(record.traceId);
  const playerId = toTrimmedString(record.playerId);

  if (!storyId || !turnId || !runId || !traceId || !playerId) {
    return null;
  }

  const runSnapshot = parseRunSnapshot(record.runSnapshot);
  if (!runSnapshot) {
    return null;
  }

  return {
    id: toTrimmedString(record.id) || createUlid(),
    storyId,
    turnId,
    runId,
    traceId,
    triggerSource: (toTrimmedString(record.triggerSource) || 'UserTurn') as TextplayPersistRecord['triggerSource'],
    playerId,
    userMessage: typeof record.userMessage === 'string' ? record.userMessage : '',
    systemPayload: record.systemPayload && typeof record.systemPayload === 'object'
      ? (record.systemPayload as Record<string, unknown>)
      : null,
    text: typeof record.text === 'string' ? record.text : '',
    meta: record.meta && typeof record.meta === 'object'
      ? record.meta as TextplayPersistRecord['meta']
      : {
        storyId,
        turnId,
        runId,
        traceId,
        promptTraceId: '',
        route: {
          source: '',
          connectorId: '',
          model: '',
          provider: '',
          endpoint: '',
        },
        sourceEventIds: [],
        warnings: [],
        presenceReports: [],
        runSnapshot,
      },
    runEvents: parseRunEvents(record.runEvents),
    runSnapshot,
    warnings: parseWarnings(record.warnings),
    presenceReports: parsePresenceReports(record.presenceReports),
    createdAt: toTrimmedString(record.createdAt) || new Date().toISOString(),
    updatedAt: toTrimmedString(record.updatedAt) || new Date().toISOString(),
  };
}

function parsePersistRecordList(value: unknown): TextplayPersistRecord[] {
  const envelope = asRecord(value);
  if (!envelope) {
    return [];
  }
  const recordsRaw = Array.isArray(envelope.records) ? envelope.records : [];
  return recordsRaw
    .map(parsePersistRecord)
    .filter((item): item is TextplayPersistRecord => item !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergeRunEvents(existing: TextplayRunEvent[], incoming: TextplayRunEvent[]): TextplayRunEvent[] {
  if (incoming.length === 0) {
    return existing;
  }
  const merged = new Map<number, TextplayRunEvent>();
  for (const event of existing) {
    merged.set(event.seq, event);
  }
  for (const event of incoming) {
    merged.set(event.seq, event);
  }
  return [...merged.values()].sort((left, right) => left.seq - right.seq);
}

function upsertPersistRecord(records: TextplayPersistRecord[], next: TextplayPersistRecord): TextplayPersistRecord[] {
  const index = records.findIndex((item) => item.runId === next.runId);
  if (index === -1) {
    return [next, ...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const copied = [...records];
  copied[index] = next;
  return copied.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function deriveStoryPlaceholder(story: TextplayStoryDetail | null): string {
  if (!story) {
    return 'Select a playable story first...';
  }
  return `在《${story.title}》中输入下一步行动...`;
}

export function useTextplayController(): TextplayShellProps {
  const runtimeFields = useAppStore((state) => ((state as AppStoreShape).runtimeFields || {}));
  const setRuntimeField = useAppStore((state) => (state as AppStoreShape).setRuntimeField);
  const setStatusBanner = useAppStore((state) => (state as AppStoreShape).setStatusBanner);
  const authUser = useAppStore((state) => ((state as AppStoreShape).auth?.user || null));

  const hookClient = useMemo(() => createHookClient(TEXTPLAY_MOD_ID), []);
  const aiClient = useMemo(() => createAiClient(TEXTPLAY_MOD_ID), []);
  const narrativeEngine = useMemo(() => createNarrativeEngineModule({
    queryData: (capability, query) => hookClient.data.query({
      capability,
      query,
    }),
    generateText: async (payload) => {
      const result = await aiClient.generateText(payload);
      return {
        text: result.text,
      };
    },
  }), [aiClient, hookClient]);
  const presenceMachine = useMemo(() => createTextplayPresenceMachine({
    idleTimeoutSeconds: 60,
    awayTimeoutSeconds: 300,
  }), []);

  const worldIdRuntime = toTrimmedString(runtimeFields.worldId);
  const agentIdRuntime = toTrimmedString(runtimeFields.agentId);
  const playerIdSeed = toTrimmedString(runtimeFields.playerId)
    || toTrimmedString(authUser?.id)
    || toTrimmedString(authUser?.userId)
    || toTrimmedString(authUser?.handle);

  const [playerId, setPlayerIdState] = useState<string>(() => playerIdSeed);
  const [routeLabel, setRouteLabel] = useState<string>('unresolved');

  const [stories, setStories] = useState<TextplayStorySummary[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<TextplayStoryDetail | null>(null);
  const [startupPackage, setStartupPackage] = useState<TextplayShellProps['startupPackage']>(null);
  const [startupLoading, setStartupLoading] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [storySnapshot, setStorySnapshot] = useState<TextplayShellProps['storySnapshot']>(null);

  const [presenceState, setPresenceState] = useState(presenceMachine.getState());
  const [presenceReports, setPresenceReports] = useState<TextplayPresenceReport[]>([]);
  const [inputText, setInputTextState] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [records, setRecords] = useState<TextplayPersistRecord[]>([]);
  const [selectedRecordRunId, setSelectedRecordRunId] = useState<string | null>(null);
  const [lastRenderedText, setLastRenderedText] = useState('');
  const [runEvents, setRunEvents] = useState<TextplayRunEvent[]>([]);
  const [warnings, setWarnings] = useState<TextplayWarning[]>([]);
  const [runSnapshot, setRunSnapshot] = useState<TextplayRunSnapshot | null>(null);
  const [gapRefillApplied, setGapRefillApplied] = useState(false);
  const [failure, setFailure] = useState<TextplayShellProps['failure']>(null);

  const abortRef = useRef<AbortController | null>(null);
  const storyHydrationSeqRef = useRef(0);
  const lastUserActivityMsRef = useRef<number>(Date.now());
  const lastInitiativeAtMsRef = useRef<number>(0);
  const consecutiveInitiativeRef = useRef<number>(0);

  const storyId = selectedStory?.storyId || '';
  const worldId = selectedStory?.worldId || worldIdRuntime;
  const agentId = agentIdRuntime || selectedStory?.primaryAgentId || '';

  const syncPresenceView = useCallback(() => {
    setPresenceState(presenceMachine.getState());
    setPresenceReports(presenceMachine.getAllReports().slice(-20));
  }, [presenceMachine]);

  const resetRunSurface = useCallback(() => {
    setRecords([]);
    setSelectedRecordRunId(null);
    setLastRenderedText('');
    setRunEvents([]);
    setWarnings([]);
    setRunSnapshot(null);
    setGapRefillApplied(false);
    setFailure(null);
    setRunId(null);
  }, []);

  const applyRecordSurface = useCallback((record: TextplayPersistRecord | null) => {
    if (!record) {
      setLastRenderedText('');
      setWarnings([]);
      setRunSnapshot(null);
      setRunEvents([]);
      setGapRefillApplied(false);
      return;
    }
    setLastRenderedText(record.text);
    setWarnings(record.warnings);
    setRunSnapshot(record.runSnapshot);
    setRunEvents(record.runEvents);
    setGapRefillApplied(Boolean(record.runSnapshot.gapRefillApplied));
  }, []);

  const setPlayerId = useCallback((value: string) => {
    setPlayerIdState(value);
    if (typeof setRuntimeField === 'function') {
      setRuntimeField('playerId', value);
    }
  }, [setRuntimeField]);

  const setInputText = useCallback((value: string) => {
    setInputTextState(value);
    lastUserActivityMsRef.current = Date.now();
    if (value.trim()) {
      consecutiveInitiativeRef.current = 0;
      presenceMachine.dispatch('onUserComposing');
    } else {
      presenceMachine.dispatch('onUserPaused');
    }
    syncPresenceView();
  }, [presenceMachine, syncPresenceView]);

  const refreshRouteAvailability = useCallback(async () => {
    try {
      const route = await assertTextplayChatRouteAvailable({
        hookClient,
      });
      setRouteLabel(`${route.source}/${route.connectorId || 'default'}:${route.model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      setRouteLabel('unavailable');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay route unavailable: ${message}`,
        });
      }
    }
  }, [hookClient, setStatusBanner]);

  const queryStoryRecords = useCallback(async (targetStoryId: string): Promise<TextplayPersistRecord[]> => {
    const normalizedStoryId = targetStoryId.trim();
    if (!normalizedStoryId) {
      return [];
    }

    const payload = await hookClient.data.query({
      capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
      query: {
        op: 'listByStory',
        storyId: normalizedStoryId,
        limit: 30,
      },
    });

    return parsePersistRecordList(payload);
  }, [hookClient]);

  const loadRunRecovery = useCallback(async (input: {
    runId: string;
    afterSeq: number;
    append: boolean;
  }) => {
    if (!input.runId.trim()) {
      return;
    }

    const payload = await hookClient.data.query({
      capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
      query: {
        op: 'getRun',
        runId: input.runId,
        afterSeq: input.afterSeq,
        limit: 200,
      },
    });

    const envelope = asRecord(payload);
    if (!envelope) {
      return;
    }

    const events = parseRunEvents(envelope.events);
    const snapshot = parseRunSnapshot(envelope.runSnapshot);
    const record = parsePersistRecord(envelope.record);

    setGapRefillApplied(Boolean(envelope.gapRefillApplied));
    if (snapshot) {
      setRunSnapshot(snapshot);
    }
    if (events.length > 0) {
      setRunEvents((previous) => input.append ? mergeRunEvents(previous, events) : events);
    } else if (!input.append) {
      setRunEvents([]);
    }

    if (record) {
      setWarnings(record.warnings);
      setLastRenderedText(record.text);
      setRecords((previous) => upsertPersistRecord(previous, record));
    }
  }, [hookClient]);

  const hydrateStorySelection = useCallback(async (storyId: string, options?: {
    clearRunSurface?: boolean;
  }) => {
    const normalizedStoryId = storyId.trim();
    if (!normalizedStoryId || !worldIdRuntime) {
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError(worldIdRuntime ? 'Story id is missing.' : 'worldId is missing from runtime context.');
      if (options?.clearRunSurface !== false) {
        resetRunSurface();
      }
      return;
    }

    const seq = storyHydrationSeqRef.current + 1;
    storyHydrationSeqRef.current = seq;

    if (options?.clearRunSurface !== false) {
      resetRunSurface();
    }

    setStartupLoading(true);
    setStartupError(null);

    try {
      const detail = await getPlayableStoryDetail({
        hookClient,
        worldId: worldIdRuntime,
        storyId: normalizedStoryId,
        runtimeAgentId: agentIdRuntime,
      });

      if (storyHydrationSeqRef.current !== seq) {
        return;
      }

      if (!detail) {
        setSelectedStory(null);
        setStartupPackage(null);
        setStorySnapshot(null);
        setStartupError('Story detail not found. Refresh and try again.');
        return;
      }

      setSelectedStory(detail);
      setStorySnapshot(null);

      if (typeof setRuntimeField === 'function') {
        setRuntimeField('storyId', detail.storyId);
        if (!agentIdRuntime && detail.primaryAgentId) {
          setRuntimeField('agentId', detail.primaryAgentId);
        }
      }

      const startup = await loadStoryStartupPackage({
        hookClient,
        narrativeEngine,
        detail,
        playerId: playerId.trim(),
      });

      if (storyHydrationSeqRef.current !== seq) {
        return;
      }

      setStartupPackage(startup);
      setStorySnapshot(startup.snapshot);
      setStartupError(null);

      const rows = await queryStoryRecords(detail.storyId);
      if (storyHydrationSeqRef.current !== seq) {
        return;
      }

      setRecords(rows);
      const nextSelectedRunId = rows[0]?.runId || null;
      setSelectedRecordRunId(nextSelectedRunId);
      setFailure(null);

      if (nextSelectedRunId) {
        const selected = rows.find((row) => row.runId === nextSelectedRunId) || null;
        applyRecordSurface(selected);
        await loadRunRecovery({
          runId: nextSelectedRunId,
          afterSeq: 0,
          append: false,
        });
      } else {
        applyRecordSurface(null);
      }
    } catch (error) {
      if (storyHydrationSeqRef.current !== seq) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error || '');
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError(message || 'Failed to load startup package.');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay startup load failed: ${message || 'unknown error'}`,
        });
      }
    } finally {
      if (storyHydrationSeqRef.current === seq) {
        setStartupLoading(false);
      }
    }
  }, [
    agentIdRuntime,
    applyRecordSurface,
    hookClient,
    loadRunRecovery,
    narrativeEngine,
    playerId,
    queryStoryRecords,
    resetRunSurface,
    setRuntimeField,
    setStatusBanner,
    worldIdRuntime,
  ]);

  const loadStoryList = useCallback(async () => {
    const worldId = worldIdRuntime.trim();
    if (!worldId) {
      setStories([]);
      setSelectedStoryId(null);
      setSelectedStory(null);
      setStartupPackage(null);
      setStartupError('worldId is required to load playable stories.');
      return;
    }

    try {
      const rows = await listPlayableStories({
        hookClient,
        worldId,
        runtimeAgentId: agentIdRuntime,
      });
      setStories(rows);
      setSelectedStoryId((previous) => {
        if (previous && rows.some((row) => row.storyId === previous)) {
          return previous;
        }
        return rows[0]?.storyId || null;
      });
      if (rows.length === 0) {
        setSelectedStory(null);
        setStartupPackage(null);
        setStorySnapshot(null);
        setStartupError('No playable PRIMARY world events yet.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      setStories([]);
      setSelectedStoryId(null);
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError(message || 'Failed to load playable stories.');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay playable stories query failed: ${message || 'unknown error'}`,
        });
      }
    }
  }, [agentIdRuntime, hookClient, setStatusBanner, worldIdRuntime]);

  const onSelectRecord = useCallback((nextRunId: string) => {
    setSelectedRecordRunId(nextRunId);
    const selected = records.find((item) => item.runId === nextRunId) || null;
    applyRecordSurface(selected);
    setFailure(null);

    void loadRunRecovery({
      runId: nextRunId,
      afterSeq: 0,
      append: false,
    }).catch(() => {});
  }, [applyRecordSurface, loadRunRecovery, records]);

  const onLoadRecoveryDelta = useCallback(() => {
    if (!selectedRecordRunId) {
      return;
    }
    const afterSeq = runEvents.length > 0
      ? runEvents[runEvents.length - 1]!.seq
      : 0;
    void loadRunRecovery({
      runId: selectedRecordRunId,
      afterSeq,
      append: true,
    }).catch((error) => {
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay recovery query failed: ${error instanceof Error ? error.message : String(error || '')}`,
        });
      }
    });
  }, [loadRunRecovery, runEvents, selectedRecordRunId, setStatusBanner]);

  const onInputFocus = useCallback(() => {
    lastUserActivityMsRef.current = Date.now();
    consecutiveInitiativeRef.current = 0;
    presenceMachine.dispatch('onUserActive');
    syncPresenceView();
  }, [presenceMachine, syncPresenceView]);

  const onInputBlur = useCallback(() => {
    lastUserActivityMsRef.current = Date.now();
    presenceMachine.dispatch('onUserPaused');
    syncPresenceView();
  }, [presenceMachine, syncPresenceView]);

  const onInitiativeReceived = useCallback(() => {
    presenceMachine.dispatch('onInitiativeReceived');
    syncPresenceView();
  }, [presenceMachine, syncPresenceView]);

  const onCancel = useCallback(() => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) {
      return;
    }
    controller.abort();
  }, []);

  const onSelectStory = useCallback((storyId: string) => {
    if (isRunning) {
      return;
    }
    const normalized = storyId.trim();
    if (!normalized) {
      return;
    }
    setSelectedStoryId(normalized);
  }, [isRunning]);

  const onSend = useCallback(() => {
    void (async () => {
      if (isRunning) {
        return;
      }

      const activeStory = selectedStory;
      const normalizedPlayerId = playerId.trim();
      const normalizedMessage = inputText.trim();
      const normalizedWorldId = (activeStory?.worldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();

      if (!activeStory) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Select a playable story before sending.',
          });
        }
        return;
      }

      if (!startupPackage) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Startup package is required before sending.',
          });
        }
        return;
      }

      if (!normalizedAgentId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Primary agent binding is missing for this playable story.',
          });
        }
        return;
      }

      if (!normalizedPlayerId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'TextPlay requires playerId before sending.',
          });
        }
        return;
      }

      if (!normalizedWorldId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'TextPlay requires worldId from runtime context before sending.',
          });
        }
        return;
      }

      if (!normalizedMessage) {
        return;
      }

      lastUserActivityMsRef.current = Date.now();
      consecutiveInitiativeRef.current = 0;
      const nextRunId = createUlid();
      const traceId = createUlid();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setRunId(nextRunId);
      setFailure(null);
      setGapRefillApplied(false);
      setInputTextState('');

      const presenceMark = presenceMachine.mark();
      presenceMachine.dispatch('onUserActive');
      syncPresenceView();

      try {
        const result = await runTextplayRender({
          request: {
            storyId: activeStory.storyId,
            worldId: normalizedWorldId,
            agentId: normalizedAgentId,
            playerId: normalizedPlayerId,
            triggerSource: 'UserTurn',
            userMessage: normalizedMessage,
            runId: nextRunId,
            traceId,
          },
          deps: {
            hookClient,
            aiClient,
            narrativeEngine,
            abortSignal: controller.signal,
          },
          presenceReports: presenceMachine.collectSince(presenceMark),
        });

        if (result.ok) {
          const fallbackRecord: TextplayPersistRecord = {
            id: createUlid(),
            storyId: result.meta.storyId,
            turnId: result.meta.turnId,
            runId: result.meta.runId,
            traceId: result.meta.traceId,
            triggerSource: 'UserTurn',
            playerId: normalizedPlayerId,
            userMessage: normalizedMessage,
            systemPayload: null,
            text: result.text,
            meta: result.meta,
            runEvents: result.runEvents,
            runSnapshot: result.meta.runSnapshot,
            warnings: result.meta.warnings,
            presenceReports: result.meta.presenceReports,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setLastRenderedText(result.text);
          setRunEvents(result.runEvents);
          setWarnings(result.meta.warnings);
          setRunSnapshot(result.meta.runSnapshot);
          setGapRefillApplied(Boolean(result.meta.runSnapshot.gapRefillApplied));
          setRecords((previous) => upsertPersistRecord(previous, fallbackRecord));
          setSelectedRecordRunId(result.meta.runId);

          const rows = await queryStoryRecords(result.meta.storyId);
          setRecords(rows);
          const selected = rows.find((row) => row.runId === result.meta.runId) || fallbackRecord;
          applyRecordSurface(selected);

          await loadRunRecovery({
            runId: result.meta.runId,
            afterSeq: 0,
            append: false,
          });

          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: result.meta.warnings.some((warning) => warning.code === TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN)
                ? 'warn'
                : 'success',
              message: result.meta.warnings.length > 0
                ? 'TextPlay rendered with persistence warning.'
                : 'TextPlay rendered successfully.',
            });
          }

          return;
        }

        setFailure(result);
        setWarnings(result.warnings);
        setRunSnapshot(result.runSnapshot);
        setRunEvents(result.runEvents);
        setGapRefillApplied(Boolean(result.runSnapshot.gapRefillApplied));
        setLastRenderedText('');
        setInputTextState(normalizedMessage);

        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: result.reasonCode === TEXTPLAY_REASON.RUN_CANCELED ? 'warn' : 'error',
            message: `${result.reasonCode}: ${result.actionHint}`,
          });
        }
      } catch (error) {
        setInputTextState(normalizedMessage);
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'error',
            message: `TextPlay render failed: ${error instanceof Error ? error.message : String(error || '')}`,
          });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsRunning(false);
        syncPresenceView();
      }
    })();
  }, [
    agentIdRuntime,
    aiClient,
    applyRecordSurface,
    hookClient,
    inputText,
    isRunning,
    loadRunRecovery,
    narrativeEngine,
    playerId,
    presenceMachine,
    queryStoryRecords,
    selectedStory,
    setStatusBanner,
    startupPackage,
    syncPresenceView,
    worldIdRuntime,
  ]);

  const triggerInitiativeRender = useCallback((inactiveMs: number) => {
    void (async () => {
      if (isRunning) {
        return;
      }

      const activeStory = selectedStory;
      const normalizedPlayerId = playerId.trim();
      const normalizedWorldId = (activeStory?.worldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();

      if (!activeStory || !startupPackage || !normalizedPlayerId || !normalizedWorldId || !normalizedAgentId) {
        return;
      }

      const nextRunId = createUlid();
      const traceId = createUlid();
      const controller = new AbortController();
      abortRef.current = controller;

      const initiativePayload = {
        initiative: {
          source: 'textplay.auto-tick',
          inactiveMs,
        },
      };

      setIsRunning(true);
      setRunId(nextRunId);
      setFailure(null);
      setGapRefillApplied(false);

      const nowMs = Date.now();
      lastInitiativeAtMsRef.current = nowMs;
      consecutiveInitiativeRef.current += 1;

      const presenceMark = presenceMachine.mark();
      presenceMachine.dispatch('onInitiativeReceived');
      syncPresenceView();

      try {
        const result = await runTextplayRender({
          request: {
            storyId: activeStory.storyId,
            worldId: normalizedWorldId,
            agentId: normalizedAgentId,
            playerId: normalizedPlayerId,
            triggerSource: 'AgentInitiative',
            systemPayload: initiativePayload,
            runId: nextRunId,
            traceId,
          },
          deps: {
            hookClient,
            aiClient,
            narrativeEngine,
            abortSignal: controller.signal,
          },
          presenceReports: presenceMachine.collectSince(presenceMark),
        });

        if (result.ok) {
          const fallbackRecord: TextplayPersistRecord = {
            id: createUlid(),
            storyId: result.meta.storyId,
            turnId: result.meta.turnId,
            runId: result.meta.runId,
            traceId: result.meta.traceId,
            triggerSource: 'AgentInitiative',
            playerId: normalizedPlayerId,
            userMessage: '',
            systemPayload: initiativePayload,
            text: result.text,
            meta: result.meta,
            runEvents: result.runEvents,
            runSnapshot: result.meta.runSnapshot,
            warnings: result.meta.warnings,
            presenceReports: result.meta.presenceReports,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setLastRenderedText(result.text);
          setRunEvents(result.runEvents);
          setWarnings(result.meta.warnings);
          setRunSnapshot(result.meta.runSnapshot);
          setGapRefillApplied(Boolean(result.meta.runSnapshot.gapRefillApplied));
          setRecords((previous) => upsertPersistRecord(previous, fallbackRecord));
          setSelectedRecordRunId(result.meta.runId);

          const rows = await queryStoryRecords(result.meta.storyId);
          setRecords(rows);
          const selected = rows.find((row) => row.runId === result.meta.runId) || fallbackRecord;
          applyRecordSurface(selected);

          await loadRunRecovery({
            runId: result.meta.runId,
            afterSeq: 0,
            append: false,
          });

          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: result.meta.warnings.some((warning) => warning.code === TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN)
                ? 'warn'
                : 'info',
              message: result.meta.warnings.length > 0
                ? 'TextPlay initiative rendered with persistence warning.'
                : 'TextPlay initiative rendered.',
            });
          }

          return;
        }

        setFailure(result);
        setWarnings(result.warnings);
        setRunSnapshot(result.runSnapshot);
        setRunEvents(result.runEvents);
        setGapRefillApplied(Boolean(result.runSnapshot.gapRefillApplied));
        setLastRenderedText('');

        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: result.reasonCode === TEXTPLAY_REASON.RUN_CANCELED ? 'warn' : 'error',
            message: `${result.reasonCode}: ${result.actionHint}`,
          });
        }
      } catch (error) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'error',
            message: `TextPlay initiative failed: ${error instanceof Error ? error.message : String(error || '')}`,
          });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsRunning(false);
        syncPresenceView();
      }
    })();
  }, [
    agentIdRuntime,
    aiClient,
    applyRecordSurface,
    hookClient,
    isRunning,
    loadRunRecovery,
    narrativeEngine,
    playerId,
    presenceMachine,
    queryStoryRecords,
    selectedStory,
    setStatusBanner,
    startupPackage,
    syncPresenceView,
    worldIdRuntime,
  ]);

  const onRefresh = useCallback(() => {
    void refreshRouteAvailability();

    void (async () => {
      await loadStoryList();
      if (selectedStoryId) {
        await hydrateStorySelection(selectedStoryId, {
          clearRunSurface: false,
        });
      }
      if (selectedRecordRunId) {
        await loadRunRecovery({
          runId: selectedRecordRunId,
          afterSeq: 0,
          append: false,
        });
      }
    })().catch((error) => {
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay refresh failed: ${error instanceof Error ? error.message : String(error || '')}`,
        });
      }
    });
  }, [
    hydrateStorySelection,
    loadStoryList,
    loadRunRecovery,
    refreshRouteAvailability,
    selectedRecordRunId,
    selectedStoryId,
    setStatusBanner,
  ]);

  useEffect(() => {
    if (!playerId && playerIdSeed) {
      setPlayerIdState(playerIdSeed);
    }
  }, [playerId, playerIdSeed]);

  useEffect(() => {
    const timer = setInterval(() => {
      syncPresenceView();
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [syncPresenceView]);

  useEffect(() => {
    void refreshRouteAvailability();
  }, [refreshRouteAvailability]);

  useEffect(() => {
    void loadStoryList();
  }, [loadStoryList]);

  useEffect(() => {
    if (!selectedStoryId) {
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError(stories.length > 0 ? 'Select a playable story.' : startupError);
      return;
    }
    void hydrateStorySelection(selectedStoryId, {
      clearRunSurface: true,
    });
  }, [hydrateStorySelection, stories.length, selectedStoryId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const startup = startupPackage;
      if (!startup || isRunning || !selectedStory) {
        return;
      }
      const policy = startup.startupPolicy.initiative;
      if (!policy.enabled) {
        return;
      }
      if (policy.blockedPresenceStates.includes(presenceState)) {
        if (presenceState === 'active' || presenceState === 'composing') {
          consecutiveInitiativeRef.current = 0;
          lastUserActivityMsRef.current = Date.now();
        }
        return;
      }

      const nowMs = Date.now();
      const idleThresholdMs = presenceState === 'away'
        ? 300_000
        : presenceState === 'idle'
          ? 120_000
          : Number.POSITIVE_INFINITY;
      const inactiveMs = nowMs - lastUserActivityMsRef.current;
      if (!Number.isFinite(idleThresholdMs) || inactiveMs < idleThresholdMs) {
        return;
      }
      if (nowMs - lastInitiativeAtMsRef.current < policy.cooldownSeconds * 1000) {
        return;
      }
      if (consecutiveInitiativeRef.current >= policy.maxConsecutive) {
        return;
      }

      triggerInitiativeRender(inactiveMs);
    }, 10_000);

    return () => {
      clearInterval(timer);
    };
  }, [
    isRunning,
    presenceState,
    selectedStory,
    startupPackage,
    triggerInitiativeRender,
  ]);

  useEffect(() => () => {
    presenceMachine.destroy();
    abortRef.current?.abort();
  }, [presenceMachine]);

  const canSend = !isRunning
    && !!selectedStory
    && !!startupPackage
    && !startupLoading
    && !selectedStory?.agentBindingMissing
    && routeLabel !== 'unavailable'
    && startupPackage.snapshot.contextCoverage.canon
    && startupPackage.snapshot.contextCoverage.story
    && storyId.trim().length > 0
    && playerId.trim().length > 0
    && worldId.trim().length > 0
    && agentId.trim().length > 0
    && inputText.trim().length > 0;

  return {
    storyId,
    worldId,
    agentId,
    playerId,
    routeLabel,
    stories,
    selectedStoryId,
    selectedStory,
    startupPackage,
    startupLoading,
    startupError,
    storySnapshot,
    presenceState,
    presenceReports,
    inputText,
    inputPlaceholder: deriveStoryPlaceholder(selectedStory),
    isRunning,
    canSend,
    canSelectStory: !isRunning,
    runId,
    records,
    selectedRecordRunId,
    lastRenderedText,
    runEvents,
    warnings,
    runSnapshot,
    gapRefillApplied,
    failure,
    setPlayerId,
    setInputText,
    onInputFocus,
    onInputBlur,
    onSend,
    onCancel,
    onRefresh,
    onInitiativeReceived,
    onSelectStory,
    onSelectRecord,
    onLoadRecoveryDelta,
  };
}
