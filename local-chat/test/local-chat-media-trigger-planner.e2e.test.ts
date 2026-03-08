import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';
import type { ModRuntimeDependencySnapshot } from '@nimiplatform/sdk/mod/runtime';
import {
  configureLocalChatCoreQueryBridge,
  CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
  type LocalChatTarget,
} from '../src/data/index.ts';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/state/index.ts';
import { buildLocalChatTurnContextKey } from '../src/hooks/turn-send/context-key.ts';
import { runLocalChatTurnSend } from '../src/hooks/turn-send/send-flow.ts';

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

function createTarget(): LocalChatTarget {
  return {
    id: 'agent.local-chat.media-planner',
    handle: 'planner-bot',
    displayName: 'Planner Bot',
    avatarUrl: null,
    bio: 'A cinematic AI companion.',
    friendsSince: null,
    isAgent: true,
    worldId: 'world.media-planner',
    worldResolvedBy: 'profile',
    agentMetadata: {},
    agentProfile: {},
    world: { name: 'Night Harbor' },
    worldview: { name: 'Neon Rain' },
    payload: {
      currentUserId: 'user.test',
    },
  };
}

function createDependencySnapshot(input: {
  capability: 'image' | 'video';
  status: 'ready' | 'missing' | 'degraded';
}): ModRuntimeDependencySnapshot {
  return {
    modId: 'local-chat',
    status: input.status,
    routeSource: 'local',
    warnings: [],
    dependencies: input.status === 'ready'
      ? [{
        dependencyId: `${input.capability}-model`,
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

function createTextStream(text: string) {
  return async function* streamText() {
    yield {
      type: 'text_delta' as const,
      textDelta: text,
      route: {
        source: 'local' as const,
        model: 'chat-model',
        localModelId: 'chat-model',
      },
    };
    yield {
      type: 'done' as const,
      route: {
        source: 'local' as const,
        model: 'chat-model',
        localModelId: 'chat-model',
      },
    };
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(assertion: () => boolean, timeoutMs = 300): Promise<void> {
  const startedAt = Date.now();
  while (!assertion()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('WAIT_FOR_TIMEOUT');
    }
    await delay(10);
  }
}

async function withSendFlowHarness(
  run: (harness: ReturnType<typeof createHarness>) => Promise<void>,
): Promise<void> {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const previousCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;
  const localStorage = new MemoryStorage();
  const windowShim = {
    localStorage,
    dispatchEvent: () => true,
  };
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
    query: async (capability: string) => {
      if (capability === CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY) {
        return {
          core: [],
          e2e: [],
          recallSource: 'remote-only',
          entityId: 'user.test',
        };
      }
      return [];
    },
  });
  setModSdkHost({
    logging: {
      emitRuntimeLog: () => {},
      createRendererFlowId: (prefix: string) => `${prefix}-test`,
      logRendererEvent: () => {},
    },
  } as never);

  try {
    await run(createHarness());
  } finally {
    clearModSdkHost();
    configureLocalChatCoreQueryBridge(null);
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
    if (previousLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: previousLocalStorage,
      });
    }
    if (previousCustomEvent === undefined) {
      delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
    } else {
      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: previousCustomEvent,
      });
    }
  }
}

