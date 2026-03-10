import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';
import type { ModRuntimeDependencySnapshot } from '@nimiplatform/sdk/mod/runtime';
import {
  configureLocalChatCoreQueryBridge,
  CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
  type LocalChatTarget,
} from '../src/data/index.ts';
import { FIRST_BEAT_END_MARKER } from '../src/hooks/turn-send/first-beat-reactor.ts';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/state/index.ts';
import { buildLocalChatTurnContextKey } from '../src/hooks/turn-send/context-key.ts';
import { runLocalChatTurnSend } from '../src/hooks/turn-send/send-flow.ts';
import { resetTextTurnStreamHealthForTests } from '../src/hooks/turn-send/text-turn-runner.ts';
import { resolveStageConversationSlice } from '../src/components/layout/stage-dialogue-card.tsx';
import { resetLocalChatConversationLedgerForTests } from '../src/session-store.ts';

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
      textDelta: `${text}${FIRST_BEAT_END_MARKER}`,
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

function parsePromptUserText(prompt: string): string {
  const match = prompt.match(/userText=(.+)/);
  if (match?.[1]) {
    return match[1].trim();
  }
  const legacyMatch = prompt.match(/用户输入=(.+)/);
  return legacyMatch?.[1]?.trim() || '';
}

function defaultPerceptionObject(prompt: string): Record<string, unknown> {
  const userText = parsePromptUserText(prompt);
  if (/语音/u.test(userText)) {
    return {
      turnMode: 'explicit-voice',
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }
  if (/图片|发图|来一张|看看/u.test(userText)) {
    return {
      turnMode: 'explicit-media',
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }
  if (/你好|在吗/u.test(userText)) {
    return {
      turnMode: 'checkin',
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }
  if (/累|辛苦/u.test(userText)) {
    return {
      turnMode: 'emotional',
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }
  return {
    turnMode: 'information',
    emotionalState: null,
    relevantMemoryIds: [],
    conversationDirective: null,
  };
}

function defaultTailPlanObject(prompt: string): Record<string, unknown> {
  const turnMode = prompt.match(/turnMode=([^\n]+)/)?.[1]?.trim() || 'information';
  const userText = parsePromptUserText(prompt);
  if (turnMode === 'explicit-media') {
    return {
      beats: [{
        text: '我给你挑一张最贴现在气氛的。',
        intent: 'media',
        relationMove: 'friendly',
        sceneMove: 'visual',
        pauseMs: 520,
        assetRequest: {
          kind: 'image',
          prompt: 'cinematic night harbor portrait',
        },
      }],
    };
  }
  if (turnMode === 'explicit-voice') {
    return {
      beats: [{
        text: '那我用语音慢慢跟你说。',
        intent: 'invite',
        relationMove: 'friendly',
        sceneMove: 'voice',
        pauseMs: 320,
      }],
    };
  }
  if (/你好/u.test(userText)) {
    return {
      beats: [{
        text: '你好，今天过得怎么样？',
        intent: 'answer',
        relationMove: 'friendly',
        sceneMove: '打招呼',
        pauseMs: 260,
      }],
    };
  }
  if (/累/u.test(userText)) {
    return {
      beats: [
        {
          text: '真的辛苦你了，先让我接住你。',
          intent: 'comfort',
          relationMove: 'warm',
          sceneMove: '安慰',
          pauseMs: 260,
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
  }
  return {
    beats: [{
      text: '我把刚刚那个感觉接着往下说给你。',
      intent: 'answer',
      relationMove: 'friendly',
      sceneMove: 'chat',
      pauseMs: 260,
    }],
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
    resetTextTurnStreamHealthForTests();
    await resetLocalChatConversationLedgerForTests();
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
    sendPhase: 'idle' as 'idle' | 'awaiting-first-beat' | 'streaming-first-beat' | 'planning-tail' | 'delivering-tail',
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
      state.sendPhase = 'idle';
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
      const isPerceptionPrompt = (payload: Record<string, unknown>) =>
        String(payload.prompt || '').includes('你是一个对话感知模块');
      const isTailPlanPrompt = (payload: Record<string, unknown>) =>
        String(payload.prompt || '').includes('请规划这轮对话在首拍之后的 tail beat 计划');
      const context = {
        aiClient: {
          streamText: input.aiClientOverrides?.streamText
            ? input.aiClientOverrides.streamText
            : createTextStream('这是一条正常的文字回复。'),
          generateText: input.aiClientOverrides?.generateText
            ? input.aiClientOverrides.generateText
            : async () => ({
              text: `fallback text reply${FIRST_BEAT_END_MARKER}`,
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
              } else if (isPerceptionPrompt(payload)) {
                const object = defaultPerceptionObject(String(payload.prompt || ''));
                return {
                  object,
                  text: JSON.stringify(object),
                  traceId: 'trace-perception-default',
                  promptTraceId: 'trace-perception-default',
                  route: {
                    source: 'local',
                    model: 'chat-model',
                    localModelId: 'chat-model',
                  },
                };
              } else if (isTailPlanPrompt(payload)) {
                const object = defaultTailPlanObject(String(payload.prompt || ''));
                return {
                  object,
                  text: JSON.stringify(object),
                  traceId: 'trace-plan-default',
                  promptTraceId: 'trace-plan-default',
                  route: {
                    source: 'local',
                    model: 'chat-model',
                    localModelId: 'chat-model',
                  },
                };
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
        setSendPhase: (next) => {
          state.sendPhase = next;
          state.isSending = next !== 'idle';
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

test('send-flow ignores composer media marker on plain greeting turns', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '你好',
      imageDependencySnapshot: createDependencySnapshot({
        capability: 'image',
        status: 'missing',
      }),
      aiClientOverrides: {
        streamText: createTextStream('你好，今天过得怎么样？'),
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const object = {
              beats: [{
                text: '你好，今天过得怎么样？',
                intent: 'answer',
                relationMove: 'friendly',
                sceneMove: '打招呼',
                pauseMs: 0,
                assetRequest: {
                  kind: 'image',
                  prompt: 'warm greeting portrait',
                },
              }],
            };
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan-greeting',
              promptTraceId: 'trace-plan-greeting',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const object = {
            turnMode: 'checkin',
            emotionalState: null,
            relevantMemoryIds: [],
            conversationDirective: null,
          };
          return {
            object,
            text: JSON.stringify(object),
            traceId: 'trace-perception-greeting',
            promptTraceId: 'trace-perception-greeting',
            route: {
              source: 'local',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
        },
      },
    });

    const assistantMessages = result.state.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantMessages.some((message) => message.kind === 'image'), false);
    assert.equal(assistantMessages.some((message) => String(message.content || '').includes('图片发送暂时不可用')), false);
    assert.equal(assistantMessages[0]?.content, '你好，今天过得怎么样？');
  });
});

test('send-flow delivers all planned text beats while session id bootstraps from empty state', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '我今天真的很累',
      aiClientOverrides: {
        streamText: createTextStream('真的辛苦你了，先让我接住你。'),
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const object = {
              beats: [
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
    harness.target.referenceImageUrl = 'https://example.com/reference-image.png';
    let capturedImagePayload: Record<string, unknown> | null = null;
    const result = await harness.execute({
      userText: '刚刚那个画面太有电影感了',
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-auto',
              promptTraceId: 'trace-perception-auto',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const object = defaultTailPlanObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan-auto',
              promptTraceId: 'trace-plan-auto',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
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
        generateImage: async (payload: Record<string, unknown>) => {
          capturedImagePayload = payload;
          return {
            images: [{ uri: 'data:image/png;base64,ZmFrZQ==', mimeType: 'image/png' }],
            traceId: 'trace-image-with-reference',
            route: {
              source: 'local',
              model: 'image-model',
              localModelId: 'image-model',
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
    assert.deepEqual(capturedImagePayload?.referenceImages, ['https://example.com/reference-image.png']);
  });
});

test('send-flow injects restrained content boundary into first-beat and tail prompts', async () => {
  await withSendFlowHarness(async (harness) => {
    let firstBeatPrompt = '';
    let tailPrompt = '';
    const result = await harness.execute({
      userText: '你刚刚那句也太撩了',
      defaultSettings: {
        visualComfortLevel: 'restrained-visuals',
      },
      aiClientOverrides: {
        streamText: async function* (payload: Record<string, unknown>) {
          firstBeatPrompt = String(payload.prompt || '');
          yield {
            type: 'text_delta' as const,
            textDelta: `我先接住你这句。${FIRST_BEAT_END_MARKER}`,
          };
          yield {
            type: 'done' as const,
          };
        },
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-restrained',
              promptTraceId: 'trace-perception-restrained',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            tailPrompt = prompt;
            const object = defaultTailPlanObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan-restrained',
              promptTraceId: 'trace-plan-restrained',
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
    assert.equal(assistantMessages.some((message) => message.kind === 'text'), true);
    assert.match(firstBeatPrompt, /用户当前选择克制风格/u);
    assert.match(firstBeatPrompt, /不要输出色情、裸露、性暗示/u);
    assert.match(tailPrompt, /## Content Boundary/u);
    assert.match(tailPrompt, /用户当前选择克制风格/u);
  });
});

test('send-flow planner auto path generates video with reference image content when available', async () => {
  await withSendFlowHarness(async (harness) => {
    harness.target.referenceImageUrl = 'https://example.com/reference-video.png';
    let capturedVideoPayload: Record<string, unknown> | null = null;
    const result = await harness.execute({
      userText: '这个片段要是能动起来就更有感觉了',
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-video-auto',
              promptTraceId: 'trace-perception-video-auto',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const object = defaultTailPlanObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan-video-auto',
              promptTraceId: 'trace-plan-video-auto',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const raw = JSON.stringify({
            version: 'v1',
            kind: 'video',
            trigger: 'scene-enhancement',
            confidence: 0.95,
            prompt: 'cinematic harbor at night, rain, neon reflections, subtle motion',
            reason: 'motion enhancement',
            nsfwIntent: 'none',
          });
          return {
            object: (payload.parse as (text: string) => Record<string, unknown>)(raw),
            text: raw,
            traceId: 'trace-video-planner-auto',
            promptTraceId: 'trace-video-planner-auto',
            route: {
              source: 'local',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
        },
        generateVideo: async (payload: Record<string, unknown>) => {
          capturedVideoPayload = payload;
          return {
            videos: [{ uri: 'file:///tmp/reference-video.mp4', mimeType: 'video/mp4' }],
            traceId: 'trace-video-with-reference',
            route: {
              source: 'local',
              model: 'video-model',
              localModelId: 'video-model',
            },
          };
        },
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'video'));
    const videoMessage = result.state.messages.find((message) => message.kind === 'video');

    assert.equal(result.counters.generateObject, 1);
    assert.equal(result.counters.generateVideo, 1);
    assert.equal(videoMessage?.meta?.mediaIntentSource, 'planner');
    assert.equal(videoMessage?.meta?.mediaPlannerTrigger, 'scene-enhancement');
    assert.equal(result.state.latestPromptTrace?.plannerUsed, true);
    assert.equal(result.state.latestPromptTrace?.plannerKind, 'video');
    assert.equal(capturedVideoPayload?.mode, 'i2v-reference');
    assert.equal(Array.isArray(capturedVideoPayload?.content), true);
    assert.equal(capturedVideoPayload?.content?.[0]?.type, 'text');
    assert.equal(capturedVideoPayload?.content?.[0]?.role, 'prompt');
    assert.equal(
      String(capturedVideoPayload?.content?.[0]?.text || '').includes('请生成一段延续当前聊天场景'),
      true,
    );
    assert.deepEqual(capturedVideoPayload?.content?.[1], {
      type: 'image_url',
      role: 'reference_image',
      imageUrl: 'https://example.com/reference-video.png',
    });
  });
});

test('send-flow planner does not hijack explicit voice delivery into image', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '我还想再听一句，可以直接说给我听吗？',
      defaultSettings: {
        voiceConversationMode: 'on',
      },
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('媒体触发 planner')) {
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
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-voice',
              promptTraceId: 'trace-perception-voice',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const object = defaultTailPlanObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-plan-voice',
              promptTraceId: 'trace-plan-voice',
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
        voiceConversationMode: 'on',
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const assistantMessages = result.state.messages.filter((message) => message.role === 'assistant');
    assert.equal(assistantMessages.some((message) => message.kind === 'image'), true);
    assert.equal(result.counters.generateImage, 1);
  });
});

test('send-flow explicit media request still delivers image when turn composer fails', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '发张图给我看看',
      aiClientOverrides: {
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-explicit-media',
              promptTraceId: 'trace-perception-explicit-media',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          if (prompt.includes('请规划这轮对话在首拍之后的 tail beat 计划')) {
            const error = new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED') as Error & Record<string, unknown>;
            error.failureStage = 'parse';
            error.reasonCode = 'LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT';
            error.traceId = 'trace-plan-explicit-media';
            error.rawTextPreview = '{"beats":[';
            error.rawTextChars = 10;
            error.errorName = 'Error';
            throw error;
          }
          throw new Error('PLANNER_SHOULD_NOT_RUN');
        },
      },
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const imageMessage = result.state.messages.find((message) => message.kind === 'image');

    assert.equal(imageMessage?.meta?.mediaIntentSource, 'explicit');
    assert.equal(imageMessage?.meta?.mediaPlannerTrigger, 'user-explicit');
    assert.equal(result.counters.generateImage, 1);
    assert.equal(result.state.latestPromptTrace?.mediaDecisionSource, 'explicit');
    assert.equal(result.state.latestPromptTrace?.mediaExecutionStatus, 'ready');
  });
});

test('send-flow explicit media image keeps turn metadata so stage slice includes it', async () => {
  await withSendFlowHarness(async (harness) => {
    const result = await harness.execute({
      userText: '给我发张你那边的照片',
    });

    await waitFor(() => result.state.messages.some((message) => message.kind === 'image'));
    const imageMessage = result.state.messages.find((message) => message.kind === 'image');
    const slice = resolveStageConversationSlice({
      messages: result.state.messages as never,
      sendPhase: 'idle',
    });

    assert.equal(Boolean(imageMessage?.meta?.turnId), true);
    assert.equal(Boolean(imageMessage?.meta?.beatIndex !== undefined), true);
    assert.equal(
      slice.assistantMessages.some((message) => message.id === imageMessage?.id),
      true,
    );
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
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('媒体触发 planner')) {
            throw new Error('planner should have been gated');
          }
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-cooldown',
              promptTraceId: 'trace-perception-cooldown',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const object = defaultTailPlanObject(prompt);
          return {
            object,
            text: JSON.stringify(object),
            traceId: 'trace-plan-cooldown',
            promptTraceId: 'trace-plan-cooldown',
            route: {
              source: 'local',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
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
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('媒体触发 planner')) {
            throw new Error('planner should not run for explicit request');
          }
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-explicit',
              promptTraceId: 'trace-perception-explicit',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const object = defaultTailPlanObject(prompt);
          return {
            object,
            text: JSON.stringify(object),
            traceId: 'trace-plan-explicit',
            promptTraceId: 'trace-plan-explicit',
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
        generateObject: async (payload: Record<string, unknown>) => {
          const prompt = String(payload.prompt || '');
          if (prompt.includes('媒体触发 planner')) {
            throw new Error('planner exploded');
          }
          if (prompt.includes('你是一个对话感知模块')) {
            const object = defaultPerceptionObject(prompt);
            return {
              object,
              text: JSON.stringify(object),
              traceId: 'trace-perception-planner-fail',
              promptTraceId: 'trace-perception-planner-fail',
              route: {
                source: 'local',
                model: 'chat-model',
                localModelId: 'chat-model',
              },
            };
          }
          const object = defaultTailPlanObject(prompt);
          return {
            object,
            text: JSON.stringify(object),
            traceId: 'trace-plan-planner-fail',
            promptTraceId: 'trace-plan-planner-fail',
            route: {
              source: 'local',
              model: 'chat-model',
              localModelId: 'chat-model',
            },
          };
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
