import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import type {
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { createNarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_REASON,
} from '../contracts.js';
import { queryTextplayChatRouteOptions } from '../data/route-options.js';
import {
  getPlayableStoryDetail,
  listPlayableStories,
  loadStoryStartupPackage,
} from '../data/story-catalog.js';
import { listMyWorlds } from '../data/world-catalog.js';
import { runTextplayRender } from '../pipeline/run-textplay-render.js';
import { createTextplayPresenceMachine } from '../presence/state-machine.js';
import type { TextplayShellProps } from '../components/textplay-shell.js';
import type { NarrativeTurnWindowResponse } from '../data/schemas.js';
import type {
  TextplayPersistRecord,
  TextplayPresenceReport,
  TextplayStoryBrief,
  TextplayStoryDetail,
  TextplayStorySummary,
  TextplayWorldSummary,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayRenderSuccess,
  TextplayWarning,
} from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { queryNarrativeTurnWindow } from '../data/narrative.js';
import {
  buildInitiativeDirectorMessage,
  buildContextualUserMessage,
  buildOpeningSystemPayload,
  buildStoryRecapPrompt,
  withPlayerContextSystemPayload,
} from './story-briefing.js';
import {
  createFallbackPersistRecord,
  hasPersistenceWarning,
} from './session-orchestrator.js';

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

type PlayerProfileDraft = {
  playerName: string;
  playerIdentity: string;
};

const GLOBAL_PLAYER_PROFILE_SCOPE = '__global__';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,}$/;

function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function parseWorldIdFromStoryId(storyId: string): string {
  const parts = storyId.split('.');
  if (parts.length >= 3 && parts[0] === 'story') {
    return parts[1] || '';
  }
  return '';
}

