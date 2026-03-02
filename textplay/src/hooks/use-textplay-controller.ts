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
  getPlayableReplicaDetail,
  listPlayableReplicas,
  loadReplicaStartupPackage,
} from '../data/replica-catalog.js';
import { runTextplayRender } from '../pipeline/run-textplay-render.js';
import { createTextplayPresenceMachine } from '../presence/state-machine.js';
import type { TextplayShellProps } from '../components/textplay-shell.js';
import type {
  TextplayPersistRecord,
  TextplayPresenceReport,
  TextplayReplicaDetail,
  TextplayReplicaSummary,
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

function deriveReplicaPlaceholder(replica: TextplayReplicaDetail | null): string {
  if (!replica) {
    return 'Select a playable story first...';
  }
  return `在《${replica.title}》中输入下一步行动...`;
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

  const [replicas, setReplicas] = useState<TextplayReplicaSummary[]>([]);
  const [selectedReplicaId, setSelectedReplicaId] = useState<string | null>(null);
  const [selectedReplica, setSelectedReplica] = useState<TextplayReplicaDetail | null>(null);
  const [startupPackage, setStartupPackage] = useState<TextplayShellProps['startupPackage']>(null);
  const [startupLoading, setStartupLoading] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [replicaSnapshot, setReplicaSnapshot] = useState<TextplayShellProps['replicaSnapshot']>(null);

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
  const replicaHydrationSeqRef = useRef(0);

  const storyId = selectedReplica?.storyId || '';
  const worldId = selectedReplica?.worldId || worldIdRuntime;
  const agentId = agentIdRuntime || selectedReplica?.primaryAgentId || '';

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
    if (value.trim()) {
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

  const hydrateReplicaSelection = useCallback(async (replicaId: string, options?: {
    clearRunSurface?: boolean;
  }) => {
    const normalizedReplicaId = replicaId.trim();
    if (!normalizedReplicaId || !worldIdRuntime) {
      setSelectedReplica(null);
      setStartupPackage(null);
      setReplicaSnapshot(null);
      setStartupError(worldIdRuntime ? 'Replica id is missing.' : 'worldId is missing from runtime context.');
      if (options?.clearRunSurface !== false) {
        resetRunSurface();
      }
      return;
    }

    const seq = replicaHydrationSeqRef.current + 1;
    replicaHydrationSeqRef.current = seq;

    if (options?.clearRunSurface !== false) {
      resetRunSurface();
    }

    setStartupLoading(true);
    setStartupError(null);

    try {
      const detail = await getPlayableReplicaDetail({
        hookClient,
        worldId: worldIdRuntime,
        replicaId: normalizedReplicaId,
        runtimeAgentId: agentIdRuntime,
      });

      if (replicaHydrationSeqRef.current !== seq) {
        return;
      }

      if (!detail) {
        setSelectedReplica(null);
        setStartupPackage(null);
        setReplicaSnapshot(null);
        setStartupError('Replica detail not found. Refresh and try again.');
        return;
      }

      setSelectedReplica(detail);
      setReplicaSnapshot(null);

      if (typeof setRuntimeField === 'function') {
        setRuntimeField('storyId', detail.storyId);
        if (!agentIdRuntime && detail.primaryAgentId) {
          setRuntimeField('agentId', detail.primaryAgentId);
        }
      }

      const startup = await loadReplicaStartupPackage({
        hookClient,
        narrativeEngine,
        detail,
        playerId: playerId.trim(),
      });

      if (replicaHydrationSeqRef.current !== seq) {
        return;
      }

      setStartupPackage(startup);
      setReplicaSnapshot(startup.snapshot);
      setStartupError(null);

      const rows = await queryStoryRecords(detail.storyId);
      if (replicaHydrationSeqRef.current !== seq) {
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
      if (replicaHydrationSeqRef.current !== seq) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error || '');
      setStartupPackage(null);
      setReplicaSnapshot(null);
      setStartupError(message || 'Failed to load startup package.');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay startup load failed: ${message || 'unknown error'}`,
        });
      }
    } finally {
      if (replicaHydrationSeqRef.current === seq) {
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

  const loadReplicaList = useCallback(async () => {
    const worldId = worldIdRuntime.trim();
    if (!worldId) {
      setReplicas([]);
      setSelectedReplicaId(null);
      setSelectedReplica(null);
      setStartupPackage(null);
      setStartupError('worldId is required to load playable stories.');
      return;
    }

    try {
      const rows = await listPlayableReplicas({
        hookClient,
        worldId,
        runtimeAgentId: agentIdRuntime,
      });
      setReplicas(rows);
      setSelectedReplicaId((previous) => {
        if (previous && rows.some((row) => row.replicaId === previous)) {
          return previous;
        }
        return rows[0]?.replicaId || null;
      });
      if (rows.length === 0) {
        setSelectedReplica(null);
        setStartupPackage(null);
        setReplicaSnapshot(null);
        setStartupError('No playable PRIMARY world events yet.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      setReplicas([]);
      setSelectedReplicaId(null);
      setSelectedReplica(null);
      setStartupPackage(null);
      setReplicaSnapshot(null);
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
    presenceMachine.dispatch('onUserActive');
    syncPresenceView();
  }, [presenceMachine, syncPresenceView]);

  const onInputBlur = useCallback(() => {
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

  const onSelectReplica = useCallback((replicaId: string) => {
    if (isRunning) {
      return;
    }
    const normalized = replicaId.trim();
    if (!normalized) {
      return;
    }
    setSelectedReplicaId(normalized);
  }, [isRunning]);

  const onSend = useCallback(() => {
    void (async () => {
      if (isRunning) {
        return;
      }

      const activeReplica = selectedReplica;
      const normalizedPlayerId = playerId.trim();
      const normalizedMessage = inputText.trim();
      const normalizedWorldId = (activeReplica?.worldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeReplica?.primaryAgentId || '').trim();

      if (!activeReplica) {
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
            storyId: activeReplica.storyId,
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
    selectedReplica,
    setStatusBanner,
    startupPackage,
    syncPresenceView,
    worldIdRuntime,
  ]);

  const onRefresh = useCallback(() => {
    void refreshRouteAvailability();

    void (async () => {
      await loadReplicaList();
      if (selectedReplicaId) {
        await hydrateReplicaSelection(selectedReplicaId, {
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
    hydrateReplicaSelection,
    loadReplicaList,
    loadRunRecovery,
    refreshRouteAvailability,
    selectedRecordRunId,
    selectedReplicaId,
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
    void loadReplicaList();
  }, [loadReplicaList]);

  useEffect(() => {
    if (!selectedReplicaId) {
      setSelectedReplica(null);
      setStartupPackage(null);
      setReplicaSnapshot(null);
      setStartupError(replicas.length > 0 ? 'Select a playable story.' : startupError);
      return;
    }
    void hydrateReplicaSelection(selectedReplicaId, {
      clearRunSurface: true,
    });
  }, [hydrateReplicaSelection, replicas.length, selectedReplicaId]);

  useEffect(() => () => {
    presenceMachine.destroy();
    abortRef.current?.abort();
  }, [presenceMachine]);

  const canSend = !isRunning
    && !!selectedReplica
    && !!startupPackage
    && !startupLoading
    && !selectedReplica?.agentBindingMissing
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
    replicas,
    selectedReplicaId,
    selectedReplica,
    startupPackage,
    startupLoading,
    startupError,
    replicaSnapshot,
    presenceState,
    presenceReports,
    inputText,
    inputPlaceholder: deriveReplicaPlaceholder(selectedReplica),
    isRunning,
    canSend,
    canSelectReplica: !isRunning,
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
    onSelectReplica,
    onSelectRecord,
    onLoadRecoveryDelta,
  };
}
