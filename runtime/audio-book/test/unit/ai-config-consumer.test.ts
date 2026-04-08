import { describe, expect, it, vi } from 'vitest';

import {
  createEmptyAIConfig,
  type AIConfig,
  type AISnapshot,
  type ModKvStore,
  type ModRuntimeClient,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod';
import {
  AUDIO_BOOK_AI_SCOPE_REF,
  buildAudioBookRuntimeEvidence,
  clearLegacyAudioBookRouteSelections,
  deriveAudioBookRouteSelection,
  getAudioBookAIConfig,
  getAudioBookCapabilityBinding,
  hydrateAudioBookCapabilityBinding,
  materializeAudioBookBinding,
  readRequiredAudioBookExecutionBinding,
  readLegacyAudioBookRouteSelections,
  recordAudioBookExecutionSnapshot,
  requireAudioBookExecutionBinding,
  runWithAudioBookExecutionBinding,
  subscribeAudioBookAIConfig,
  updateAudioBookCapabilityBinding,
  type RouteSelection,
} from '../../src/controllers/audio-book-ai-config.js';
import { createLlmClientAdapter } from '../../src/adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../../src/adapters/tts-adapter.js';

function createRuntimeClientStub(initialConfig?: AIConfig): ModRuntimeClient {
  let currentConfig = initialConfig ?? createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF);
  const listeners = new Set<(config: AIConfig) => void>();
  const snapshotsByExecutionId = new Map<string, AISnapshot>();
  const latestSnapshotByScope = new Map<string, AISnapshot>();

  const scopeKey = (scopeRef: { kind: string; ownerId: string; surfaceId?: string }) =>
    `${scopeRef.kind}:${scopeRef.ownerId}:${scopeRef.surfaceId || ''}`;

  return {
    aiConfig: {
      get: vi.fn(() => currentConfig),
      update: vi.fn((_scopeRef, config) => {
        currentConfig = config;
        for (const listener of listeners) {
          listener(config);
        }
      }),
      listScopes: vi.fn(() => [AUDIO_BOOK_AI_SCOPE_REF]),
      probe: vi.fn(async () => ({ status: 'available', capabilityStatuses: {} })),
      probeFeasibility: vi.fn(async () => ({ status: 'available', capabilityStatuses: {}, schedulingJudgement: null })),
      probeSchedulingTarget: vi.fn(async () => null),
      subscribe: vi.fn((_scopeRef, callback) => {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      }),
    },
    aiSnapshot: {
      record: vi.fn((scopeRef, snapshot) => {
        const normalizedSnapshot = {
          ...snapshot,
          scopeRef,
        };
        snapshotsByExecutionId.set(normalizedSnapshot.executionId, normalizedSnapshot);
        latestSnapshotByScope.set(scopeKey(scopeRef), normalizedSnapshot);
      }),
      get: vi.fn((executionId) => snapshotsByExecutionId.get(executionId) || null),
      getLatest: vi.fn((scopeRef) => latestSnapshotByScope.get(scopeKey(scopeRef)) || null),
    },
  } as unknown as ModRuntimeClient;
}

function createExecutionRuntimeClientStub(initialConfig?: AIConfig) {
  const runtimeClient = createRuntimeClientStub(initialConfig) as ModRuntimeClient & Record<string, unknown>;
  const generateText = vi.fn(async () => ({
    text: '{"ok":true}',
    finishReason: 'stop' as const,
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    },
    trace: {
      traceId: 'trace-audio-book-text-generate',
    },
  }));
  const listVoices = vi.fn(async () => ({
    voices: [
      {
        voiceId: 'Cherry',
        name: 'Cherry',
        lang: 'zh',
        supportedLangs: ['zh'],
      },
    ],
    modelResolved: 'qwen3-tts-instruct-flash',
    traceId: 'trace-audio-book-list-voices',
  }));
  const synthesize = vi.fn(async () => ({
    job: {
      jobId: 'job-audio-book-synthesize',
    },
    artifacts: [
      {
        bytes: new Uint8Array([1, 2, 3, 4]),
        uri: '',
        mimeType: 'audio/mpeg',
      },
    ],
    trace: {
      traceId: 'trace-audio-book-synthesize',
    },
  }));
  const resolve = vi.fn(async () => ({
    capability: 'audio.synthesize' as const,
    source: 'cloud' as const,
    connectorId: 'formal-tts-conn',
    model: 'qwen3-tts-instruct-flash',
    provider: 'dashscope',
  }));

  runtimeClient.ai = {
    text: {
      generate: generateText,
      stream: vi.fn(),
    },
  } as any;
  runtimeClient.media = {
    tts: {
      listVoices,
      synthesize,
    },
  } as any;
  runtimeClient.route = {
    resolve,
    listOptions: vi.fn(),
    checkHealth: vi.fn(),
    describe: vi.fn(),
  } as any;

  return {
    runtimeClient: runtimeClient as ModRuntimeClient,
    generateText,
    listVoices,
    synthesize,
    resolve,
  };
}

