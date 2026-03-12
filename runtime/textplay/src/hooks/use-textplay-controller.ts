import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onRouteLifecycleChange } from '@nimiplatform/sdk/mod/lifecycle';
import { useShellAuth, useShellRuntimeFields, useShellStatusBanner, } from '@nimiplatform/sdk/mod/shell';
import { createNarrativeEngineModule } from '../../../../modules/narrative-engine/src/index.js';
import { TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST, TEXTPLAY_DATA_API_RENDER_PERSIST, TEXTPLAY_MOD_ID, TEXTPLAY_TAB_ID, TEXTPLAY_REASON, } from '../contracts.js';
import { queryTextplayChatRouteOptions } from '../data/route-options.js';
import { getPlayableStoryDetail, listPlayableStories, loadStoryStartupPackage, } from '../data/story-catalog.js';
import { listMyHistorySessions } from '../data/history-sessions.js';
import { listMyWorlds } from '../data/world-catalog.js';
import { runTextplayRender } from '../pipeline/run-textplay-render.js';
import { createTextplayPresenceMachine } from '../presence/state-machine.js';
import type { TextplayShellProps } from '../components/textplay-shell.js';
import { TextplayWorldNarrativeContextListResponseSchema, type NarrativeTurnWindowResponse, } from '../data/schemas.js';
import type { TextplayHistorySession, TextplayPersistRecord, TextplayPresenceReport, TextplayStoryBrief, TextplayStoryDetail, TextplayStorySummary, TextplayWorldSummary, TextplayRunEvent, TextplayRunSnapshot, TextplayRenderSuccess, TextplayWarning, } from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { createTextplayFlowId, emitTextplayLog } from '../logging.js';
import { queryNarrativeTurnWindow } from '../data/narrative.js';
import { buildInitiativeDirectorMessage, buildContextualUserMessage, buildOpeningSystemPayload, buildStoryRecapPrompt, withPlayerContextSystemPayload, } from './story-briefing.js';
import { createFallbackPersistRecord, hasPersistenceWarning, } from './session-orchestrator.js';
import { createTextplayRuntimeAiClient } from '../runtime-ai-client.js';
import { loadTextplayRouteBinding, persistTextplayRouteBinding, } from '../route-override-store.js';
import { createHookClient, createModRuntimeClient, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
import {
    asRecord,
    isEntityId,
    parsePersistRecord,
    parsePersistRecordList,
    parseRunEvents,
    parseRunSnapshot,
    toPlayerProfileScope,
    toTrimmedString,
    uniqueStrings,
} from './textplay-parsers.js';
import {
    collectWorldAgentCandidatesByStory,
    deriveRouteBindingByConnector,
    deriveRouteBindingByModel,
    deriveRouteBindingBySource,
    deriveStoryPlaceholder,
    formatRouteLabel,
    isRouteBindingUsable,
    mergeAgentCandidateIds,
    mergeRunEvents,
    pickAgentFallbackCandidates,
    pickWorldSummaryById,
    resolveEffectiveRouteBinding,
    sortHistorySessions,
    toHistorySession,
    toRouteBindingRecord,
    upsertHistorySessionByStory,
    upsertPersistRecord,
    WORLD_AGENT_CANDIDATE_KEY,
} from './textplay-helpers.js';
type PlayerProfileDraft = {
    playerName: string;
    playerIdentity: string;
};
const GLOBAL_PLAYER_PROFILE_SCOPE = '__global__';
const SEND_RUNTIME_ERROR_REASON = 'TEXTPLAY_RENDER_RUNTIME_ERROR';
const MAX_AGENT_FALLBACK_CANDIDATES = 2;
export function useTextplayController(): TextplayShellProps {
    const { runtimeFields, setRuntimeField } = useShellRuntimeFields();
    const { showStatusBanner: setStatusBanner } = useShellStatusBanner();
    const { user: authUser } = useShellAuth();
    const hookClient = useMemo(() => createHookClient(TEXTPLAY_MOD_ID), []);
    const runtimeClient = useMemo(() => createModRuntimeClient(TEXTPLAY_MOD_ID), []);
    const aiClient = useMemo(() => createTextplayRuntimeAiClient(runtimeClient), [runtimeClient]);
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
    const [historySessions, setHistorySessions] = useState<TextplayHistorySession[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
    const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [binding, setRouteBinding] = useState<RuntimeRouteBinding | null>(() => loadTextplayRouteBinding());
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
        kind: 'info' | 'warning' | 'success' | 'error';
        message: string;
    } | null>(null);
    const [failure, setFailure] = useState<TextplayShellProps['failure']>(null);
    const [pendingUserTurn, setPendingUserTurn] = useState<TextplayShellProps['pendingUserTurn']>(null);
    const [storyBrief, setStoryBrief] = useState<TextplayStoryBrief | null>(null);
    const [sessionPaused, setSessionPaused] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const storyHydrationSeqRef = useRef(0);
    const historyHydrationSeqRef = useRef(0);
    const historyRefreshInFlightRef = useRef(false);
    const selectedRecordRunIdRef = useRef<string | null>(null);
    const startupPackageRef = useRef<TextplayShellProps['startupPackage']>(null);
    const lastUserActivityMsRef = useRef<number>(Date.now());
    const lastInitiativeAtMsRef = useRef<number>(0);
    const consecutiveInitiativeRef = useRef<number>(0);
    const storyId = selectedStory?.storyId || '';
    const worldId = selectedStory?.worldId || selectedWorldId || worldIdRuntime;
    const playerProfileScope = toPlayerProfileScope(worldId);
    const previousPlayerProfileScopeRef = useRef(playerProfileScope);
    const agentId = agentIdRuntime || selectedStory?.primaryAgentId || '';
    const effectiveRouteBinding = resolveEffectiveRouteBinding({
        binding,
        selected: chatRouteOptions?.selected || null,
    });
    const routeSource = effectiveRouteBinding?.source || 'local';
    const routeConnectorId = effectiveRouteBinding?.connectorId || '';
    const routeModel = effectiveRouteBinding?.model || '';
    const routeConnectors = chatRouteOptions?.connectors || [];
    const routeModelOptions = routeSource === 'cloud'
        ? (routeConnectors.find((item) => item.id === routeConnectorId)?.models || [])
        : (chatRouteOptions?.local?.models || []).map((item) => item.model);
    const ensureExplicitRouteBindingUsable = useCallback((actionLabel: string) => {
        if (!binding || isRouteBindingUsable(binding)) {
            return true;
        }
        if (typeof setStatusBanner === 'function') {
            setStatusBanner({
                kind: 'warning',
                message: `${actionLabel} requires a complete route binding. Pick a valid source, connector, and model first.`,
            });
        }
        return false;
    }, [binding, setStatusBanner]);
    const syncPresenceView = useCallback(() => {
        setPresenceState(presenceMachine.getState());
        setPresenceReports(presenceMachine.getAllReports().slice(-20));
    }, [presenceMachine]);
    useEffect(() => {
        selectedRecordRunIdRef.current = selectedRecordRunId;
    }, [selectedRecordRunId]);
    useEffect(() => {
        startupPackageRef.current = startupPackage;
    }, [startupPackage]);
    useEffect(() => {
        persistTextplayRouteBinding(binding);
    }, [binding]);
    const resetRunSurface = useCallback(() => {
        setRecords([]);
        setSelectedRecordRunId(null);
        setLastRenderedText('');
        setStoryBrief(null);
        setSessionPaused(false);
        setPendingUserTurn(null);
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
        }
        else {
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
                runtimeClient: runtimeClient.route,
            });
            setChatRouteOptions(options);
            const selectedBinding = binding || options.selected;
            setRouteLabel(formatRouteLabel(selectedBinding));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            setChatRouteOptions(null);
            setRouteLabel('unavailable');
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
                    message: `TextPlay route unavailable: ${message}`,
                });
            }
        }
    }, [binding, runtimeClient.route, setStatusBanner]);
    const queryStoryRecords = useCallback(async (input: {
        storyId: string;
        worldId: string;
        agentId?: string;
        playerId?: string;
    }): Promise<TextplayPersistRecord[]> => {
        const normalizedStoryId = input.storyId.trim();
        const normalizedWorldId = input.worldId.trim();
        const normalizedAgentId = String(input.agentId || '').trim();
        const normalizedPlayerId = input.playerId == null
            ? playerId.trim()
            : String(input.playerId || '').trim();
        if (!normalizedStoryId) {
            return [];
        }
        if (!normalizedWorldId) {
            return [];
        }
        const query: Record<string, unknown> = {
            op: 'listByStory',
            storyId: normalizedStoryId,
            worldId: normalizedWorldId,
            limit: 30,
        };
        if (normalizedPlayerId) {
            query.playerId = normalizedPlayerId;
        }
        if (normalizedAgentId) {
            query.agentId = normalizedAgentId;
        }
        const payload = await hookClient.data.query({
            capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
            query,
        });
        return parsePersistRecordList(payload);
    }, [hookClient, playerId]);
    const queryWorldAgentCandidatesByStory = useCallback(async (worldId: string): Promise<Record<string, string[]>> => {
        const normalizedWorldId = worldId.trim();
        if (!normalizedWorldId) {
            return {};
        }
        try {
            const payload = await hookClient.data.query({
                capability: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
                query: { worldId: normalizedWorldId },
            });
            const parsed = TextplayWorldNarrativeContextListResponseSchema.safeParse(payload);
            if (!parsed.success) {
                return {};
            }
            const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
            return collectWorldAgentCandidatesByStory(rows);
        }
        catch {
            return {};
        }
    }, [hookClient]);
    const queryStoryRecordsWithAgentFallback = useCallback(async (input: {
        storyId: string;
        worldId: string;
        preferredAgentId?: string;
        candidateAgentIds?: string[];
        maxAgentCandidates?: number;
    }): Promise<TextplayPersistRecord[]> => {
        const candidates = pickAgentFallbackCandidates({
            preferredAgentId: input.preferredAgentId,
            candidateAgentIds: input.candidateAgentIds,
            max: input.maxAgentCandidates ?? MAX_AGENT_FALLBACK_CANDIDATES,
        });
        for (const agentId of candidates) {
            const rows = await queryStoryRecords({
                storyId: input.storyId,
                worldId: input.worldId,
                agentId,
            });
            if (rows.length > 0) {
                return rows;
            }
        }
        const scopedRows = await queryStoryRecords({
            storyId: input.storyId,
            worldId: input.worldId,
        });
        if (scopedRows.length > 0) {
            return scopedRows;
        }
        if (!playerId.trim()) {
            return [];
        }
        const fallbackAgentId = candidates[0];
        if (fallbackAgentId) {
            const rows = await queryStoryRecords({
                storyId: input.storyId,
                worldId: input.worldId,
                agentId: fallbackAgentId,
                playerId: '',
            });
            if (rows.length > 0) {
                return rows;
            }
        }
        return queryStoryRecords({
            storyId: input.storyId,
            worldId: input.worldId,
            playerId: '',
        });
    }, [playerId, queryStoryRecords]);
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
        }
        else if (!input.append && record) {
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
        storyTitle: string;
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
        const nextHistory = toHistorySession({
            record: selected,
            storyTitle: input.storyTitle,
        });
        setHistorySessions((previous) => upsertHistorySessionByStory(previous, nextHistory));
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
        const cachedStartup = startupPackageRef.current;
        if (cachedStartup && cachedStartup.storyId === targetStoryId) {
            return cachedStartup;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            setStartupPackage(null);
            setStorySnapshot(null);
            setStartupError(message || 'Failed to load startup package.');
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
                    message: `TextPlay startup load failed: ${message || 'unknown error'}`,
                });
            }
            return null;
        }
        finally {
            setStartupLoading(false);
        }
    }, [
        agentIdRuntime,
        hookClient,
        loadStoryStartupPackage,
        narrativeEngine,
        setRuntimeField,
        setStatusBanner,
    ]);
    const hydrateStorySelection = useCallback(async (storyId: string, options?: {
        clearRunSurface?: boolean;
        preferredRunId?: string;
        forceWorldId?: string;
    }) => {
        const normalizedStoryId = storyId.trim();
        const activeWorldId = (options?.forceWorldId || selectedWorldId || worldIdRuntime).trim();
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
            const contextCandidatesByStory = await queryWorldAgentCandidatesByStory(detail.worldId);
            const candidateAgentIds = mergeAgentCandidateIds([
                ...detail.participants,
                ...detail.characterRefs,
                ...(contextCandidatesByStory[detail.storyId] || []),
                ...(contextCandidatesByStory[WORLD_AGENT_CANDIDATE_KEY] || []),
            ]);
            const rows = await queryStoryRecordsWithAgentFallback({
                storyId: detail.storyId,
                worldId: detail.worldId,
                preferredAgentId: detailAgentId,
                candidateAgentIds,
            });
            if (storyHydrationSeqRef.current !== seq) {
                return;
            }
            const recoveredAgentId = (detailAgentId
                || String(rows[0]?.agentId || '').trim());
            if (!detailAgentId && isEntityId(recoveredAgentId)) {
                setSelectedStory((previous) => {
                    if (!previous || previous.storyId !== detail.storyId) {
                        return previous;
                    }
                    return {
                        ...previous,
                        primaryAgentId: recoveredAgentId,
                        agentBindingMissing: false,
                    };
                });
                if (typeof setRuntimeField === 'function' && !agentIdRuntime) {
                    setRuntimeField('agentId', recoveredAgentId);
                }
            }
            setRecords(rows);
            const preferredRunId = String(options?.preferredRunId || selectedRecordRunIdRef.current || '').trim();
            const nextSelectedRunId = (preferredRunId && rows.some((row) => row.runId === preferredRunId)
                ? preferredRunId
                : rows[0]?.runId || null);
            setSelectedRecordRunId(nextSelectedRunId);
            setFailure(null);
            setStartupError(null);
            if (rows.length > 0 && normalizedPlayerId) {
                void ensureStartupPackage({
                    story: detail,
                    normalizedPlayerId,
                }).catch(() => { });
            }
            if (nextSelectedRunId) {
                const selected = rows.find((row) => row.runId === nextSelectedRunId) || null;
                applyRecordSurface(selected);
                const recoveryAgentId = (String(selected?.agentId || '').trim() || detailAgentId || recoveredAgentId || '').trim();
                await loadRunRecovery({
                    runId: nextSelectedRunId,
                    storyId: detail.storyId,
                    worldId: detail.worldId,
                    agentId: recoveryAgentId,
                    playerId: normalizedPlayerId,
                    afterSeq: 0,
                    append: false,
                });
            }
            else {
                applyRecordSurface(null);
            }
        }
        catch (error) {
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
                    kind: 'warning',
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
        queryStoryRecordsWithAgentFallback,
        queryWorldAgentCandidatesByStory,
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
            }
            else {
                setStartupError(null);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            setStories([]);
            setSelectedStoryId(null);
            setSelectedStory(null);
            setStartupPackage(null);
            setStorySnapshot(null);
            setStartupError(message || 'Failed to load playable stories.');
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
                    message: `TextPlay playable stories query failed: ${message || 'unknown error'}`,
                });
            }
        }
    }, [agentIdRuntime, hookClient, selectedWorldId, setRuntimeField, setStatusBanner, worldIdRuntime]);
    const refreshHistorySessions = useCallback(async (input?: {
        refresh?: boolean;
    }) => {
        const normalizedPlayerId = playerId.trim();
        if (!normalizedPlayerId) {
            setHistorySessions([]);
            setSelectedHistoryRunId(null);
            setHistoryError(null);
            setHistoryLoading(false);
            return;
        }
        if (historyRefreshInFlightRef.current) {
            return;
        }
        historyRefreshInFlightRef.current = true;
        const seq = historyHydrationSeqRef.current + 1;
        historyHydrationSeqRef.current = seq;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const result = await listMyHistorySessions({
                hookClient,
                playerId: normalizedPlayerId,
                limit: 100,
                refresh: input?.refresh === true,
            });
            if (historyHydrationSeqRef.current !== seq) {
                return;
            }
            const sorted = sortHistorySessions(result.items);
            setHistorySessions(sorted);
            setHistoryError(null);
            setSelectedHistoryRunId((previous) => {
                if (previous && sorted.some((item) => item.runId === previous)) {
                    return previous;
                }
                return sorted[0]?.runId || null;
            });
        }
        catch (error) {
            if (historyHydrationSeqRef.current !== seq) {
                return;
            }
            setHistoryError(error instanceof Error ? error.message : String(error || ''));
        }
        finally {
            if (historyHydrationSeqRef.current === seq) {
                setHistoryLoading(false);
            }
            historyRefreshInFlightRef.current = false;
        }
    }, [
        hookClient,
        playerId,
    ]);
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
            const nextWorldId = ((previousWorldId && pickWorldSummaryById(rows, previousWorldId)?.id)
                || (runtimeWorldId && pickWorldSummaryById(rows, runtimeWorldId)?.id)
                || rows[0]?.id
                || '').trim();
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
        }
        catch (error) {
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
                    kind: 'warning',
                    message: `TextPlay world list query failed: ${message || 'unknown error'}`,
                });
            }
        }
        finally {
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
        }).catch(() => { });
    }, [agentId, applyRecordSurface, loadRunRecovery, playerId, records, storyId, worldId]);
    const onLoadRecoveryDelta = useCallback(() => {
        const targetRunId = (selectedRecordRunId || runId || '').trim();
        if (!targetRunId) {
            setDeltaStatus({
                kind: 'warning',
                message: 'Select a run first, then click Load Delta.',
            });
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
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
                kind: 'warning',
                message: 'Missing story/world/agent/player context; select story again then retry Load Delta.',
            });
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
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
                    kind: 'warning',
                    message: `No persisted run found for ${targetRunId}.`,
                });
                setStatusBanner({
                    kind: 'warning',
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
                    kind: 'warning',
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
    const onSelectHistorySession = useCallback((runId: string) => {
        const normalized = runId.trim();
        setSelectedHistoryRunId(normalized || null);
    }, []);
    const onContinueHistorySession = useCallback(() => {
        void (async () => {
            if (isRunning) {
                return;
            }
            const targetRunId = (selectedHistoryRunId || '').trim();
            if (!targetRunId) {
                return;
            }
            const target = historySessions.find((item) => item.runId === targetRunId) || null;
            if (!target) {
                return;
            }
            setSelectedWorldId(target.worldId);
            setSelectedStoryId(target.storyId);
            setSelectedRecordRunId(target.runId);
            setStartupError(null);
            setWorldsError(null);
            if (typeof setRuntimeField === 'function') {
                setRuntimeField('worldId', target.worldId);
                setRuntimeField('storyId', target.storyId);
                if (isEntityId(target.agentId)) {
                    setRuntimeField('agentId', target.agentId);
                }
            }
            await hydrateStorySelection(target.storyId, {
                clearRunSurface: true,
                preferredRunId: target.runId,
                forceWorldId: target.worldId,
            });
            setSessionPaused(false);
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'success',
                    message: `Resumed session: ${target.storyTitle}`,
                });
            }
        })().catch((error) => {
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
                    message: `Resume session failed: ${error instanceof Error ? error.message : String(error || '')}`,
                });
            }
        });
    }, [
        historySessions,
        hydrateStorySelection,
        isRunning,
        selectedHistoryRunId,
        setRuntimeField,
        setStatusBanner,
    ]);
    const onRequestHistorySessions = useCallback(() => {
        void refreshHistorySessions();
    }, [refreshHistorySessions]);
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
        setRouteBinding((previous) => {
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
        setRouteBinding((previous) => {
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
        setRouteBinding((previous) => {
            const next = deriveRouteBindingByModel({
                model,
                previous,
                options: chatRouteOptions,
            });
            setRouteLabel(formatRouteLabel(next));
            return next;
        });
    }, [chatRouteOptions]);
    const onClearRouteBinding = useCallback(() => {
        setRouteBinding(null);
        setRouteLabel(formatRouteLabel(chatRouteOptions?.selected || null));
    }, [chatRouteOptions]);
    const onSend = useCallback(() => {
        void (async () => {
            if (isRunning) {
                return;
            }
            if (!ensureExplicitRouteBindingUsable('TextPlay send')) {
                return;
            }
            if (sessionPaused) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'info',
                        message: 'Session is paused. Click Resume in Current Session before sending.',
                    });
                }
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
                        kind: 'warning',
                        message: 'Select a playable story before sending.',
                    });
                }
                return;
            }
            if (!started) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
                        message: 'Click Start to generate opening narration before sending.',
                    });
                }
                return;
            }
            if (!normalizedPlayerId) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
                        message: 'TextPlay requires playerId before sending.',
                    });
                }
                return;
            }
            if (!normalizedWorldId) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
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
                        kind: 'warning',
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
                        kind: 'warning',
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
            const sendFlowId = createTextplayFlowId('textplay-send');
            const sendStartedAt = performance.now();
            emitTextplayLog({
                level: 'info',
                message: 'action:send:start',
                flowId: sendFlowId,
                source: 'useTextplayController.onSend',
                details: {
                    storyId: activeStory.storyId,
                    worldId: normalizedWorldId,
                    agentId: resolvedAgentId,
                    playerId: normalizedPlayerId,
                    runId: nextRunId,
                    traceId,
                    triggerSource: 'UserTurn',
                    messagePreview: normalizedMessage.slice(0, 240),
                    messageChars: normalizedMessage.length,
                },
            });
            setIsRunning(true);
            setRunId(nextRunId);
            setFailure(null);
            setStoryBrief(null);
            setGapRefillApplied(false);
            setPendingUserTurn({
                message: normalizedMessage,
                runId: nextRunId,
                traceId,
                status: 'rendering',
            });
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
                        binding: toRouteBindingRecord(binding),
                        runId: nextRunId,
                        traceId,
                    },
                    deps: {
                        hookClient,
                        runtimeClient: runtimeClient.route,
                        aiClient,
                        narrativeEngine,
                        abortSignal: controller.signal,
                    },
                    presenceReports: presenceMachine.collectSince(presenceMark),
                });
                if (result.ok) {
                    setPendingUserTurn(null);
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
                        storyTitle: activeStory.title,
                        worldId: normalizedWorldId,
                        agentId: resolvedAgentId,
                        playerId: normalizedPlayerId,
                    });
                    if (typeof setStatusBanner === 'function') {
                        setStatusBanner({
                            kind: hasPersistenceWarning(result.meta.warnings)
                                ? 'warning'
                                : 'success',
                            message: result.meta.warnings.length > 0
                                ? 'TextPlay rendered with persistence warning.'
                                : 'TextPlay rendered successfully.',
                        });
                    }
                    const lastEvent = result.runEvents[result.runEvents.length - 1];
                    emitTextplayLog({
                        level: 'info',
                        message: 'action:send:done',
                        flowId: sendFlowId,
                        source: 'useTextplayController.onSend',
                        costMs: Number((performance.now() - sendStartedAt).toFixed(2)),
                        details: {
                            runId: nextRunId,
                            traceId,
                            ok: true,
                            warnings: result.meta.warnings.length,
                            lastEventType: lastEvent?.eventType || null,
                            lastStep: lastEvent?.step || null,
                            runEventCount: result.runEvents.length,
                        },
                    });
                    return;
                }
                setPendingUserTurn({
                    message: normalizedMessage,
                    runId: nextRunId,
                    traceId,
                    status: 'failed',
                    reasonCode: result.reasonCode,
                });
                setFailure(result);
                setWarnings(result.warnings);
                setRunSnapshot(result.runSnapshot);
                setRunEvents(result.runEvents);
                setGapRefillApplied(Boolean(result.runSnapshot.gapRefillApplied));
                setLastRenderedText('');
                setInputTextState(normalizedMessage);
                const lastEvent = result.runEvents[result.runEvents.length - 1];
                emitTextplayLog({
                    level: 'warn',
                    message: 'action:send:failed',
                    flowId: sendFlowId,
                    source: 'useTextplayController.onSend',
                    costMs: Number((performance.now() - sendStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        ok: false,
                        reasonCode: result.reasonCode,
                        actionHint: result.actionHint,
                        runEventCount: result.runEvents.length,
                        lastEventType: lastEvent?.eventType || null,
                        lastStep: lastEvent?.step || null,
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: result.reasonCode === TEXTPLAY_REASON.RUN_CANCELED ? 'warning' : 'error',
                        message: `${result.reasonCode}: ${result.actionHint}`,
                    });
                }
            }
            catch (error) {
                setPendingUserTurn({
                    message: normalizedMessage,
                    runId: nextRunId,
                    traceId,
                    status: 'failed',
                    reasonCode: SEND_RUNTIME_ERROR_REASON,
                });
                setInputTextState(normalizedMessage);
                emitTextplayLog({
                    level: 'error',
                    message: 'action:send:exception',
                    flowId: sendFlowId,
                    source: 'useTextplayController.onSend',
                    costMs: Number((performance.now() - sendStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        error: error instanceof Error ? error.message : String(error || ''),
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'error',
                        message: `TextPlay render failed: ${error instanceof Error ? error.message : String(error || '')}`,
                    });
                }
            }
            finally {
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
        ensureExplicitRouteBindingUsable,
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
        binding,
        selectedStory,
        selectedWorldId,
        sessionPaused,
        setStatusBanner,
        syncPresenceView,
        worldIdRuntime,
    ]);
    const onToggleSessionPause = useCallback(() => {
        if (isRunning || records.length === 0) {
            return;
        }
        const nextPaused = !sessionPaused;
        setSessionPaused(nextPaused);
        if (nextPaused) {
            presenceMachine.dispatch('onUserPaused');
        }
        else {
            lastUserActivityMsRef.current = Date.now();
            consecutiveInitiativeRef.current = 0;
            presenceMachine.dispatch('onUserActive');
        }
        syncPresenceView();
        if (typeof setStatusBanner === 'function') {
            setStatusBanner({
                kind: 'info',
                message: nextPaused
                    ? 'Session paused. Initiative auto progression is suspended.'
                    : 'Session resumed. Initiative auto progression is enabled.',
            });
        }
    }, [
        isRunning,
        presenceMachine,
        records.length,
        sessionPaused,
        setStatusBanner,
        syncPresenceView,
    ]);
    const triggerInitiativeRender = useCallback((inactiveMs: number) => {
        void (async () => {
            if (isRunning) {
                return;
            }
            if (!ensureExplicitRouteBindingUsable('TextPlay initiative')) {
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
            const initiativeFlowId = createTextplayFlowId('textplay-initiative');
            const initiativeStartedAt = performance.now();
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
            setPendingUserTurn(null);
            emitTextplayLog({
                level: 'info',
                message: 'action:initiative:start',
                flowId: initiativeFlowId,
                source: 'useTextplayController.triggerInitiativeRender',
                details: {
                    storyId: activeStory.storyId,
                    worldId: normalizedWorldId,
                    agentId: normalizedAgentId,
                    playerId: normalizedPlayerId,
                    runId: nextRunId,
                    traceId,
                    triggerSource: 'AgentInitiative',
                    inactiveMs,
                    strategy: initiativeDirector.strategy,
                },
            });
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
                        binding: toRouteBindingRecord(binding),
                        runId: nextRunId,
                        traceId,
                    },
                    deps: {
                        hookClient,
                        runtimeClient: runtimeClient.route,
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
                        storyTitle: activeStory.title,
                        worldId: normalizedWorldId,
                        agentId: normalizedAgentId,
                        playerId: normalizedPlayerId,
                    });
                    if (typeof setStatusBanner === 'function') {
                        setStatusBanner({
                            kind: hasPersistenceWarning(result.meta.warnings)
                                ? 'warning'
                                : 'info',
                            message: result.meta.warnings.length > 0
                                ? 'TextPlay initiative rendered with persistence warning.'
                                : 'TextPlay initiative rendered.',
                        });
                    }
                    const lastEvent = result.runEvents[result.runEvents.length - 1];
                    emitTextplayLog({
                        level: 'info',
                        message: 'action:initiative:done',
                        flowId: initiativeFlowId,
                        source: 'useTextplayController.triggerInitiativeRender',
                        costMs: Number((performance.now() - initiativeStartedAt).toFixed(2)),
                        details: {
                            runId: nextRunId,
                            traceId,
                            ok: true,
                            warnings: result.meta.warnings.length,
                            lastEventType: lastEvent?.eventType || null,
                            lastStep: lastEvent?.step || null,
                            runEventCount: result.runEvents.length,
                        },
                    });
                    return;
                }
                setFailure(result);
                setWarnings(result.warnings);
                setRunSnapshot(result.runSnapshot);
                setRunEvents(result.runEvents);
                setGapRefillApplied(Boolean(result.runSnapshot.gapRefillApplied));
                setLastRenderedText('');
                const lastEvent = result.runEvents[result.runEvents.length - 1];
                emitTextplayLog({
                    level: 'warn',
                    message: 'action:initiative:failed',
                    flowId: initiativeFlowId,
                    source: 'useTextplayController.triggerInitiativeRender',
                    costMs: Number((performance.now() - initiativeStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        ok: false,
                        reasonCode: result.reasonCode,
                        actionHint: result.actionHint,
                        runEventCount: result.runEvents.length,
                        lastEventType: lastEvent?.eventType || null,
                        lastStep: lastEvent?.step || null,
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: result.reasonCode === TEXTPLAY_REASON.RUN_CANCELED ? 'warning' : 'error',
                        message: `${result.reasonCode}: ${result.actionHint}`,
                    });
                }
            }
            catch (error) {
                emitTextplayLog({
                    level: 'error',
                    message: 'action:initiative:exception',
                    flowId: initiativeFlowId,
                    source: 'useTextplayController.triggerInitiativeRender',
                    costMs: Number((performance.now() - initiativeStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        error: error instanceof Error ? error.message : String(error || ''),
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'error',
                        message: `TextPlay initiative failed: ${error instanceof Error ? error.message : String(error || '')}`,
                    });
                }
            }
            finally {
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
        ensureExplicitRouteBindingUsable,
        hookClient,
        isRunning,
        narrativeEngine,
        playerId,
        playerIdentity,
        playerName,
        presenceMachine,
        binding,
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
            if (!ensureExplicitRouteBindingUsable('TextPlay story start')) {
                return;
            }
            const activeStory = selectedStory;
            let startup = startupPackage;
            let timelineRecords = records;
            const normalizedPlayerId = playerId.trim();
            const normalizedPlayerName = playerName.trim();
            const normalizedPlayerIdentity = playerIdentity.trim();
            const normalizedWorldId = (activeStory?.worldId || selectedWorldId || worldIdRuntime).trim();
            const normalizedAgentId = (agentIdRuntime || activeStory?.primaryAgentId || '').trim();
            if (!activeStory) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
                        message: 'Select a playable story before start.',
                    });
                }
                return;
            }
            if (!normalizedPlayerName) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
                        message: 'Player Name is required before start.',
                    });
                }
                return;
            }
            if (!normalizedPlayerId || !normalizedWorldId) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
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
            if (timelineRecords.length === 0) {
                try {
                    const fallbackAgentId = normalizedAgentId
                        || String(startup.cast.primaryAgentId || '').trim();
                    const contextCandidatesByStory = await queryWorldAgentCandidatesByStory(normalizedWorldId);
                    const restoredRows = await queryStoryRecordsWithAgentFallback({
                        storyId: activeStory.storyId,
                        worldId: normalizedWorldId,
                        preferredAgentId: fallbackAgentId,
                        candidateAgentIds: mergeAgentCandidateIds([
                            ...activeStory.participants,
                            ...activeStory.characterRefs,
                            ...(contextCandidatesByStory[activeStory.storyId] || []),
                            ...(contextCandidatesByStory[WORLD_AGENT_CANDIDATE_KEY] || []),
                        ]),
                    });
                    if (restoredRows.length > 0) {
                        timelineRecords = restoredRows;
                        setRecords(restoredRows);
                        const restoredSelected = restoredRows[0] || null;
                        const restoredRunId = restoredSelected?.runId || null;
                        setSelectedRecordRunId(restoredRunId);
                        setFailure(null);
                        applyRecordSurface(restoredSelected);
                        if (restoredSelected && restoredRunId) {
                            const recoveryAgentId = (String(restoredSelected.agentId || '').trim()
                                || fallbackAgentId).trim();
                            if (recoveryAgentId) {
                                await loadRunRecovery({
                                    runId: restoredRunId,
                                    storyId: activeStory.storyId,
                                    worldId: normalizedWorldId,
                                    agentId: recoveryAgentId,
                                    playerId: normalizedPlayerId,
                                    afterSeq: 0,
                                    append: false,
                                });
                            }
                        }
                    }
                }
                catch {
                    // Fall back to opening flow when persisted timeline prefetch is unavailable.
                }
            }
            const started = timelineRecords.length > 0;
            if (started) {
                const controller = new AbortController();
                abortRef.current = controller;
                const recapFlowId = createTextplayFlowId('textplay-recap');
                const recapStartedAt = performance.now();
                setIsRunning(true);
                setFailure(null);
                setStoryBrief(null);
                setPendingUserTurn(null);
                emitTextplayLog({
                    level: 'info',
                    message: 'action:recap:start',
                    flowId: recapFlowId,
                    source: 'useTextplayController.onStartStory',
                    details: {
                        storyId: activeStory.storyId,
                        worldId: normalizedWorldId,
                        playerId: normalizedPlayerId,
                        triggerSource: 'SystemEvent',
                        mode: 'story-recap',
                    },
                });
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
                    }
                    catch {
                        canonicalTurns = [];
                    }
                    const recapPrompt = buildStoryRecapPrompt({
                        story: activeStory,
                        startup,
                        playerName: normalizedPlayerName,
                        playerIdentity: normalizedPlayerIdentity,
                        records: timelineRecords,
                        canonicalTurns,
                    });
                    const recapResult = await aiClient.generateText({
                        capability: 'text.generate',
                        binding: toRouteBindingRecord(binding),
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
                    emitTextplayLog({
                        level: 'info',
                        message: 'action:recap:done',
                        flowId: recapFlowId,
                        source: 'useTextplayController.onStartStory',
                        costMs: Number((performance.now() - recapStartedAt).toFixed(2)),
                        details: {
                            storyId: activeStory.storyId,
                            worldId: normalizedWorldId,
                            chars: recapText.length,
                        },
                    });
                    if (typeof setStatusBanner === 'function') {
                        setStatusBanner({
                            kind: 'info',
                            message: 'Story recap generated. You can continue playing now.',
                        });
                    }
                }
                catch (error) {
                    emitTextplayLog({
                        level: 'warn',
                        message: 'action:recap:failed',
                        flowId: recapFlowId,
                        source: 'useTextplayController.onStartStory',
                        costMs: Number((performance.now() - recapStartedAt).toFixed(2)),
                        details: {
                            storyId: activeStory.storyId,
                            worldId: normalizedWorldId,
                            error: error instanceof Error ? error.message : String(error || ''),
                        },
                    });
                    if (typeof setStatusBanner === 'function') {
                        setStatusBanner({
                            kind: 'warning',
                            message: `TextPlay recap failed: ${error instanceof Error ? error.message : String(error || '')}`,
                        });
                    }
                }
                finally {
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
                        kind: 'warning',
                        message: 'Primary agent binding is missing for this playable story.',
                    });
                }
                return;
            }
            const nextRunId = createUlid();
            const traceId = createUlid();
            const controller = new AbortController();
            abortRef.current = controller;
            const startFlowId = createTextplayFlowId('textplay-start');
            const startStartedAt = performance.now();
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
            setPendingUserTurn(null);
            emitTextplayLog({
                level: 'info',
                message: 'action:start-story:start',
                flowId: startFlowId,
                source: 'useTextplayController.onStartStory',
                details: {
                    storyId: activeStory.storyId,
                    worldId: normalizedWorldId,
                    agentId: resolvedAgentId,
                    playerId: normalizedPlayerId,
                    runId: nextRunId,
                    traceId,
                    triggerSource: 'SystemEvent',
                    mode: 'story-start',
                },
            });
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
                        binding: toRouteBindingRecord(binding),
                        runId: nextRunId,
                        traceId,
                    },
                    deps: {
                        hookClient,
                        runtimeClient: runtimeClient.route,
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
                        storyTitle: activeStory.title,
                        worldId: normalizedWorldId,
                        agentId: resolvedAgentId,
                        playerId: normalizedPlayerId,
                    });
                    if (typeof setStatusBanner === 'function') {
                        setStatusBanner({
                            kind: hasPersistenceWarning(result.meta.warnings)
                                ? 'warning'
                                : 'success',
                            message: result.meta.warnings.length > 0
                                ? 'TextPlay started with persistence warning.'
                                : 'TextPlay story started.',
                        });
                    }
                    const lastEvent = result.runEvents[result.runEvents.length - 1];
                    emitTextplayLog({
                        level: 'info',
                        message: 'action:start-story:done',
                        flowId: startFlowId,
                        source: 'useTextplayController.onStartStory',
                        costMs: Number((performance.now() - startStartedAt).toFixed(2)),
                        details: {
                            runId: nextRunId,
                            traceId,
                            ok: true,
                            warnings: result.meta.warnings.length,
                            lastEventType: lastEvent?.eventType || null,
                            lastStep: lastEvent?.step || null,
                            runEventCount: result.runEvents.length,
                        },
                    });
                    return;
                }
                setFailure(result);
                setWarnings(result.warnings);
                setRunSnapshot(result.runSnapshot);
                setRunEvents(result.runEvents);
                setGapRefillApplied(Boolean(result.runSnapshot.gapRefillApplied));
                setLastRenderedText('');
                const lastEvent = result.runEvents[result.runEvents.length - 1];
                emitTextplayLog({
                    level: 'warn',
                    message: 'action:start-story:failed',
                    flowId: startFlowId,
                    source: 'useTextplayController.onStartStory',
                    costMs: Number((performance.now() - startStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        ok: false,
                        reasonCode: result.reasonCode,
                        actionHint: result.actionHint,
                        runEventCount: result.runEvents.length,
                        lastEventType: lastEvent?.eventType || null,
                        lastStep: lastEvent?.step || null,
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: result.reasonCode === TEXTPLAY_REASON.RUN_CANCELED ? 'warning' : 'error',
                        message: `${result.reasonCode}: ${result.actionHint}`,
                    });
                }
            }
            catch (error) {
                emitTextplayLog({
                    level: 'error',
                    message: 'action:start-story:exception',
                    flowId: startFlowId,
                    source: 'useTextplayController.onStartStory',
                    costMs: Number((performance.now() - startStartedAt).toFixed(2)),
                    details: {
                        runId: nextRunId,
                        traceId,
                        error: error instanceof Error ? error.message : String(error || ''),
                    },
                });
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'error',
                        message: `TextPlay start failed: ${error instanceof Error ? error.message : String(error || '')}`,
                    });
                }
            }
            finally {
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
        applyRenderSuccessSurface,
        ensureExplicitRouteBindingUsable,
        ensureStartupPackage,
        hookClient,
        isRunning,
        loadRunRecovery,
        narrativeEngine,
        playerId,
        playerIdentity,
        playerName,
        presenceMachine,
        queryStoryRecordsWithAgentFallback,
        queryWorldAgentCandidatesByStory,
        queryNarrativeTurnWindow,
        records,
        binding,
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
            await refreshHistorySessions({ refresh: true });
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
                    kind: 'warning',
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
        refreshHistorySessions,
        refreshRouteAvailability,
        selectedRecordRunId,
        selectedStoryId,
        setStatusBanner,
    ]);
    const onCopyDiagnostics = useCallback(() => {
        void (async () => {
            const selected = records.find((item) => item.runId === selectedRecordRunId) || null;
            const latest = records[0] || null;
            const payload = {
                capturedAt: new Date().toISOString(),
                story: {
                    worldId,
                    storyId,
                    agentId,
                    selectedWorldId,
                    selectedStoryId,
                },
                session: {
                    playerId,
                    playerName,
                    playerIdentity,
                    presenceState,
                },
                route: {
                    routeLabel,
                    routeSource,
                    routeConnectorId,
                    routeModel,
                    bindingActive: Boolean(binding),
                },
                runtime: {
                    runId,
                    selectedRecordRunId,
                    storyStarted: records.length > 0,
                    isRunning,
                    startupLoading,
                    startupError,
                    pendingUserTurn,
                },
                startupSnapshot: storySnapshot
                    ? {
                        storyId: storySnapshot.storyId,
                        entryEventId: storySnapshot.entryEventId,
                        primaryAgentId: storySnapshot.primaryAgentId,
                        version: storySnapshot.version,
                        source: storySnapshot.source,
                        loadedAt: storySnapshot.loadedAt,
                        contextCoverage: storySnapshot.contextCoverage,
                        gapWarnings: storySnapshot.gapWarnings,
                    }
                    : null,
                diagnostics: {
                    gapRefillApplied,
                    deltaStatus,
                    runSnapshot,
                    warningCount: warnings.length,
                    failure: failure
                        ? {
                            reasonCode: failure.reasonCode,
                            actionHint: failure.actionHint,
                            traceId: failure.traceId,
                            warningCount: failure.warnings.length,
                        }
                        : null,
                    selectedRecord: selected
                        ? {
                            runId: selected.runId,
                            turnId: selected.turnId,
                            traceId: selected.traceId,
                            promptTraceId: selected.meta.promptTraceId || '',
                            triggerSource: selected.triggerSource,
                            textPreview: String(selected.text || '').slice(0, 600),
                            userMessage: selected.userMessage,
                        }
                        : null,
                    latestRecord: latest
                        ? {
                            runId: latest.runId,
                            turnId: latest.turnId,
                            traceId: latest.traceId,
                            promptTraceId: latest.meta.promptTraceId || '',
                            triggerSource: latest.triggerSource,
                            textPreview: String(latest.text || '').slice(0, 600),
                            userMessage: latest.userMessage,
                        }
                        : null,
                    runSteps: runEvents.slice(-40),
                },
            };
            const text = JSON.stringify(payload, null, 2);
            const canWriteClipboard = typeof navigator !== 'undefined'
                && Boolean(navigator.clipboard)
                && typeof navigator.clipboard.writeText === 'function';
            if (!canWriteClipboard) {
                if (typeof setStatusBanner === 'function') {
                    setStatusBanner({
                        kind: 'warning',
                        message: 'Clipboard unavailable in this runtime. Copy Diag is not supported here.',
                    });
                }
                return;
            }
            await navigator.clipboard.writeText(text);
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'success',
                    message: 'TextPlay diagnostics copied to clipboard.',
                });
            }
        })().catch((error) => {
            if (typeof setStatusBanner === 'function') {
                setStatusBanner({
                    kind: 'warning',
                    message: `Copy diagnostics failed: ${error instanceof Error ? error.message : String(error || '')}`,
                });
            }
        });
    }, [
        agentId,
        deltaStatus,
        failure,
        gapRefillApplied,
        isRunning,
        playerId,
        playerIdentity,
        playerName,
        presenceState,
        records,
        routeConnectorId,
        routeLabel,
        routeModel,
        binding,
        routeSource,
        runEvents,
        runId,
        runSnapshot,
        selectedRecordRunId,
        selectedStoryId,
        selectedWorldId,
        setStatusBanner,
        startupError,
        startupLoading,
        pendingUserTurn,
        storyId,
        storySnapshot,
        warnings.length,
        worldId,
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
        setSelectedHistoryRunId((previous) => {
            if (previous && historySessions.some((item) => item.runId === previous)) {
                return previous;
            }
            return historySessions[0]?.runId || null;
        });
    }, [historySessions]);
    useEffect(() => {
        if (typeof setRuntimeField === 'function' && playerId.trim()) {
            setRuntimeField('playerId', playerId.trim());
        }
    }, [playerId, setRuntimeField]);
    useEffect(() => {
        if (typeof setRuntimeField === 'function') {
            setRuntimeField('playerName', playerName.trim());
        }
    }, [playerName, setRuntimeField]);
    useEffect(() => {
        if (typeof setRuntimeField === 'function') {
            setRuntimeField('playerIdentity', playerIdentity.trim());
        }
    }, [playerIdentity, setRuntimeField]);
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
        if (records.length === 0 && sessionPaused) {
            setSessionPaused(false);
        }
    }, [records.length, sessionPaused]);
    useEffect(() => {
        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
                return;
            }
            if (sessionPaused) {
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
                ? 300000
                : presenceState === 'idle'
                    ? 120000
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
        }, 10000);
        return () => {
            clearInterval(timer);
        };
    }, [
        isRunning,
        presenceState,
        records.length,
        sessionPaused,
        selectedStory,
        startupPackage,
        triggerInitiativeRender,
    ]);
    useEffect(() => () => {
        presenceMachine.destroy();
        abortRef.current?.abort();
    }, [presenceMachine]);
    // Lifecycle: pause/resume presence timers when tab goes inactive/active
    useEffect(() => {
        return onRouteLifecycleChange(TEXTPLAY_TAB_ID, (state) => {
            if (state === 'active') {
                presenceMachine.resetTimers();
            }
            else {
                presenceMachine.pauseTimers();
            }
        });
    }, [presenceMachine]);
    const storyStarted = records.length > 0;
    const hasRouteConfig = routeLabel !== 'unavailable' && isRouteBindingUsable(effectiveRouteBinding);
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
        && !sessionPaused
        && hasRouteConfig
        && hasStoryRuntimeBinding
        && hasPlayerName
        && inputText.trim().length > 0;
    const canTogglePause = !isRunning && storyStarted;
    const canContinueHistory = !isRunning
        && historySessions.length > 0
        && Boolean(selectedHistoryRunId);
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
        historySessions,
        historyLoading,
        historyError,
        selectedHistoryRunId,
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
            paused: sessionPaused,
        }),
        storyStarted,
        sessionPaused,
        isRunning,
        canStartStory,
        canSend,
        canTogglePause,
        canContinueHistory,
        canSelectStory: !isRunning,
        routeSource,
        routeConnectorId,
        routeModel,
        routeConnectors,
        routeModelOptions,
        bindingActive: Boolean(binding),
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
        pendingUserTurn,
        setPlayerName,
        setPlayerIdentity,
        setInputText,
        onInputFocus,
        onInputBlur,
        onStartStory,
        onToggleSessionPause,
        onSend,
        onCancel,
        onRefresh,
        onCopyDiagnostics,
        onInitiativeReceived,
        onRequestHistorySessions,
        onSelectHistorySession,
        onContinueHistorySession,
        onSelectWorld,
        onSelectStory,
        onSelectRecord,
        onLoadRecoveryDelta,
        onRouteSourceChange,
        onRouteConnectorChange,
        onRouteModelChange,
        onClearRouteBinding,
    };
}