function createHarness() {
  const target = createTarget();
  const statusBanners: Array<{ kind: string; message: string }> = [];
  const state = {
    inputText: '',
    selectedSessionId: '',
    messages: [] as Array<Record<string, unknown>>,
    sessions: [] as unknown[],
    latestPromptTrace: null as Record<string, unknown> | null,
    latestTurnAudit: null as Record<string, unknown> | null,
    isSending: false,
    scheduleDone: null as Promise<void> | null,
    activeScheduleContext: null as { targetId: string; sessionId: string; routeBindingSource: string; routeBindingConnector: string; routeBindingModel: string } | null,
  };

  return {
    target,
    state,
    statusBanners,
    async execute(input: {
      userText: string;
      priorMessages?: Array<Record<string, unknown>>;
      defaultSettings?: Partial<typeof DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS>;
      imageDependencySnapshot?: ModRuntimeDependencySnapshot | null;
      videoDependencySnapshot?: ModRuntimeDependencySnapshot | null;
      aiClientOverrides?: Partial<{
        streamText: ReturnType<typeof createTextStream>;
        generateText: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        generateObject: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        generateImage: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        generateVideo: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        resolveRoute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }>;
    }) {
      state.inputText = input.userText;
      state.selectedSessionId = '';
      state.messages = [...(input.priorMessages || [])];
      state.sessions = [];
      state.latestPromptTrace = null;
      state.latestTurnAudit = null;
      state.isSending = false;
      state.scheduleDone = null;
      state.activeScheduleContext = null;
      statusBanners.length = 0;

      const counters = {
        generateObject: 0,
        generateImage: 0,
        generateVideo: 0,
      };
      const defaultSettings = {
        ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
        imageRouteSource: 'local' as const,
        imageModel: 'image-model',
        videoRouteSource: 'local' as const,
        videoModel: 'video-model',
        ...input.defaultSettings,
      };
      const isMediaPlannerPrompt = (payload: Record<string, unknown>) =>
        String(payload.prompt || '').includes('媒体触发 planner');
      const context = {
        aiClient: {
          streamText: input.aiClientOverrides?.streamText
            ? input.aiClientOverrides.streamText
            : createTextStream('这是一条正常的文字回复。'),
          generateText: input.aiClientOverrides?.generateText
            ? input.aiClientOverrides.generateText
            : async () => ({
              text: 'fallback text reply',
              traceId: 'trace-fallback',
              promptTraceId: 'trace-fallback',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            }),
          generateObject: input.aiClientOverrides?.generateObject
            ? async (payload: Record<string, unknown>) => {
              if (isMediaPlannerPrompt(payload)) {
                counters.generateObject += 1;
              }
              return input.aiClientOverrides?.generateObject?.(payload) as Promise<Record<string, unknown>>;
            }
            : async (payload: Record<string, unknown>) => {
              if (isMediaPlannerPrompt(payload)) {
                counters.generateObject += 1;
              }
              throw new Error('PLANNER_SHOULD_NOT_RUN');
            },
          generateImage: input.aiClientOverrides?.generateImage
            ? async (payload: Record<string, unknown>) => {
              counters.generateImage += 1;
              return input.aiClientOverrides?.generateImage?.(payload) as Promise<Record<string, unknown>>;
            }
            : async () => {
              counters.generateImage += 1;
              return {
                images: [{ uri: 'data:image/png;base64,ZmFrZQ==', mimeType: 'image/png' }],
                traceId: 'trace-image',
                route: {
                  source: 'local',
                  model: 'image-model',
                  localModelId: 'image-model',
                },
              };
            },
          generateVideo: input.aiClientOverrides?.generateVideo
            ? async (payload: Record<string, unknown>) => {
              counters.generateVideo += 1;
              return input.aiClientOverrides?.generateVideo?.(payload) as Promise<Record<string, unknown>>;
            }
            : async () => {
              counters.generateVideo += 1;
              return {
                videos: [{ uri: 'file:///tmp/video.mp4', mimeType: 'video/mp4' }],
                traceId: 'trace-video',
                route: {
                  source: 'local',
                  model: 'video-model',
                  localModelId: 'video-model',
                },
              };
            },
          resolveRoute: input.aiClientOverrides?.resolveRoute
            ? input.aiClientOverrides.resolveRoute
            : async () => ({
              source: 'local',
              model: 'image-model',
              localModelId: 'image-model',
            }),
        },
        viewerId: 'user.test',
        viewerDisplayName: 'Test User',
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
        defaultSettings,
        selectedTarget: target,
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
        imageDependencySnapshot: input.imageDependencySnapshot ?? createDependencySnapshot({
          capability: 'image',
          status: 'ready',
        }),
        videoDependencySnapshot: input.videoDependencySnapshot ?? createDependencySnapshot({
          capability: 'video',
          status: 'ready',
        }),
        setStatusBanner: (banner: { kind: string; message: string }) => {
          statusBanners.push(banner);
        },
        isTranscribing: false,
        onOpenRuntimeSetup: () => {},
      };

      await runLocalChatTurnSend({
        context: context as never,
        isSending: false,
        setIsSending: (next) => {
          state.isSending = next;
        },
        getCurrentContextKey: () => buildLocalChatTurnContextKey({
          targetId: target.id,
          sessionId: state.selectedSessionId,
          routeBinding: null,
          activeSchedule: state.activeScheduleContext,
        }),
        registerSchedule: ({ handle, context }) => {
          state.scheduleDone = handle.done;
          state.activeScheduleContext = context;
        },
        clearScheduleByTxn: () => {},
      });

      if (state.scheduleDone) {
        await state.scheduleDone;
      }
      return {
        counters,
        state,
        statusBanners,
      };
    },
  };
}