describe('audio-book aiConfig AB-C1 hard cut', () => {
  it('reads, updates, and subscribes through formal mod-scoped aiConfig authority', () => {
    const runtimeClient = createRuntimeClientStub();
    const observedConfigs: AIConfig[] = [];
    const unsubscribe = subscribeAudioBookAIConfig(runtimeClient, (config) => {
      observedConfigs.push(config);
    });

    expect(getAudioBookAIConfig(runtimeClient).scopeRef).toEqual(AUDIO_BOOK_AI_SCOPE_REF);

    const chatBinding: RuntimeRouteBinding = {
      source: 'cloud',
      connectorId: 'conn-audio-chat',
      model: 'gpt-4.1-mini',
    };
    updateAudioBookCapabilityBinding(runtimeClient, 'text.generate', chatBinding);

    expect(getAudioBookCapabilityBinding(
      getAudioBookAIConfig(runtimeClient),
      'text.generate',
    )).toEqual(chatBinding);
    expect(observedConfigs).toHaveLength(1);
    expect(observedConfigs[0]?.scopeRef).toEqual(AUDIO_BOOK_AI_SCOPE_REF);

    unsubscribe();
  });

  it('imports legacy route selections once and clears the retired KV keys', async () => {
    const deletedKeys: string[] = [];
    const getJsonMock = vi.fn(async (key: string) => {
      if (key === 'audio-book:chat-connector') {
        return {
          connectorId: 'legacy-chat-conn',
          routeSource: 'cloud',
          model: 'gpt-4.1-mini',
        };
      }
      if (key === 'audio-book:tts-connector') {
        return {
          connectorId: 'legacy-tts-conn',
          routeSource: 'cloud',
          model: 'qwen3-tts-instruct-flash',
        };
      }
      return null;
    });
    const legacyStore: Pick<ModKvStore, 'getJson' | 'delete'> = {
      getJson: async <T>(key: string) => getJsonMock(key) as T | null,
      delete: vi.fn(async (key: string) => {
        deletedKeys.push(key);
      }),
    };

    const selections = await readLegacyAudioBookRouteSelections(legacyStore);

    expect(selections).toEqual({
      chatSelection: {
        connectorId: 'legacy-chat-conn',
        routeSource: 'cloud',
        model: 'gpt-4.1-mini',
      },
      ttsSelection: {
        connectorId: 'legacy-tts-conn',
        routeSource: 'cloud',
        model: 'qwen3-tts-instruct-flash',
      },
    });

    await clearLegacyAudioBookRouteSelections(legacyStore);

    expect(deletedKeys).toEqual([
      'audio-book:chat-connector',
      'audio-book:tts-connector',
    ]);
  });

  it('hydrates missing formal aiConfig bindings from imported legacy route selections', () => {
    const runtimeClient = createRuntimeClientStub();
    const chatRouteOptions: RuntimeRouteOptionsSnapshot = {
      capability: 'text.generate',
      selected: null,
      resolvedDefault: {
        source: 'cloud',
        connectorId: 'cloud-chat-default',
        model: 'gpt-4o-mini',
      },
      local: {
        models: [],
      },
      connectors: [{
        id: 'legacy-chat-conn',
        label: 'Legacy Chat',
        vendor: 'OpenAI',
        models: ['gpt-4.1-mini', 'gpt-4o-mini'],
      }],
    };
    const ttsRouteOptions: RuntimeRouteOptionsSnapshot = {
      capability: 'audio.synthesize',
      selected: null,
      resolvedDefault: {
        source: 'cloud',
        connectorId: 'cloud-tts-default',
        model: 'qwen3-tts-instruct',
      },
      local: {
        models: [],
      },
      connectors: [{
        id: 'legacy-tts-conn',
        label: 'Legacy TTS',
        vendor: 'DashScope',
        models: ['qwen3-tts-instruct-flash', 'qwen3-tts-instruct'],
      }],
    };

    const hydratedChatBinding = hydrateAudioBookCapabilityBinding(
      runtimeClient,
      'text.generate',
      chatRouteOptions,
      {
        connectorId: 'legacy-chat-conn',
        routeSource: 'cloud',
        model: 'gpt-4.1-mini',
      },
    );
    const hydratedTtsBinding = hydrateAudioBookCapabilityBinding(
      runtimeClient,
      'audio.synthesize',
      ttsRouteOptions,
      {
        connectorId: 'legacy-tts-conn',
        routeSource: 'cloud',
        model: 'qwen3-tts-instruct-flash',
      },
    );

    expect(hydratedChatBinding).toEqual({
      source: 'cloud',
      connectorId: 'legacy-chat-conn',
      model: 'gpt-4.1-mini',
    });
    expect(hydratedTtsBinding).toEqual({
      source: 'cloud',
      connectorId: 'legacy-tts-conn',
      model: 'qwen3-tts-instruct-flash',
    });
    expect(getAudioBookCapabilityBinding(
      getAudioBookAIConfig(runtimeClient),
      'text.generate',
    )).toEqual(hydratedChatBinding);
    expect(getAudioBookCapabilityBinding(
      getAudioBookAIConfig(runtimeClient),
      'audio.synthesize',
    )).toEqual(hydratedTtsBinding);
  });

  it('treats formal aiConfig as canonical truth once a binding exists', () => {
    const currentConfig = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.generate': {
            source: 'cloud',
            connectorId: 'formal-chat-conn',
            model: 'gpt-4.1',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const runtimeClient = createRuntimeClientStub(currentConfig);
    const updateSpy = vi.spyOn(runtimeClient.aiConfig, 'update');
    const routeOptions: RuntimeRouteOptionsSnapshot = {
      capability: 'text.generate',
      selected: null,
      resolvedDefault: {
        source: 'cloud',
        connectorId: 'legacy-chat-conn',
        model: 'gpt-4o-mini',
      },
      local: {
        models: [],
      },
      connectors: [{
        id: 'legacy-chat-conn',
        label: 'Legacy Chat',
        vendor: 'OpenAI',
        models: ['gpt-4o-mini'],
      }],
    };

    const binding = hydrateAudioBookCapabilityBinding(
      runtimeClient,
      'text.generate',
      routeOptions,
      {
        connectorId: 'legacy-chat-conn',
        routeSource: 'cloud',
        model: 'gpt-4o-mini',
      },
    );

    expect(binding).toEqual({
      source: 'cloud',
      connectorId: 'formal-chat-conn',
      model: 'gpt-4.1',
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('route editor materializes connector/model selection into formal aiConfig binding writes', () => {
    const runtimeClient = createRuntimeClientStub();
    const routeOptions: RuntimeRouteOptionsSnapshot = {
      capability: 'audio.synthesize',
      selected: null,
      resolvedDefault: {
        source: 'cloud',
        connectorId: 'cloud-tts-default',
        model: 'qwen3-tts-instruct',
      },
      local: {
        models: [],
      },
      connectors: [{
        id: 'conn-tts-editor',
        label: 'DashScope',
        vendor: 'DashScope',
        models: ['qwen3-tts-instruct-flash', 'qwen3-tts-instruct'],
      }],
    };
    const selection: RouteSelection = {
      connectorId: 'conn-tts-editor',
      routeSource: 'cloud',
      model: 'qwen3-tts-instruct-flash',
    };

    const binding = materializeAudioBookBinding(selection, routeOptions);

    expect(deriveAudioBookRouteSelection(binding, routeOptions)).toEqual(selection);

    updateAudioBookCapabilityBinding(runtimeClient, 'audio.synthesize', binding!);

    expect(runtimeClient.aiConfig.update).toHaveBeenCalledWith(
      AUDIO_BOOK_AI_SCOPE_REF,
      expect.objectContaining({
        scopeRef: AUDIO_BOOK_AI_SCOPE_REF,
        capabilities: expect.objectContaining({
          selectedBindings: expect.objectContaining({
            'audio.synthesize': {
              source: 'cloud',
              connectorId: 'conn-tts-editor',
              model: 'qwen3-tts-instruct-flash',
            },
          }),
        }),
      }),
    );
  });

  it('records formal mod-scoped aiSnapshot authority and reads latest snapshot through the same bridge', async () => {
    const runtimeClient = createRuntimeClientStub({
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.generate': {
            source: 'cloud',
            connectorId: 'conn-audio-chat',
            model: 'gpt-4.1-mini',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    });

    const snapshot = await recordAudioBookExecutionSnapshot(runtimeClient, {
      config: getAudioBookAIConfig(runtimeClient),
      capability: 'text.generate',
      metadata: { source: 'test' },
    });

    expect(runtimeClient.aiSnapshot.record).toHaveBeenCalledTimes(1);
    expect(runtimeClient.aiSnapshot.record).toHaveBeenCalledWith(AUDIO_BOOK_AI_SCOPE_REF, snapshot);
    expect(runtimeClient.aiSnapshot.getLatest(AUDIO_BOOK_AI_SCOPE_REF)?.executionId).toBe(snapshot.executionId);
  });

  it('builds runtimeEvidence from submit-target scheduling probe when local tts target exists', async () => {
    const currentConfig: AIConfig = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'audio.synthesize': {
            source: 'local',
            connectorId: '',
            model: 'qwen3-tts-local',
            localModelId: 'qwen3-tts-local-q4',
            engine: 'llama',
          },
        },
        localProfileRefs: {
          'audio.synthesize': {
            modId: 'core:runtime',
            profileId: 'audio-book-tts-local',
          },
        },
      },
      profileOrigin: null,
    };
    const runtimeClient = createRuntimeClientStub(currentConfig);
    vi.spyOn(runtimeClient.aiConfig, 'probeSchedulingTarget').mockResolvedValue({
      state: 'queue_required',
      detail: 'busy',
      occupancy: null,
      resourceWarnings: [],
    });

    const runtimeEvidence = await buildAudioBookRuntimeEvidence(
      runtimeClient,
      currentConfig,
      'audio.synthesize',
    );

    expect(runtimeClient.aiConfig.probeSchedulingTarget).toHaveBeenCalledWith(AUDIO_BOOK_AI_SCOPE_REF, {
      capability: 'audio.synthesize',
      modId: 'core:runtime',
      profileId: 'audio-book-tts-local',
      resourceHint: null,
    });
    expect(runtimeEvidence?.schedulingJudgement?.state).toBe('queue_required');
  });

  it('reads analyze execution binding from formal aiConfig', async () => {
    const config = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.generate': {
            source: 'cloud',
            connectorId: 'formal-chat-conn',
            model: 'gpt-4.1-mini',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const { runtimeClient, generateText } = createExecutionRuntimeClientStub(config);
    const binding = readRequiredAudioBookExecutionBinding(runtimeClient, 'text.generate');
    const llmClient = createLlmClientAdapter(runtimeClient, binding);

    await llmClient.generateText({
      systemPrompt: 'system',
      userPrompt: 'hello',
      temperature: 0.2,
    });

    expect(generateText).toHaveBeenCalledWith({
      input: 'hello',
      system: 'system',
      maxTokens: undefined,
      temperature: 0.2,
      binding: {
        source: 'cloud',
        connectorId: 'formal-chat-conn',
        model: 'gpt-4.1-mini',
      },
    });
  });

  it('records text.generate snapshot before execution path runtime call', async () => {
    const config = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.generate': {
            source: 'cloud',
            connectorId: 'formal-chat-conn',
            model: 'gpt-4.1-mini',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const { runtimeClient, generateText } = createExecutionRuntimeClientStub(config);
    const recordSnapshot = vi.spyOn(runtimeClient.aiSnapshot, 'record');

    await runWithAudioBookExecutionBinding(runtimeClient, {
      capability: 'text.generate',
      metadata: {
        source: 'audio-book',
        operation: 'analyze',
      },
      run: async ({ binding }) => {
        await runtimeClient.ai.text.generate({
          input: 'hello',
          system: 'system',
          binding,
        } as any);
      },
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(recordSnapshot.mock.invocationCallOrder[0]).toBeLessThan(generateText.mock.invocationCallOrder[0] ?? 0);
    expect(runtimeClient.aiSnapshot.getLatest(AUDIO_BOOK_AI_SCOPE_REF)?.conversationCapabilitySlice.capability)
      .toBe('text.generate');
  });

  it('reads tts execution bindings from formal aiConfig for preview and synthesis calls', async () => {
    const config = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'audio.synthesize': {
            source: 'cloud',
            connectorId: 'formal-tts-conn',
            model: 'qwen3-tts-instruct-flash',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const { runtimeClient, listVoices, synthesize, resolve } = createExecutionRuntimeClientStub(config);
    const binding = readRequiredAudioBookExecutionBinding(runtimeClient, 'audio.synthesize');
    const ttsClient = createTtsClientAdapter(runtimeClient, binding);

    await ttsClient.listVoices();
    await ttsClient.synthesize({
      text: 'preview sample',
      voiceId: 'Cherry',
      providerId: 'dashscope',
    });

    expect(listVoices).toHaveBeenCalledWith({
      binding: {
        source: 'cloud',
        connectorId: 'formal-tts-conn',
        model: 'qwen3-tts-instruct-flash',
      },
      model: 'qwen3-tts-instruct-flash',
    });
    expect(synthesize).toHaveBeenCalledWith({
      text: 'preview sample',
      voice: 'Cherry',
      speed: undefined,
      pitch: undefined,
      emotion: undefined,
      binding: {
        source: 'cloud',
        connectorId: 'formal-tts-conn',
        model: 'qwen3-tts-instruct-flash',
      },
      model: 'qwen3-tts-instruct-flash',
    });
    expect(resolve).toHaveBeenCalledWith({
      capability: 'audio.synthesize',
      binding: {
        source: 'cloud',
        connectorId: 'formal-tts-conn',
        model: 'qwen3-tts-instruct-flash',
      },
    });
  });

  it('records audio.synthesize snapshot before execution path runtime call', async () => {
    const config = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'audio.synthesize': {
            source: 'cloud',
            connectorId: 'formal-tts-conn',
            model: 'qwen3-tts-instruct-flash',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const { runtimeClient, synthesize } = createExecutionRuntimeClientStub(config);
    const recordSnapshot = vi.spyOn(runtimeClient.aiSnapshot, 'record');

    await runWithAudioBookExecutionBinding(runtimeClient, {
      capability: 'audio.synthesize',
      metadata: {
        source: 'audio-book',
        operation: 'preview',
      },
      run: async ({ binding }) => {
        await runtimeClient.media.tts.synthesize({
          text: 'preview sample',
          voice: 'Cherry',
          binding,
          model: binding.model,
        } as any);
      },
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(recordSnapshot.mock.invocationCallOrder[0]).toBeLessThan(synthesize.mock.invocationCallOrder[0] ?? 0);
    expect(runtimeClient.aiSnapshot.getLatest(AUDIO_BOOK_AI_SCOPE_REF)?.conversationCapabilitySlice.capability)
      .toBe('audio.synthesize');
  });

  it('fails closed when required execution bindings are missing from formal aiConfig', () => {
    const emptyConfig = createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF);

    expect(() => requireAudioBookExecutionBinding(emptyConfig, 'text.generate'))
      .toThrow('AUDIO_BOOK_TEXT_GENERATE_BINDING_REQUIRED');
    expect(() => requireAudioBookExecutionBinding(emptyConfig, 'audio.synthesize'))
      .toThrow('AUDIO_BOOK_AUDIO_SYNTHESIZE_BINDING_REQUIRED');
  });

  it('fails closed before snapshot record when execution binding is missing', async () => {
    const runtimeClient = createRuntimeClientStub();

    await expect(runWithAudioBookExecutionBinding(runtimeClient, {
      capability: 'audio.synthesize',
      run: async () => undefined,
    })).rejects.toThrow('AUDIO_BOOK_AUDIO_SYNTHESIZE_BINDING_REQUIRED');
    expect(runtimeClient.aiSnapshot.record).not.toHaveBeenCalled();
  });

  it('ignores projected legacy bindings when formal aiConfig already owns execution', async () => {
    const formalBinding: RuntimeRouteBinding = {
      source: 'cloud',
      connectorId: 'formal-tts-conn',
      model: 'formal-tts-model',
    };
    const config = {
      ...createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'audio.synthesize': formalBinding,
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    } satisfies AIConfig;
    const { runtimeClient, synthesize } = createExecutionRuntimeClientStub(config);
    const projectedBinding = materializeAudioBookBinding(
      {
        connectorId: 'legacy-tts-conn',
        routeSource: 'cloud',
        model: 'legacy-tts-model',
      },
      {
        capability: 'audio.synthesize',
        selected: null,
        resolvedDefault: {
          source: 'cloud',
          connectorId: 'legacy-tts-default',
          model: 'legacy-tts-default-model',
        },
        local: {
          models: [],
        },
        connectors: [{
          id: 'legacy-tts-conn',
          label: 'Legacy TTS',
          vendor: 'DashScope',
          models: ['legacy-tts-model'],
        }],
      },
    );
    const binding = readRequiredAudioBookExecutionBinding(runtimeClient, 'audio.synthesize');
    const ttsClient = createTtsClientAdapter(runtimeClient, binding);

    expect(projectedBinding).toEqual({
      source: 'cloud',
      connectorId: 'legacy-tts-conn',
      model: 'legacy-tts-model',
    });
    expect(binding).toEqual(formalBinding);

    await ttsClient.synthesize({
      text: 'full synthesis sample',
      voiceId: 'Cherry',
      providerId: 'dashscope',
    });

    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({
      binding: formalBinding,
      model: 'formal-tts-model',
    }));
    expect(synthesize).not.toHaveBeenCalledWith(expect.objectContaining({
      binding: projectedBinding,
      model: 'legacy-tts-model',
    }));
  });
});