function toPlayerProfileScope(worldId: string): string {
  const normalized = worldId.trim();
  return normalized || GLOBAL_PLAYER_PROFILE_SCOPE;
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
  const worldId = toTrimmedString(record.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = toTrimmedString(record.agentId);
  const turnId = toTrimmedString(record.turnId);
  const runId = toTrimmedString(record.runId);
  const traceId = toTrimmedString(record.traceId);
  const playerId = toTrimmedString(record.playerId);
  const openingPayload = asRecord(asRecord(record.systemPayload)?.opening);
  const playerIdentity = firstNonEmptyText([
    record.playerIdentity,
    openingPayload?.playerIdentity,
    openingPayload?.playerRole,
  ]);

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
    worldId,
    agentId,
    turnId,
    runId,
    traceId,
    triggerSource: (toTrimmedString(record.triggerSource) || 'UserTurn') as TextplayPersistRecord['triggerSource'],
    playerId,
    playerIdentity: playerIdentity || undefined,
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

function deriveStoryPlaceholder(input: {
  story: TextplayStoryDetail | null;
  startupReady: boolean;
  started: boolean;
}): string {
  if (!input.story) {
    return 'Select a world and story first...';
  }
  if (!input.started) {
    return 'Fill Player Name, then click Start to load background and opening narration...';
  }
  if (!input.startupReady) {
    return 'Startup package is loading...';
  }
  return `在《${input.story.title}》中输入下一步行动...`;
}

function formatRouteLabel(binding: RuntimeRouteBinding | null): string {
  if (!binding || !binding.model.trim()) {
    return 'unresolved';
  }
  return `${binding.source}/${binding.connectorId || 'default'}:${binding.model}`;
}

function toRouteOverrideRecord(binding: RuntimeRouteBinding | null): Record<string, unknown> | undefined {
  if (!binding) {
    return undefined;
  }
  const model = binding.model.trim();
  if (!model) {
    return undefined;
  }
  return {
    source: binding.source,
    connectorId: binding.connectorId,
    model,
    ...(binding.localModelId ? { localModelId: binding.localModelId } : {}),
    ...(binding.engine ? { engine: binding.engine } : {}),
  };
}

function pickWorldSummaryById(worlds: TextplayWorldSummary[], worldId: string): TextplayWorldSummary | null {
  const normalizedWorldId = worldId.trim();
  if (!normalizedWorldId) {
    return null;
  }
  return worlds.find((world) => world.id === normalizedWorldId) || null;
}

function deriveRouteBindingBySource(input: {
  source: RuntimeRouteSource;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const previous = input.previous || input.options?.selected || null;
  if (input.source === 'local-runtime') {
    const firstLocal = input.options?.localRuntime.models[0] || null;
    return {
      source: 'local-runtime',
      connectorId: '',
      model: firstLocal?.model || previous?.model || '',
      localModelId: firstLocal?.localModelId || previous?.localModelId,
      engine: firstLocal?.engine || previous?.engine,
    };
  }
  const firstConnector = input.options?.connectors[0] || null;
  const firstModel = firstConnector?.models[0] || '';
  return {
    source: 'token-api',
    connectorId: firstConnector?.id || previous?.connectorId || '',
    model: firstModel || previous?.model || '',
  };
}

function deriveRouteBindingByConnector(input: {
  connectorId: string;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const connector = input.options?.connectors.find((item) => item.id === input.connectorId) || null;
  const previous = input.previous || input.options?.selected || null;
  return {
    source: 'token-api',
    connectorId: input.connectorId,
    model: connector?.models[0] || previous?.model || '',
  };
}

function deriveRouteBindingByModel(input: {
  model: string;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const previous = input.previous || input.options?.selected || null;
  return {
    source: previous?.source || 'local-runtime',
    connectorId: previous?.connectorId || '',
    model: input.model.trim(),
    ...(previous?.localModelId ? { localModelId: previous.localModelId } : {}),
    ...(previous?.engine ? { engine: previous.engine } : {}),
  };
}

function firstNonEmptyText(values: unknown[]): string {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) {
      return text;
    }
  }
  return '';
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
  const rawAgentIdRuntime = toTrimmedString(runtimeFields.agentId);
  const agentIdRuntime = isEntityId(rawAgentIdRuntime) ? rawAgentIdRuntime : '';
  const playerIdSeed = toTrimmedString(runtimeFields.playerId)
    || toTrimmedString(authUser?.id)
    || toTrimmedString(authUser?.userId)
    || toTrimmedString(authUser?.handle);
  const fallbackPlayerNameSeed = toTrimmedString(authUser?.displayName)
    || toTrimmedString(authUser?.name)
    || toTrimmedString(authUser?.handle);
  const legacyPlayerNameSeed = toTrimmedString(runtimeFields.playerName);
  const legacyPlayerIdentitySeed = toTrimmedString(runtimeFields.playerIdentity);

  const [playerId, setPlayerIdState] = useState<string>(() => playerIdSeed);
  const [playerProfilesByScope, setPlayerProfilesByScope] = useState<Record<string, PlayerProfileDraft>>(() => {
    const seededName = legacyPlayerNameSeed || fallbackPlayerNameSeed;
    const seededIdentity = legacyPlayerIdentitySeed;
    const seededProfiles: Record<string, PlayerProfileDraft> = {};
    if (seededName || seededIdentity) {
      seededProfiles[GLOBAL_PLAYER_PROFILE_SCOPE] = {
        playerName: seededName,
        playerIdentity: seededIdentity,
      };
    }
    return seededProfiles;
  });
  const [playerName, setPlayerNameState] = useState<string>(() => legacyPlayerNameSeed || fallbackPlayerNameSeed);
  const [playerIdentity, setPlayerIdentityState] = useState<string>(() => legacyPlayerIdentitySeed);
  const [worlds, setWorlds] = useState<TextplayWorldSummary[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [worldsError, setWorldsError] = useState<string | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);

  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeOverride, setRouteOverride] = useState<RuntimeRouteBinding | null>(null);
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
  const [deltaStatus, setDeltaStatus] = useState<{
    kind: 'info' | 'warn' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [failure, setFailure] = useState<TextplayShellProps['failure']>(null);
  const [storyBrief, setStoryBrief] = useState<TextplayStoryBrief | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const storyHydrationSeqRef = useRef(0);
  const lastUserActivityMsRef = useRef<number>(Date.now());
  const lastInitiativeAtMsRef = useRef<number>(0);
  const consecutiveInitiativeRef = useRef<number>(0);

  const storyId = selectedStory?.storyId || '';
  const worldId = selectedStory?.worldId || selectedWorldId || worldIdRuntime;
  const playerProfileScope = toPlayerProfileScope(worldId);
  const previousPlayerProfileScopeRef = useRef(playerProfileScope);
  const agentId = agentIdRuntime || selectedStory?.primaryAgentId || '';
  const effectiveRouteBinding = routeOverride || chatRouteOptions?.selected || null;
  const routeSource = effectiveRouteBinding?.source || 'local-runtime';
  const routeConnectorId = effectiveRouteBinding?.connectorId || '';
  const routeModel = effectiveRouteBinding?.model || '';
  const routeConnectors = chatRouteOptions?.connectors || [];
  const routeModelOptions = routeSource === 'token-api'
    ? (routeConnectors.find((item) => item.id === routeConnectorId)?.models || [])
    : (chatRouteOptions?.localRuntime.models || []).map((item) => item.model);

  const syncPresenceView = useCallback(() => {
    setPresenceState(presenceMachine.getState());
    setPresenceReports(presenceMachine.getAllReports().slice(-20));
  }, [presenceMachine]);

  const resetRunSurface = useCallback(() => {
    setRecords([]);
    setSelectedRecordRunId(null);
    setLastRenderedText('');
    setStoryBrief(null);
    setRunEvents([]);
    setWarnings([]);
    setRunSnapshot(null);
    setGapRefillApplied(false);
    setDeltaStatus(null);
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

  const setPlayerName = useCallback((value: string) => {
    setPlayerNameState(value);
  }, []);

  const setPlayerIdentity = useCallback((value: string) => {
    setPlayerIdentityState(value);
  }, []);

  const refreshRouteAvailability = useCallback(async () => {
    try {
      const options = await queryTextplayChatRouteOptions({
        hookClient,
      });
      setChatRouteOptions(options);
      const selectedBinding = routeOverride || options.selected;
      setRouteLabel(formatRouteLabel(selectedBinding));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      setChatRouteOptions(null);
      setRouteLabel('unavailable');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay route unavailable: ${message}`,
        });
      }
    }
  }, [hookClient, routeOverride, setStatusBanner]);

  const queryStoryRecords = useCallback(async (input: {
    storyId: string;
    worldId: string;
    agentId: string;
  }): Promise<TextplayPersistRecord[]> => {
    const normalizedStoryId = input.storyId.trim();
    const normalizedWorldId = input.worldId.trim();
    const normalizedAgentId = input.agentId.trim();
    const normalizedPlayerId = playerId.trim();
    if (!normalizedStoryId) {
      return [];
    }
    if (!normalizedPlayerId) {
      return [];
    }
    if (!normalizedWorldId || !normalizedAgentId) {
      return [];
    }

    const payload = await hookClient.data.query({
      capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
      query: {
        op: 'listByStory',
        storyId: normalizedStoryId,
        worldId: normalizedWorldId,
        agentId: normalizedAgentId,
        playerId: normalizedPlayerId,
        limit: 30,
      },
    });

    return parsePersistRecordList(payload);
  }, [hookClient, playerId]);

  const loadRunRecovery = useCallback(async (input: {
    runId: string;
    storyId: string;
    worldId: string;
    agentId: string;
    playerId: string;
    afterSeq: number;
    append: boolean;
  }): Promise<{
    runId: string;
    hasRecord: boolean;
    receivedEventCount: number;
    gapRefillApplied: boolean;
    nextAfterSeq: number;
  }> => {
    const targetRunId = input.runId.trim();
    if (!targetRunId) {
      return {
        runId: '',
        hasRecord: false,
        receivedEventCount: 0,
        gapRefillApplied: false,
        nextAfterSeq: input.afterSeq,
      };
    }

    const payload = await hookClient.data.query({
      capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
      query: {
        op: 'getRun',
        runId: targetRunId,
        storyId: input.storyId,
        worldId: input.worldId,
        agentId: input.agentId,
        playerId: input.playerId,
        afterSeq: input.afterSeq,
        limit: 200,
      },
    });

    const envelope = asRecord(payload);
    if (!envelope) {
      return {
        runId: targetRunId,
        hasRecord: false,
        receivedEventCount: 0,
        gapRefillApplied: false,
        nextAfterSeq: input.afterSeq,
      };
    }

    const events = parseRunEvents(envelope.events);
    const snapshot = parseRunSnapshot(envelope.runSnapshot);
    const record = parsePersistRecord(envelope.record);
    const gapRefillApplied = Boolean(envelope.gapRefillApplied);
    const nextAfterSeqRaw = Number(envelope.nextAfterSeq);
    const nextAfterSeq = Number.isFinite(nextAfterSeqRaw)
      ? Math.max(input.afterSeq, Math.floor(nextAfterSeqRaw))
      : (events.length > 0 ? events[events.length - 1]!.seq : input.afterSeq);

    setGapRefillApplied(gapRefillApplied);
    if (snapshot) {
      setRunSnapshot(snapshot);
    }
    if (events.length > 0) {
      setRunEvents((previous) => input.append ? mergeRunEvents(previous, events) : events);
    } else if (!input.append && record) {
      // Keep run surface aligned with selected persisted record without wiping local in-memory diagnostics.
      setRunEvents(record.runEvents);
    }

    if (record) {
      setWarnings(record.warnings);
      setLastRenderedText(record.text);
      setRecords((previous) => upsertPersistRecord(previous, record));
    }

    return {
      runId: targetRunId,
      hasRecord: Boolean(record),
      receivedEventCount: events.length,
      gapRefillApplied,
      nextAfterSeq,
    };
  }, [hookClient]);

  const applyRenderSuccessSurface = useCallback(async (input: {
    result: TextplayRenderSuccess;
    fallbackRecord: TextplayPersistRecord;
    worldId: string;
    agentId: string;
    playerId: string;
  }) => {
    setLastRenderedText(input.result.text);
    setRunEvents(input.result.runEvents);
    setWarnings(input.result.meta.warnings);
    setRunSnapshot(input.result.meta.runSnapshot);
    setGapRefillApplied(Boolean(input.result.meta.runSnapshot.gapRefillApplied));
    setRecords((previous) => upsertPersistRecord(previous, input.fallbackRecord));
    setSelectedRecordRunId(input.result.meta.runId);

    const rows = await queryStoryRecords({
      storyId: input.result.meta.storyId,
      worldId: input.worldId,
      agentId: input.agentId,
    });
    setRecords(rows);
    const selected = rows.find((row) => row.runId === input.result.meta.runId) || input.fallbackRecord;
    applyRecordSurface(selected);

    await loadRunRecovery({
      runId: input.result.meta.runId,
      storyId: input.result.meta.storyId,
      worldId: input.worldId,
      agentId: input.agentId,
      playerId: input.playerId,
      afterSeq: 0,
      append: false,
    });
  }, [applyRecordSurface, loadRunRecovery, queryStoryRecords]);

  const ensureStartupPackage = useCallback(async (input: {
    story: TextplayStoryDetail;
    normalizedPlayerId: string;
  }): Promise<NonNullable<TextplayShellProps['startupPackage']> | null> => {
    const targetStoryId = input.story.storyId.trim();
    if (!targetStoryId) {
      return null;
    }

    if (startupPackage && startupPackage.storyId === targetStoryId) {
      return startupPackage;
    }

    setStartupLoading(true);
    setStartupError(null);

    try {
      const startup = await loadStoryStartupPackage({
        hookClient,
        narrativeEngine,
        detail: input.story,
        playerId: input.normalizedPlayerId,
      });

      const resolvedAgentId = startup.cast.primaryAgentId.trim();
      const nextDetail: TextplayStoryDetail = {
        ...input.story,
        primaryAgentId: resolvedAgentId,
        participants: uniqueStrings([
          ...input.story.participants,
          ...startup.cast.participants,
        ]),
        agentBindingMissing: !resolvedAgentId,
      };

      setStartupPackage(startup);
      setStorySnapshot(startup.snapshot);
      setSelectedStory((previous) => {
        if (!previous || previous.storyId !== nextDetail.storyId) {
          return previous;
        }
        return nextDetail;
      });
      setStartupError(null);

      if (typeof setRuntimeField === 'function' && !agentIdRuntime && isEntityId(resolvedAgentId)) {
        setRuntimeField('agentId', resolvedAgentId);
      }

      return startup;
    } catch (error) {
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
      return null;
    } finally {
      setStartupLoading(false);
    }
  }, [
    agentIdRuntime,
    hookClient,
    loadStoryStartupPackage,
    narrativeEngine,
    setRuntimeField,
    setStatusBanner,
    startupPackage,
  ]);

  const hydrateStorySelection = useCallback(async (storyId: string, options?: {
    clearRunSurface?: boolean;
  }) => {
    const normalizedStoryId = storyId.trim();
    const activeWorldId = (selectedWorldId || worldIdRuntime).trim();
    const normalizedPlayerId = playerId.trim();
    if (!normalizedStoryId || !activeWorldId) {
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupLoading(false);
      setStartupError(activeWorldId ? 'Story id is missing.' : 'worldId is missing from runtime context.');
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

    setStartupLoading(false);
    setStartupError(null);

    try {
      const detail = await getPlayableStoryDetail({
        hookClient,
        worldId: activeWorldId,
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
        setStartupLoading(false);
        setStartupError('Story detail not found. Refresh and try again.');
        return;
      }

      setSelectedStory(detail);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupLoading(false);

      if (typeof setRuntimeField === 'function') {
        setRuntimeField('worldId', detail.worldId);
        setRuntimeField('storyId', detail.storyId);
        if (!agentIdRuntime && isEntityId(detail.primaryAgentId)) {
          setRuntimeField('agentId', detail.primaryAgentId);
        }
      }

      const detailAgentId = (detail.primaryAgentId || agentIdRuntime).trim();
      const rows = await queryStoryRecords({
        storyId: detail.storyId,
        worldId: detail.worldId,
        agentId: detailAgentId,
      });
      if (storyHydrationSeqRef.current !== seq) {
        return;
      }

      setRecords(rows);
      const nextSelectedRunId = rows[0]?.runId || null;
      setSelectedRecordRunId(nextSelectedRunId);
      setFailure(null);
      setStartupError(null);

      if (rows.length > 0 && normalizedPlayerId) {
        void ensureStartupPackage({
          story: detail,
          normalizedPlayerId,
        }).catch(() => {});
      }

      if (nextSelectedRunId) {
        const selected = rows.find((row) => row.runId === nextSelectedRunId) || null;
        applyRecordSurface(selected);
        await loadRunRecovery({
          runId: nextSelectedRunId,
          storyId: detail.storyId,
          worldId: detail.worldId,
          agentId: detailAgentId,
          playerId: normalizedPlayerId,
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
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupLoading(false);
      setStartupError(message || 'Failed to load story detail.');
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay story detail load failed: ${message || 'unknown error'}`,
        });
      }
    }
  }, [
    agentIdRuntime,
    applyRecordSurface,
    hookClient,
    loadRunRecovery,
    playerId,
    queryStoryRecords,
    resetRunSurface,
    setRuntimeField,
    setStatusBanner,
    ensureStartupPackage,
    selectedWorldId,
    worldIdRuntime,
  ]);

  const loadStoryList = useCallback(async () => {
    const worldId = (selectedWorldId || worldIdRuntime).trim();
    if (!worldId) {
      setStories([]);
      setSelectedStoryId(null);
      setSelectedStory(null);
      setStartupPackage(null);
      setStartupError('worldId is required to load playable stories.');
      setStorySnapshot(null);
      return;
    }

    try {
      if (typeof setRuntimeField === 'function') {
        setRuntimeField('worldId', worldId);
      }
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
      } else {
        setStartupError(null);
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
  }, [agentIdRuntime, hookClient, selectedWorldId, setRuntimeField, setStatusBanner, worldIdRuntime]);

  const loadWorldList = useCallback(async () => {
    setWorldsLoading(true);
    setWorldsError(null);
    try {
      const rows = await listMyWorlds({
        hookClient,
      });
      setWorlds(rows);

      if (rows.length === 0) {
        setSelectedWorldId(null);
        setStories([]);
        setSelectedStoryId(null);
        setSelectedStory(null);
        setStartupPackage(null);
        setStorySnapshot(null);
        setStartupError('No world available for this account.');
        resetRunSurface();
        return;
      }

      const previousWorldId = (selectedWorldId || '').trim();
      const runtimeWorldId = worldIdRuntime.trim();
      const nextWorldId = (
        (previousWorldId && pickWorldSummaryById(rows, previousWorldId)?.id)
        || (runtimeWorldId && pickWorldSummaryById(rows, runtimeWorldId)?.id)
        || rows[0]?.id
        || ''
      ).trim();

      if (!nextWorldId) {
        setSelectedWorldId(null);
        return;
      }

      if (nextWorldId !== previousWorldId) {
        setSelectedStoryId(null);
        setSelectedStory(null);
        setStartupPackage(null);
        setStorySnapshot(null);
        setStartupError(null);
        resetRunSurface();
      }

      setSelectedWorldId(nextWorldId);
      if (typeof setRuntimeField === 'function') {
        setRuntimeField('worldId', nextWorldId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      setWorlds([]);
      setWorldsError(message || 'Failed to load worlds.');
      setSelectedWorldId(null);
      setStories([]);
      setSelectedStoryId(null);
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError('World list is unavailable.');
      resetRunSurface();
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay world list query failed: ${message || 'unknown error'}`,
        });
      }
    } finally {
      setWorldsLoading(false);
    }
  }, [
    hookClient,
    resetRunSurface,
    selectedWorldId,
    setRuntimeField,
    setStatusBanner,
    worldIdRuntime,
  ]);

  const onSelectRecord = useCallback((nextRunId: string) => {
    setSelectedRecordRunId(nextRunId);
    setStoryBrief(null);
    const selected = records.find((item) => item.runId === nextRunId) || null;
    applyRecordSurface(selected);
    setFailure(null);

    const recoveryStoryId = (selected?.storyId || storyId).trim();
    const recoveryWorldId = (selected?.worldId || worldId).trim();
    const recoveryAgentId = (selected?.agentId || agentId).trim();
    const recoveryPlayerId = (selected?.playerId || playerId).trim();
    if (!recoveryStoryId || !recoveryWorldId || !recoveryAgentId || !recoveryPlayerId) {
      return;
    }

    void loadRunRecovery({
      runId: nextRunId,
      storyId: recoveryStoryId,
      worldId: recoveryWorldId,
      agentId: recoveryAgentId,
      playerId: recoveryPlayerId,
      afterSeq: 0,
      append: false,
    }).catch(() => {});
  }, [agentId, applyRecordSurface, loadRunRecovery, playerId, records, storyId, worldId]);

  const onLoadRecoveryDelta = useCallback(() => {
    const targetRunId = (selectedRecordRunId || runId || '').trim();
    if (!targetRunId) {
      setDeltaStatus({
        kind: 'warn',
        message: 'Select a run first, then click Load Delta.',
      });
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: 'Select a run first, then click Load Delta.',
        });
      }
      return;
    }
    const afterSeq = runEvents.length > 0
      ? runEvents[runEvents.length - 1]!.seq
      : 0;
    const selected = records.find((item) => item.runId === targetRunId) || null;
    const recoveryStoryId = (selected?.storyId || storyId).trim();
    const recoveryWorldId = (selected?.worldId || worldId).trim();
    const recoveryAgentId = (selected?.agentId || agentId).trim();
    const recoveryPlayerId = (selected?.playerId || playerId).trim();
    if (!recoveryStoryId || !recoveryWorldId || !recoveryAgentId || !recoveryPlayerId) {
      setDeltaStatus({
        kind: 'warn',
        message: 'Missing story/world/agent/player context; select story again then retry Load Delta.',
      });
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: 'Missing story/world/agent/player context; select story again then retry Load Delta.',
        });
      }
      return;
    }

    void loadRunRecovery({
      runId: targetRunId,
      storyId: recoveryStoryId,
      worldId: recoveryWorldId,
      agentId: recoveryAgentId,
      playerId: recoveryPlayerId,
      afterSeq,
      append: true,
    }).then((summary) => {
      if (typeof setStatusBanner !== 'function') {
        return;
      }
      if (!summary.hasRecord) {
        setDeltaStatus({
          kind: 'warn',
          message: `No persisted run found for ${targetRunId}.`,
        });
        setStatusBanner({
          kind: 'warn',
          message: `Load Delta found no persisted run for ${targetRunId}. This usually means persistence did not keep this run locally.`,
        });
        return;
      }
      if (summary.receivedEventCount <= 0) {
        setDeltaStatus({
          kind: 'info',
          message: `No new delta events for run ${targetRunId}.`,
        });
        setStatusBanner({
          kind: 'info',
          message: `No new delta events for run ${targetRunId}.`,
        });
        return;
      }
      setDeltaStatus({
        kind: 'success',
        message: `Loaded ${summary.receivedEventCount} delta event${summary.receivedEventCount === 1 ? '' : 's'}${summary.gapRefillApplied ? ' (gap refill applied)' : ''}.`,
      });
      setStatusBanner({
        kind: 'success',
        message: `Loaded ${summary.receivedEventCount} delta event${summary.receivedEventCount === 1 ? '' : 's'} for run ${targetRunId}${summary.gapRefillApplied ? ' (gap refill applied).' : '.'}`,
      });
    }).catch((error) => {
      setDeltaStatus({
        kind: 'error',
        message: `Recovery query failed: ${error instanceof Error ? error.message : String(error || '')}`,
      });
      if (typeof setStatusBanner === 'function') {
        setStatusBanner({
          kind: 'warn',
          message: `TextPlay recovery query failed: ${error instanceof Error ? error.message : String(error || '')}`,
        });
      }
    });
  }, [agentId, loadRunRecovery, playerId, records, runEvents, runId, selectedRecordRunId, setStatusBanner, storyId, worldId]);

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

  const onSelectWorld = useCallback((worldId: string) => {
    if (isRunning) {
      return;
    }
    const normalized = worldId.trim();
    if (!normalized || normalized === (selectedWorldId || '').trim()) {
      return;
    }

    setSelectedWorldId(normalized);
    setSelectedStoryId(null);
    setSelectedStory(null);
    setStories([]);
    setStartupPackage(null);
    setStorySnapshot(null);
    setStartupError(null);
    setWorldsError(null);
    resetRunSurface();

    if (typeof setRuntimeField === 'function') {
      setRuntimeField('worldId', normalized);
      setRuntimeField('storyId', '');
    }
  }, [isRunning, resetRunSurface, selectedWorldId, setRuntimeField]);

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

  const onRouteSourceChange = useCallback((source: RuntimeRouteSource) => {
    setRouteOverride((previous) => {
      const next = deriveRouteBindingBySource({
        source,
        previous,
        options: chatRouteOptions,
      });
      setRouteLabel(formatRouteLabel(next));
      return next;
    });
  }, [chatRouteOptions]);

  const onRouteConnectorChange = useCallback((connectorId: string) => {
    const normalizedConnectorId = connectorId.trim();
    if (!normalizedConnectorId) {
      return;
    }
    setRouteOverride((previous) => {
      const next = deriveRouteBindingByConnector({
        connectorId: normalizedConnectorId,
        previous,
        options: chatRouteOptions,
      });
      setRouteLabel(formatRouteLabel(next));
      return next;
    });
  }, [chatRouteOptions]);

  const onRouteModelChange = useCallback((model: string) => {
    setRouteOverride((previous) => {
      const next = deriveRouteBindingByModel({
        model,
        previous,
        options: chatRouteOptions,
      });
      setRouteLabel(formatRouteLabel(next));
      return next;
    });
  }, [chatRouteOptions]);

  const onClearRouteOverride = useCallback(() => {
    setRouteOverride(null);
    setRouteLabel(formatRouteLabel(chatRouteOptions?.selected || null));
  }, [chatRouteOptions]);

  const onSend = useCallback(() => {
    void (async () => {
      if (isRunning) {
        return;
      }

      const activeStory = selectedStory;
      const normalizedPlayerId = playerId.trim();
      const normalizedPlayerName = playerName.trim();
      const normalizedPlayerIdentity = playerIdentity.trim();
      const normalizedMessage = inputText.trim();
      const normalizedWorldId = (activeStory?.worldId || selectedWorldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();
      const started = records.length > 0;

      if (!activeStory) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Select a playable story before sending.',
          });
        }
        return;
      }

      if (!started) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Click Start to generate opening narration before sending.',
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

      if (!normalizedPlayerName) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Player Name is required before sending.',
          });
        }
        return;
      }

      const startup = await ensureStartupPackage({
        story: activeStory,
        normalizedPlayerId,
      });
      if (!startup) {
        return;
      }

      const contextualMessage = buildContextualUserMessage({
        playerName: normalizedPlayerName,
        playerIdentity: normalizedPlayerIdentity,
        userMessage: normalizedMessage,
      });

      const resolvedAgentId = (normalizedAgentId || startup.cast.primaryAgentId || '').trim();
      if (!resolvedAgentId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Primary agent binding is missing for this playable story.',
          });
        }
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
      setStoryBrief(null);
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
            agentId: resolvedAgentId,
            playerId: normalizedPlayerId,
            playerName: normalizedPlayerName,
            playerIdentity: normalizedPlayerIdentity || undefined,
            triggerSource: 'UserTurn',
            userMessage: contextualMessage || normalizedMessage,
            systemPayload: withPlayerContextSystemPayload({
              playerId: normalizedPlayerId,
              playerName: normalizedPlayerName,
              playerIdentity: normalizedPlayerIdentity,
            }),
            routeOverride: toRouteOverrideRecord(routeOverride),
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
          const fallbackRecord = createFallbackPersistRecord({
            result,
            worldId: normalizedWorldId,
            agentId: resolvedAgentId,
            triggerSource: 'UserTurn',
            playerId: normalizedPlayerId,
            playerIdentity: normalizedPlayerIdentity || undefined,
            userMessage: normalizedMessage,
            systemPayload: null,
          });
          await applyRenderSuccessSurface({
            result,
            fallbackRecord,
            worldId: normalizedWorldId,
            agentId: resolvedAgentId,
            playerId: normalizedPlayerId,
          });

          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: hasPersistenceWarning(result.meta.warnings)
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
    applyRenderSuccessSurface,
    ensureStartupPackage,
    hookClient,
    inputText,
    isRunning,
    narrativeEngine,
    playerId,
    playerIdentity,
    playerName,
    presenceMachine,
    records.length,
    routeOverride,
    selectedStory,
    selectedWorldId,
    setStatusBanner,
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
      const normalizedPlayerName = playerName.trim();
      const normalizedPlayerIdentity = playerIdentity.trim();
      const normalizedWorldId = (activeStory?.worldId || selectedWorldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();

      if (!activeStory || !startupPackage || !normalizedPlayerId || !normalizedWorldId || !normalizedAgentId) {
        return;
      }

      const nextRunId = createUlid();
      const traceId = createUlid();
      const controller = new AbortController();
      abortRef.current = controller;
      const initiativeDirector = buildInitiativeDirectorMessage({
        startup: startupPackage,
        records,
        playerName: normalizedPlayerName,
      });

      const initiativePayload = withPlayerContextSystemPayload({
        basePayload: {
          initiative: {
            source: 'textplay.auto-tick',
            inactiveMs,
            strategy: initiativeDirector.strategy,
            directive: initiativeDirector.directive,
          },
        },
        playerId: normalizedPlayerId,
        playerName: normalizedPlayerName,
        playerIdentity: normalizedPlayerIdentity,
      });

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
            playerName: normalizedPlayerName,
            playerIdentity: normalizedPlayerIdentity || undefined,
            triggerSource: 'AgentInitiative',
            userMessage: initiativeDirector.directive,
            systemPayload: initiativePayload,
            routeOverride: toRouteOverrideRecord(routeOverride),
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
          const fallbackRecord = createFallbackPersistRecord({
            result,
            worldId: normalizedWorldId,
            agentId: normalizedAgentId,
            triggerSource: 'AgentInitiative',
            playerId: normalizedPlayerId,
            playerIdentity: normalizedPlayerIdentity || undefined,
            userMessage: initiativeDirector.directive,
            systemPayload: initiativePayload || null,
          });
          await applyRenderSuccessSurface({
            result,
            fallbackRecord,
            worldId: normalizedWorldId,
            agentId: normalizedAgentId,
            playerId: normalizedPlayerId,
          });

          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: hasPersistenceWarning(result.meta.warnings)
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
    applyRenderSuccessSurface,
    hookClient,
    isRunning,
    narrativeEngine,
    playerId,
    playerIdentity,
    playerName,
    presenceMachine,
    routeOverride,
    records,
    selectedStory,
    selectedWorldId,
    setStatusBanner,
    syncPresenceView,
    startupPackage,
    worldIdRuntime,
  ]);

  const onStartStory = useCallback(() => {
    void (async () => {
      if (isRunning) {
        return;
      }

      const activeStory = selectedStory;
      let startup = startupPackage;
      const normalizedPlayerId = playerId.trim();
      const normalizedPlayerName = playerName.trim();
      const normalizedPlayerIdentity = playerIdentity.trim();
      const normalizedWorldId = (activeStory?.worldId || selectedWorldId || worldIdRuntime).trim();
      const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();
      const started = records.length > 0;

      if (!activeStory) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Select a playable story before start.',
          });
        }
        return;
      }
      if (!normalizedPlayerName) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Player Name is required before start.',
          });
        }
        return;
      }
      if (!normalizedPlayerId || !normalizedWorldId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Missing player/world binding for story start.',
          });
        }
        return;
      }

      startup = startup || await ensureStartupPackage({
        story: activeStory,
        normalizedPlayerId,
      });
      if (!startup) {
        return;
      }

      if (started) {
        const controller = new AbortController();
        abortRef.current = controller;
        setIsRunning(true);
        setFailure(null);
        setStoryBrief(null);
        try {
          let canonicalTurns: NarrativeTurnWindowResponse['turns'] = [];
          try {
            const turnWindow = await queryNarrativeTurnWindow({
              narrativeEngine,
              request: {
                storyId: activeStory.storyId,
                limit: 20,
              },
            });
            canonicalTurns = turnWindow.turns;
          } catch {
            canonicalTurns = [];
          }

          const recapPrompt = buildStoryRecapPrompt({
            story: activeStory,
            startup,
            playerName: normalizedPlayerName,
            playerIdentity: normalizedPlayerIdentity,
            records,
            canonicalTurns,
          });
          const recapResult = await aiClient.generateText({
            routeHint: 'chat/default',
            routeOverride: toRouteOverrideRecord(routeOverride),
            prompt: recapPrompt,
            mode: 'SCENE_TURN',
            worldId: normalizedWorldId,
            abortSignal: controller.signal,
          });
          const recapText = String(recapResult.text || '').trim();
          if (!recapText) {
            throw new Error('TEXTPLAY_RECAP_EMPTY_RESPONSE');
          }
          setStoryBrief({
            mode: 'recap',
            text: recapText,
            generatedAt: new Date().toISOString(),
          });
          setLastRenderedText(recapText);
          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: 'info',
              message: 'Story recap generated. You can continue playing now.',
            });
          }
        } catch (error) {
          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: 'warn',
              message: `TextPlay recap failed: ${error instanceof Error ? error.message : String(error || '')}`,
            });
          }
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
          setIsRunning(false);
          syncPresenceView();
        }
        return;
      }

      const resolvedAgentId = (normalizedAgentId || startup.cast.primaryAgentId || '').trim();
      if (!resolvedAgentId) {
        if (typeof setStatusBanner === 'function') {
          setStatusBanner({
            kind: 'warn',
            message: 'Primary agent binding is missing for this playable story.',
          });
        }
        return;
      }

      const nextRunId = createUlid();
      const traceId = createUlid();
      const controller = new AbortController();
      abortRef.current = controller;

      const openingPayload = buildOpeningSystemPayload({
        story: activeStory,
        startup,
        playerId: normalizedPlayerId,
        playerName: normalizedPlayerName,
        playerIdentity: normalizedPlayerIdentity,
      });
      const openingSystemPayload = withPlayerContextSystemPayload({
        basePayload: openingPayload,
        playerId: normalizedPlayerId,
        playerName: normalizedPlayerName,
        playerIdentity: normalizedPlayerIdentity,
      });

      setIsRunning(true);
      setRunId(nextRunId);
      setFailure(null);
      setStoryBrief(null);
      setGapRefillApplied(false);

      const presenceMark = presenceMachine.mark();
      presenceMachine.dispatch('onUserActive');
      syncPresenceView();

      try {
        const result = await runTextplayRender({
          request: {
            storyId: activeStory.storyId,
            worldId: normalizedWorldId,
            agentId: resolvedAgentId,
            playerId: normalizedPlayerId,
            playerName: normalizedPlayerName,
            playerIdentity: normalizedPlayerIdentity || undefined,
            triggerSource: 'SystemEvent',
            systemPayload: openingSystemPayload,
            routeOverride: toRouteOverrideRecord(routeOverride),
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
          const fallbackRecord = createFallbackPersistRecord({
            result,
            worldId: normalizedWorldId,
            agentId: resolvedAgentId,
            triggerSource: 'SystemEvent',
            playerId: normalizedPlayerId,
            playerIdentity: normalizedPlayerIdentity || undefined,
            userMessage: '',
            systemPayload: openingSystemPayload || null,
          });

          setStoryBrief({
            mode: 'opening',
            text: result.text,
            generatedAt: new Date().toISOString(),
          });
          await applyRenderSuccessSurface({
            result,
            fallbackRecord,
            worldId: normalizedWorldId,
            agentId: resolvedAgentId,
            playerId: normalizedPlayerId,
          });

          if (typeof setStatusBanner === 'function') {
            setStatusBanner({
              kind: hasPersistenceWarning(result.meta.warnings)
                ? 'warn'
                : 'success',
              message: result.meta.warnings.length > 0
                ? 'TextPlay started with persistence warning.'
                : 'TextPlay story started.',
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
            message: `TextPlay start failed: ${error instanceof Error ? error.message : String(error || '')}`,
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
    applyRenderSuccessSurface,
    ensureStartupPackage,
    hookClient,
    isRunning,
    narrativeEngine,
    playerId,
    playerIdentity,
    playerName,
    presenceMachine,
    queryNarrativeTurnWindow,
    records,
    routeOverride,
    selectedStory,
    selectedWorldId,
    setStatusBanner,
    startupPackage,
    syncPresenceView,
    worldIdRuntime,
  ]);

  const onRefresh = useCallback(() => {
    void refreshRouteAvailability();

    void (async () => {
      await loadWorldList();
      await loadStoryList();
      if (selectedStoryId) {
        await hydrateStorySelection(selectedStoryId, {
          clearRunSurface: false,
        });
      }
      if (selectedRecordRunId) {
        const selected = records.find((item) => item.runId === selectedRecordRunId) || null;
        const recoveryStoryId = (selected?.storyId || storyId).trim();
        const recoveryWorldId = (selected?.worldId || worldId).trim();
        const recoveryAgentId = (selected?.agentId || agentId).trim();
        const recoveryPlayerId = (selected?.playerId || playerId).trim();
        if (!recoveryStoryId || !recoveryWorldId || !recoveryAgentId || !recoveryPlayerId) {
          return;
        }
        await loadRunRecovery({
          runId: selectedRecordRunId,
          storyId: recoveryStoryId,
          worldId: recoveryWorldId,
          agentId: recoveryAgentId,
          playerId: recoveryPlayerId,
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
    records,
    storyId,
    worldId,
    agentId,
    playerId,
    loadWorldList,
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
    if (previousPlayerProfileScopeRef.current !== playerProfileScope) {
      return;
    }
    const normalizedPlayerName = playerName.trim();
    const normalizedPlayerIdentity = playerIdentity.trim();
    setPlayerProfilesByScope((previous) => {
      const existing = previous[playerProfileScope];
      if (existing
        && existing.playerName === normalizedPlayerName
        && existing.playerIdentity === normalizedPlayerIdentity) {
        return previous;
      }
      return {
        ...previous,
        [playerProfileScope]: {
          playerName: normalizedPlayerName,
          playerIdentity: normalizedPlayerIdentity,
        },
      };
    });
  }, [playerIdentity, playerName, playerProfileScope]);

  useEffect(() => {
    const previousScope = previousPlayerProfileScopeRef.current;
    if (previousScope === playerProfileScope) {
      return;
    }
    previousPlayerProfileScopeRef.current = playerProfileScope;
    const nextProfile = playerProfilesByScope[playerProfileScope];
    if (nextProfile) {
      setPlayerNameState(nextProfile.playerName);
      setPlayerIdentityState(nextProfile.playerIdentity);
      return;
    }
    const carryOver = previousScope === GLOBAL_PLAYER_PROFILE_SCOPE
      ? playerProfilesByScope[previousScope]
      : null;
    setPlayerNameState(carryOver?.playerName || fallbackPlayerNameSeed);
    setPlayerIdentityState(carryOver?.playerIdentity || '');
  }, [fallbackPlayerNameSeed, playerProfileScope, playerProfilesByScope]);

  useEffect(() => {
    if (typeof setRuntimeField === 'function' && playerId.trim()) {
      setRuntimeField('playerId', playerId.trim());
    }
  }, [playerId, setRuntimeField]);

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
    void loadWorldList();
  }, [loadWorldList]);

  useEffect(() => {
    if (!selectedWorldId) {
      setStories([]);
      setSelectedStoryId(null);
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      setStartupError(worldsLoading ? null : 'Select a world first.');
      return;
    }
    void loadStoryList();
  }, [loadStoryList, selectedWorldId, worldsLoading]);

  useEffect(() => {
    if (!selectedStoryId) {
      setSelectedStory(null);
      setStartupPackage(null);
      setStorySnapshot(null);
      if (selectedWorldId) {
        setStartupError(stories.length > 0 ? 'Select a playable story.' : 'No playable PRIMARY world events yet.');
      }
      return;
    }
    void hydrateStorySelection(selectedStoryId, {
      clearRunSurface: true,
    });
  }, [hydrateStorySelection, selectedStoryId, selectedWorldId, stories.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const startup = startupPackage;
      if (!startup || isRunning || !selectedStory || records.length === 0) {
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
    records.length,
    selectedStory,
    startupPackage,
    triggerInitiativeRender,
  ]);

  useEffect(() => () => {
    presenceMachine.destroy();
    abortRef.current?.abort();
  }, [presenceMachine]);

  const storyStarted = records.length > 0;
  const hasRouteConfig = routeLabel !== 'unavailable' && routeModel.trim().length > 0;
  const hasStoryRuntimeBinding = storyId.trim().length > 0
    && playerId.trim().length > 0
    && worldId.trim().length > 0;
  const hasPlayerName = playerName.trim().length > 0;

  const canStartStory = !isRunning
    && !!selectedStory
    && !startupLoading
    && hasRouteConfig
    && hasStoryRuntimeBinding
    && hasPlayerName;

  const canSend = !isRunning
    && !!selectedStory
    && storyStarted
    && hasRouteConfig
    && hasStoryRuntimeBinding
    && hasPlayerName
    && inputText.trim().length > 0;

  return {
    storyId,
    worldId,
    agentId,
    playerId,
    playerName,
    playerIdentity,
    storyBrief,
    routeLabel,
    worlds,
    selectedWorldId,
    worldsLoading,
    worldsError,
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
    inputPlaceholder: deriveStoryPlaceholder({
      story: selectedStory,
      startupReady: Boolean(startupPackage) && !startupLoading,
      started: storyStarted,
    }),
    storyStarted,
    isRunning,
    canStartStory,
    canSend,
    canSelectStory: !isRunning,
    routeSource,
    routeConnectorId,
    routeModel,
    routeConnectors,
    routeModelOptions,
    routeOverrideActive: Boolean(routeOverride),
    runId,
    records,
    selectedRecordRunId,
    lastRenderedText,
    runEvents,
    warnings,
    runSnapshot,
    gapRefillApplied,
    deltaStatus,
    failure,
    setPlayerName,
    setPlayerIdentity,
    setInputText,
    onInputFocus,
    onInputBlur,
    onStartStory,
    onSend,
    onCancel,
    onRefresh,
    onInitiativeReceived,
    onSelectWorld,
    onSelectStory,
    onSelectRecord,
    onLoadRecoveryDelta,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteOverride,
  };
}