test('send-flow explicit media request bypasses planner and delivers image', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '给我来一张海边夜景图片',
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const imageMessage = result.state.messages.find((message) => message.kind === 'image');

    assert.equal(result.counters.generateObject, 0);
    assert.equal(result.counters.generateImage, 1);
    assert.equal(imageMessage?.meta?.mediaIntentSource, 'explicit');
    assert.equal(imageMessage?.meta?.mediaPlannerTrigger, 'user-explicit');
    assert.equal(result.state.latestPromptTrace?.plannerTrigger, 'user-explicit');
    assert.equal(result.state.latestPromptTrace?.plannerUsed, false);
  });
});

test('send-flow delivers all planned text beats while session id bootstraps from empty state', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '我今天真的很累',
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('请规划这轮对话的完整 beat 计划')) {
            const object = {
              beats: [
                {
                  text: '真的辛苦你了，先让我接住你。',
                  intent: 'comfort',
                  relationMove: 'warm',
                  sceneMove: '安慰',
                  pauseMs: 0,
                },
                {
                  text: '别急着扛，我们慢慢把今天最重的那口气放下来。',
                  intent: 'invite',
                  relationMove: 'closer',
                  sceneMove: '深入',
                  pauseMs: 260,
                },
              ],
            };
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan',
              promptTraceId: 'trace-plan',
              route: {
                source: 'local-runtime',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const object = {
            turnMode: 'emotional',
            emotionalState: null,
            relevantMemoryIds: [],
            conversationDirective: null,
          };
          return {
            object,
            text: JSON.stringify(object),
            traceId: 'trace-perception',
            promptTraceId: 'trace-perception',
            route: {
              source: 'local-runtime',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
        },
      },
    });

    assert.equal(Boolean(result.state.selectedSessionId), true);
    const assistantMessages = result.state.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantMessages.length, 2);
    assert.deepEqual(
      assistantMessages.map((message) => message.content),
      [
        '真的辛苦你了，先让我接住你。',
        '别急着扛，我们慢慢把今天最重的那口气放下来。',
      ],
    );
  });
});

test('send-flow planner auto path generates image when gate passes', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '刚刚那个画面太有电影感了',
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const raw = JSON.stringify({
            version: 'v1',
            kind: 'image',
            trigger: 'scene-enhancement',
            confidence: 0.94,
            prompt: 'cinematic harbor at night, rain, neon reflections',
            reason: 'visual enhancement',
            nsfwIntent: 'none',
          });
          return {
            object: (payload.parse as (text: string) => Record<string, unknown>)(raw),
            text: raw,
            traceId: 'trace-planner-auto',
            promptTraceId: 'trace-planner-auto',
            route: {
              source: 'local',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
        },
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const imageMessage = result.state.messages.find((message) => message.kind === 'image');

    assert.equal(result.counters.generateObject, 1);
    assert.equal(result.counters.generateImage, 1);
    assert.equal(imageMessage?.meta?.mediaIntentSource, 'planner');
    assert.equal(imageMessage?.meta?.mediaPlannerTrigger, 'scene-enhancement');
    assert.equal(result.state.latestPromptTrace?.plannerUsed, true);
    assert.equal(result.state.latestPromptTrace?.plannerKind, 'image');
  });
});

