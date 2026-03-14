import { clearModSdkHost, setModSdkHost } from '../../../../shared/testing/mod-sdk-host.js';
import type { LocalChatAiClient } from '../../src/runtime-ai-client.ts';
import { FIRST_BEAT_END_MARKER } from '../../src/hooks/turn-send/first-beat-reactor.ts';
import { isMediaPlannerPromptText, isPerceptionPromptText, isTailPlanPromptText, } from './prompt-matchers.mjs';
import { configureLocalChatCoreQueryBridge, CORE_DATA_API_AGENT_MEMORY_CORE_LIST, CORE_DATA_API_AGENT_MEMORY_E2E_LIST, CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY, CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST, CORE_DATA_API_WORLD_BY_ID_GET, CORE_DATA_API_WORLDVIEW_BY_ID_GET, type LocalChatReadContext, type LocalChatTarget, } from '../../src/data/index.ts';
import { resetLocalChatDataCaches } from '../../src/data/cache-store.ts';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS, DEFAULT_LOCAL_CHAT_SETTINGS, type LocalChatSettings, persistLocalChatSettings, } from '../../src/default-settings-store.ts';
import { buildLocalChatTurnContextKey } from '../../src/hooks/turn-send/context-key.ts';
import { runLocalChatTurnSend } from '../../src/hooks/turn-send/send-flow.ts';
import { resetLocalChatConversationLedgerForTests, } from '../../src/state/index.ts';
import { type ModRuntimeLocalProfileSnapshot } from "@nimiplatform/sdk/mod";
class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number {
        return this.store.size;
    }
    clear(): void {
        this.store.clear();
    }
    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key) || null : null;
    }
    key(index: number): string | null {
        return Array.from(this.store.keys())[index] || null;
    }
    removeItem(key: string): void {
        this.store.delete(key);
    }
    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}
class TestCustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
    }
}
function createWindowShim(localStorage: Storage) {
    return {
        localStorage,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
    };
}
function localRoute(model: string): Record<string, unknown> {
    return {
        source: 'local',
        model,
        localModelId: model,
    };
}
function toFriendPayload(target: LocalChatTarget): Record<string, unknown> {
    return {
        id: target.id,
        handle: target.handle,
        displayName: target.displayName,
        avatarUrl: target.avatarUrl,
        bio: target.bio,
        friendsSince: target.friendsSince,
        isAgent: target.isAgent,
        worldId: target.worldId,
        agentMetadata: target.agentMetadata,
        agentProfile: target.agentProfile,
    };
}
export function createTestTarget(overrides: Partial<LocalChatTarget> = {}): LocalChatTarget {
    return {
        id: 'agent.local-chat.test',
        handle: '~tester',
        displayName: 'Tester',
        avatarUrl: null,
        bio: 'A deterministic local-chat test target.',
        friendsSince: null,
        isAgent: true,
        worldId: 'world.local-chat.test',
        worldResolvedBy: 'profile',
        agentMetadata: {
            wakeStrategy: 'PROACTIVE',
        },
        agentProfile: {
            persona: '温柔、稳定、会记住上下文',
            dna: {
                communication: {
                    responseLength: 'short',
                    formality: 'casual',
                    sentiment: 'positive',
                },
                personality: {
                    warmth: 'warm',
                    flirtAffinity: 'light',
                    pacingStyle: 'balanced',
                },
                voice: {
                    voiceId: 'alloy',
                    language: 'zh-CN',
                },
                appearance: {
                    style: 'anime',
                    fashionStyle: 'casual',
                },
            },
        },
        world: {
            id: 'world.local-chat.test',
            name: 'Night Harbor',
            summary: 'A quiet world for deterministic local-chat tests.',
        },
        worldview: {
            id: 'world.local-chat.test',
            name: 'Neon Rain',
            summary: 'Keep continuity stable and natural.',
        },
        payload: {
            currentUserId: 'user.test',
            wakeStrategy: 'PROACTIVE',
        },
        ...overrides,
    };
}
export function createDependencySnapshot(input: {
    capability: 'image' | 'video';
    status: 'ready' | 'missing' | 'degraded';
}): ModRuntimeLocalProfileSnapshot {
    return {
        modId: 'local-chat',
        status: input.status,
        routeSource: 'local',
        warnings: [],
        entries: input.status === 'ready'
            ? [{
                    entryId: `${input.capability}-model`,
                    kind: 'model',
                    capability: input.capability,
                    required: true,
                    selected: true,
                    preferred: true,
                    warnings: [],
                }]
            : [],
        repairActions: input.status === 'ready'
            ? []
            : [{
                    actionId: `repair-${input.capability}`,
                    label: `Repair ${input.capability}`,
                    reasonCode: 'LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED',
                    capability: input.capability,
                }],
        updatedAt: new Date().toISOString(),
    };
}
export async function waitForCondition(assertion: () => boolean | Promise<boolean>, timeoutMs = 800): Promise<void> {
    const startedAt = Date.now();
    for (;;) {
        if (await assertion()) {
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('WAIT_FOR_TIMEOUT');
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
    }
}
export function createScriptedAiClient(input: {
    firstBeatText?: string;
    streamText?: string;
    fallbackText?: string;
    perceptionResult?: Record<string, unknown> | null;
    planBeats?: Array<Record<string, unknown>>;
    memoryExtractionMemories?: Array<Record<string, unknown>>;
    governanceSlots?: Array<Record<string, unknown>>;
    mediaPlannerDecision?: Record<string, unknown> | null;
}): {
    client: Pick<LocalChatAiClient, 'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'>;
    counters: {
        plan: number;
        governance: number;
        planner: number;
        image: number;
        video: number;
    };
} {
    const counters = {
        perception: 0,
        plan: 0,
        memoryExtraction: 0,
        governance: 0,
        planner: 0,
        image: 0,
        video: 0,
    };
    return {
        counters,
        client: {
            async generateText() {
                return {
                    text: String(input.firstBeatText || '嗯，我在。'),
                    traceId: 'trace-first-beat',
                    promptTraceId: 'trace-first-beat',
                    route: localRoute('chat-model'),
                };
            },
            async generateObject(payload: Record<string, unknown>) {
                const prompt = String(payload.prompt || '');
                if (isPerceptionPromptText(prompt)) {
                    counters.perception += 1;
                    const object = input.perceptionResult || {
                        turnMode: 'information',
                        emotionalState: null,
                        relevantMemoryIds: [],
                        conversationDirective: null,
                        intimacyCeiling: 'friendly',
                    };
                    return {
                        object,
                        text: JSON.stringify(object),
                        traceId: 'trace-perception',
                        promptTraceId: 'trace-perception',
                        route: localRoute('chat-model'),
                    };
                }
                if (isTailPlanPromptText(prompt)) {
                    counters.plan += 1;
                    const object = {
                        beats: input.planBeats || [
                            {
                                text: '如果你愿意，我就顺着你刚刚那句话继续陪你聊。',
                                intent: 'invite',
                                relationMove: 'warm',
                                sceneMove: 'chat',
                                pauseMs: 650,
                            },
                        ],
                    };
                    return {
                        object,
                        text: JSON.stringify(object),
                        traceId: 'trace-plan',
                        promptTraceId: 'trace-plan',
                        route: localRoute('chat-model'),
                    };
                }
                if (prompt.includes('你是 local-chat 的关系记忆提取器。')) {
                    counters.memoryExtraction += 1;
                    const object = {
                        memories: input.memoryExtractionMemories || [],
                    };
                    return {
                        object,
                        text: JSON.stringify(object),
                        traceId: 'trace-memory-extraction',
                        promptTraceId: 'trace-memory-extraction',
                        route: localRoute('chat-model'),
                    };
                }
                if (prompt.includes('你是 local-chat 的记忆治理编译器')) {
                    counters.governance += 1;
                    const object = {
                        slots: input.governanceSlots || [],
                    };
                    return {
                        object,
                        text: JSON.stringify(object),
                        traceId: 'trace-governance',
                        promptTraceId: 'trace-governance',
                        route: localRoute('chat-model'),
                    };
                }
                if (isMediaPlannerPromptText(prompt)) {
                    counters.planner += 1;
                    if (!input.mediaPlannerDecision) {
                        throw new Error('LOCAL_CHAT_TEST_UNEXPECTED_MEDIA_PLANNER');
                    }
                    return {
                        object: input.mediaPlannerDecision,
                        text: JSON.stringify(input.mediaPlannerDecision),
                        traceId: 'trace-planner',
                        promptTraceId: 'trace-planner',
                        route: localRoute('chat-model'),
                    };
                }
                throw new Error(`LOCAL_CHAT_TEST_UNHANDLED_GENERATE_OBJECT:${prompt.slice(0, 80)}`);
            },
            async *streamText() {
                yield {
                    type: 'text_delta' as const,
                    textDelta: `${String(input.streamText ?? input.firstBeatText ?? 'fallback stream text')}${FIRST_BEAT_END_MARKER}`,
                    route: localRoute('chat-model'),
                };
                yield {
                    type: 'done' as const,
                    route: localRoute('chat-model'),
                };
            },
            async generateImage() {
                counters.image += 1;
                return {
                    images: [{ uri: 'data:image/png;base64,ZmFrZQ==', mimeType: 'image/png' }],
                    traceId: 'trace-image',
                    route: localRoute('image-model'),
                };
            },
            async generateVideo() {
                counters.video += 1;
                return {
                    videos: [{ uri: 'file:///tmp/video.mp4', mimeType: 'video/mp4' }],
                    traceId: 'trace-video',
                    route: localRoute('video-model'),
                };
            },
            async resolveRoute() {
                return localRoute('chat-model');
            },
        },
    };
}
export async function withLocalChatTestEnv(input: {
    targets?: LocalChatTarget[];
    settings?: LocalChatSettings;
    memoryRecallPayload?: Record<string, unknown>;
    worldsById?: Record<string, Record<string, unknown> | null>;
    worldviewsById?: Record<string, Record<string, unknown> | null>;
}, run: (env: {
    localStorage: Storage;
    readContext: LocalChatReadContext;
    targets: LocalChatTarget[];
}) => Promise<void>): Promise<void> {
    const previousWindow = (globalThis as {
        window?: unknown;
    }).window;
    const previousLocalStorage = (globalThis as {
        localStorage?: unknown;
    }).localStorage;
    const previousCustomEvent = (globalThis as {
        CustomEvent?: unknown;
    }).CustomEvent;
    const localStorage = new MemoryStorage();
    const windowShim = createWindowShim(localStorage);
    const targets = input.targets || [createTestTarget()];
    const worldsById = input.worldsById || Object.fromEntries(targets
        .filter((target) => Boolean(target.worldId))
        .map((target) => [target.worldId as string, target.world || { id: target.worldId, name: target.worldId }]));
    const worldviewsById = input.worldviewsById || Object.fromEntries(targets
        .filter((target) => Boolean(target.worldId))
        .map((target) => [target.worldId as string, target.worldview || { id: target.worldId, name: target.worldId }]));
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: windowShim,
    });
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: localStorage,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: TestCustomEvent,
    });
    configureLocalChatCoreQueryBridge({
        query: async (capability: string, query?: Record<string, unknown>) => {
            if (capability === CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST) {
                return {
                    items: targets.map(toFriendPayload),
                };
            }
            if (capability === CORE_DATA_API_WORLD_BY_ID_GET) {
                return worldsById[String(query?.worldId || '')] || null;
            }
            if (capability === CORE_DATA_API_WORLDVIEW_BY_ID_GET) {
                return worldviewsById[String(query?.worldId || '')] || null;
            }
            if (capability === CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY) {
                return input.memoryRecallPayload || {
                    core: [],
                    e2e: [],
                    recallSource: 'remote-only',
                    entityId: 'user.test',
                };
            }
            if (capability === CORE_DATA_API_AGENT_MEMORY_CORE_LIST || capability === CORE_DATA_API_AGENT_MEMORY_E2E_LIST) {
                return [];
            }
            return null;
        },
    });
    setModSdkHost({
        logging: {
            emitRuntimeLog: () => undefined,
            createRendererFlowId: (prefix: string) => `${prefix}-test`,
            logRendererEvent: () => undefined,
        },
    } as never);
    try {
        resetLocalChatDataCaches();
        await resetLocalChatConversationLedgerForTests();
        persistLocalChatSettings(input.settings || DEFAULT_LOCAL_CHAT_SETTINGS);
        await run({
            localStorage,
            readContext: {
                realmBaseUrl: 'http://localhost.test',
                viewerId: 'user.test',
            },
            targets,
        });
    }
    finally {
        clearModSdkHost();
        configureLocalChatCoreQueryBridge(null);
        resetLocalChatDataCaches();
        await resetLocalChatConversationLedgerForTests();
        if (previousWindow === undefined) {
            delete (globalThis as {
                window?: unknown;
            }).window;
        }
        else {
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: previousWindow,
            });
        }
        if (previousLocalStorage === undefined) {
            delete (globalThis as {
                localStorage?: unknown;
            }).localStorage;
        }
        else {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: previousLocalStorage,
            });
        }
        if (previousCustomEvent === undefined) {
            delete (globalThis as {
                CustomEvent?: unknown;
            }).CustomEvent;
        }
        else {
            Object.defineProperty(globalThis, 'CustomEvent', {
                configurable: true,
                value: previousCustomEvent,
            });
        }
    }
}
export function createSendFlowHarness(input: {
    target: LocalChatTarget;
    viewerId?: string;
    viewerDisplayName?: string;
    defaultSettings?: Partial<typeof DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS>;
}) {
    const statusBanners: Array<{
        kind: string;
        message: string;
    }> = [];
    const state = {
        inputText: '',
        selectedSessionId: '',
        messages: [] as Array<Record<string, unknown>>,
        sessions: [] as unknown[],
        latestPromptTrace: null as Record<string, unknown> | null,
        latestTurnAudit: null as Record<string, unknown> | null,
        isSending: false,
        sendPhase: 'idle' as 'idle' | 'awaiting-first-beat' | 'streaming-first-beat' | 'planning-tail' | 'delivering-tail',
        scheduleDone: null as Promise<void> | null,
        activeScheduleContext: null as {
            targetId: string;
            sessionId: string;
            routeBindingSource: string;
            routeBindingConnector: string;
            routeBindingModel: string;
        } | null,
    };
    return {
        state,
        statusBanners,
        async executeTurn(exec: {
            userText: string;
            selectedSessionId?: string;
            priorMessages?: Array<Record<string, unknown>>;
            defaultSettings?: Partial<typeof DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS>;
            imageDependencySnapshot?: ModRuntimeLocalProfileSnapshot | null;
            videoDependencySnapshot?: ModRuntimeLocalProfileSnapshot | null;
            aiClient: Pick<LocalChatAiClient, 'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'>;
        }) {
            state.inputText = exec.userText;
            state.selectedSessionId = String(exec.selectedSessionId ?? state.selectedSessionId ?? '');
            if (exec.priorMessages) {
                state.messages = [...exec.priorMessages];
            }
            state.latestPromptTrace = null;
            state.latestTurnAudit = null;
            state.isSending = false;
            state.sendPhase = 'idle';
            state.scheduleDone = null;
            state.activeScheduleContext = null;
            statusBanners.length = 0;
            await runLocalChatTurnSend({
                context: {
                    aiClient: exec.aiClient,
                    viewerId: input.viewerId || 'user.test',
                    viewerDisplayName: input.viewerDisplayName || 'Test User',
                    inputText: state.inputText,
                    setInputText: (value: string) => {
                        state.inputText = value;
                    },
                    runtimeMode: 'STORY' as const,
                    chatRouteOptions: null,
                    routeBinding: null,
                    routeSnapshot: {
                        source: 'local',
                        model: 'chat-model',
                    },
                    defaultSettings: {
                        ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
                        imageRouteSource: 'local',
                        imageModel: 'image-model',
                        videoRouteSource: 'local',
                        videoModel: 'video-model',
                        ...input.defaultSettings,
                        ...exec.defaultSettings,
                    },
                    selectedTarget: input.target,
                    selectedSessionId: state.selectedSessionId,
                    messages: state.messages as never,
                    setMessages: (updater: unknown) => {
                        const next = typeof updater === 'function'
                            ? (updater as (prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)(state.messages)
                            : updater as Array<Record<string, unknown>>;
                        state.messages = next;
                    },
                    setSessions: (sessions: unknown[]) => {
                        state.sessions = sessions;
                    },
                    setSelectedSessionId: (sessionId: string) => {
                        state.selectedSessionId = sessionId;
                    },
                    setLatestPromptTrace: (trace: Record<string, unknown> | null) => {
                        state.latestPromptTrace = trace;
                    },
                    setLatestTurnAudit: (audit: Record<string, unknown> | null) => {
                        state.latestTurnAudit = audit;
                    },
                    imageDependencySnapshot: exec.imageDependencySnapshot ?? createDependencySnapshot({
                        capability: 'image',
                        status: 'ready',
                    }),
                    videoDependencySnapshot: exec.videoDependencySnapshot ?? createDependencySnapshot({
                        capability: 'video',
                        status: 'ready',
                    }),
                    setStatusBanner: (banner: {
                        kind: string;
                        message: string;
                    }) => {
                        statusBanners.push(banner);
                    },
                    isTranscribing: false,
                    onOpenRuntimeSetup: () => undefined,
                } as never,
                setSendPhase: (next) => {
                    state.sendPhase = next;
                    state.isSending = next !== 'idle';
                },
                getCurrentContextKey: () => buildLocalChatTurnContextKey({
                    targetId: input.target.id,
                    sessionId: state.selectedSessionId,
                    routeBinding: null,
                    activeSchedule: state.activeScheduleContext,
                }),
                registerSchedule: ({ handle, context }) => {
                    state.scheduleDone = handle.done;
                    state.activeScheduleContext = context;
                },
                clearScheduleByTxn: () => undefined,
            });
            if (state.scheduleDone) {
                await state.scheduleDone;
            }
            return {
                sessionId: state.selectedSessionId,
                messages: state.messages,
                promptTrace: state.latestPromptTrace,
                turnAudit: state.latestTurnAudit,
                statusBanners: [...statusBanners],
            };
        },
    };
}