test('send-flow planner does not hijack explicit voice delivery into image', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '我还想再听一句，可以直接说给我听吗？',
      defaultSettings: {
        enableVoice: true,
        voiceConversationMode: 'on',
      },
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          if (String(payload.prompt || '').includes('媒体触发 planner')) {
            const raw = JSON.stringify({
              version: 'v1',
              kind: 'image',
              trigger: 'scene-enhancement',
              confidence: 0.91,
              prompt: 'warm comforting scene indoors',
              reason: 'visual enhancement',
              nsfwIntent: 'none',
            });
            return {
              object: (payload.parse as (text: string) => Record<string, unknown>)(raw),
              text: raw,
              traceId: 'trace-planner-auto',
              promptTraceId: 'trace-planner-auto',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          throw new Error('PLANNER_SHOULD_NOT_RUN');
        },
      },
    });

    const assistantMessages = result.state.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantMessages.some((message) => message.kind === 'voice'), true);
    assert.equal(assistantMessages.some((message) => message.kind === 'image'), false);
    assert.equal(result.counters.generateObject, 1);
    assert.equal(result.counters.generateImage, 0);
  });
});

test('send-flow explicit media request still delivers image when voice-first mode is on', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '发张图给我看看',
      defaultSettings: {
        enableVoice: true,
        voiceConversationMode: 'on',
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const assistantMessages = result.state.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantMessages.some((message) => message.kind === 'image'), true);
    assert.equal(result.counters.generateImage, 1);
  });
});

test('send-flow cooldown gate skips planner invocation', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '继续聊聊刚刚那个场景',
      priorMessages: [{
        id: 'prev-image',
        role: 'assistant',
        kind: 'image',
        content: '',
        timestamp: new Date(Date.now() - 60_000),
        media: {
          uri: 'data:image/png;base64,ZmFrZQ==',
          mimeType: 'image/png',
        },
        meta: {
          mediaStatus: 'ready',
        },
      }],
      aiClientOverrides: {
        generateObject: async () => {
          throw new Error('planner should have been gated');
        },
      },
    });

    await delay(30);

    assert.equal(result.counters.generateObject, 0);
    assert.equal(result.state.messages.filter((message) => message.kind === 'image').length, 1);
    assert.equal(result.state.latestPromptTrace?.plannerBlockedReason, 'media-cooldown-active');
    assert.equal(result.state.latestPromptTrace?.plannerUsed, false);
  });
});

test('send-flow explicit request still calls runtime media image generate when dependency snapshot is stale', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '请给我发张图',
      imageDependencySnapshot: createDependencySnapshot({
        capability: 'image',
        status: 'missing',
      }),
      aiClientOverrides: {
        generateObject: async () => {
          throw new Error('planner should not run for explicit request');
        },
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const imageMessage = result.state.messages.find((message) => message.kind === 'image');

    assert.equal(result.counters.generateObject, 0);
    assert.equal(result.counters.generateImage, 1);
    assert.equal(imageMessage?.meta?.mediaStatus, 'ready');
    assert.equal(result.state.latestPromptTrace?.plannerTrigger, 'user-explicit');
  });
});

test('send-flow planner failure silently degrades to text-only', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '这个场景挺有画面感',
      aiClientOverrides: {
        generateObject: async () => {
          throw new Error('planner exploded');
        },
      },
    });

    await delay(30);

    assert.equal(result.counters.generateObject, 1);
    assert.equal(result.counters.generateImage, 0);
    assert.equal(result.state.messages.some((message) => message.kind === 'image' || message.kind === 'video'), false);
    assert.equal(result.state.messages.some((message) => message.kind === 'text' && message.role === 'assistant'), true);
    assert.equal(String(result.state.latestPromptTrace?.plannerBlockedReason || '').startsWith('planner-failed:'), true);
    assert.equal(result.state.latestPromptTrace?.plannerUsed, true);
    assert.equal(result.statusBanners.length, 0);
  });
});
