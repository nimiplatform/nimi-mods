import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logging.js', () => ({
  createKBFlowId: () => 'kb-flow-test',
  emitKBLog: () => undefined,
}));

import {
  createEmptyAIConfig,
  type AIConfig,
  type AISnapshot,
  type ModRuntimeClient,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod';
import { createLlmClientAdapter } from '../../src/adapters/llm-adapter.js';
import { createEmbeddingClientAdapter } from '../../src/adapters/embedding-adapter.js';
import {
  KB_AI_SCOPE_REF,
  buildKnowledgeBaseRuntimeEvidence,
  getKnowledgeBaseAIConfig,
  getKnowledgeBaseCapabilityBinding,
  hydrateKnowledgeBaseCapabilityBinding,
  recordKnowledgeBaseExecutionSnapshot,
  resolveKnowledgeBaseRoute,
  subscribeKnowledgeBaseAIConfig,
  updateKnowledgeBaseCapabilityBinding,
} from '../../src/controllers/kb-ai-config.js';
import { normalizeKBSettings } from '../../src/state/knowledge-base-store.js';

function createRuntimeClientStub(initialConfig?: AIConfig): ModRuntimeClient {
  let currentConfig = initialConfig ?? createEmptyAIConfig(KB_AI_SCOPE_REF);
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
      listScopes: vi.fn(() => [KB_AI_SCOPE_REF]),
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
    ai: {
      text: {
        generate: vi.fn(async () => ({ text: 'ok', usage: {}, trace: {} })),
        stream: vi.fn(async () => ({ stream: (async function* noop() {})() })),
      },
      embedding: {
        generate: vi.fn(async () => ({ vectors: [], usage: {}, trace: {} })),
      },
    },
  } as unknown as ModRuntimeClient;
}

describe('knowledge-base aiConfig hard cut', () => {
  it('normalizes persisted settings without retired AI route preference fields', () => {
    const normalized = normalizeKBSettings({
      chunkSize: 1024,
      topK: 9,
      queryRewritingEnabled: false,
      chatRouteSource: 'local',
      chatConnectorId: 'legacy-connector',
      chatModel: 'legacy-chat-model',
      embeddingRouteSource: 'cloud',
      embeddingConnectorId: 'legacy-embed-connector',
      embeddingModel: 'legacy-embed-model',
    } as never);

    expect(normalized).toEqual({
      chunkSize: 1024,
      chunkOverlap: 64,
      topK: 9,
      similarityThreshold: 0.3,
      maxContextChunks: 8,
      queryRewritingEnabled: false,
    });
    expect('chatRouteSource' in normalized).toBe(false);
    expect('embeddingModel' in normalized).toBe(false);
  });

  it('reads, updates, and subscribes through formal mod-scoped aiConfig authority', () => {
    const runtimeClient = createRuntimeClientStub();
    const observedConfigs: AIConfig[] = [];
    const unsubscribe = subscribeKnowledgeBaseAIConfig(runtimeClient, (config) => {
      observedConfigs.push(config);
    });

    expect(getKnowledgeBaseAIConfig(runtimeClient).scopeRef).toEqual(KB_AI_SCOPE_REF);

    const binding: RuntimeRouteBinding = {
      source: 'cloud',
      connectorId: 'conn-kb-chat',
      model: 'gpt-4o-mini',
    };
    updateKnowledgeBaseCapabilityBinding(runtimeClient, 'text.generate', binding);

    expect(getKnowledgeBaseCapabilityBinding(
      getKnowledgeBaseAIConfig(runtimeClient),
      'text.generate',
    )).toEqual(binding);
    expect(observedConfigs).toHaveLength(1);
    expect(observedConfigs[0]?.scopeRef).toEqual(KB_AI_SCOPE_REF);

    unsubscribe();
  });

  it('records formal mod-scoped aiSnapshot authority and reads latest snapshot through the same bridge', async () => {
    const runtimeClient = createRuntimeClientStub({
      ...createEmptyAIConfig(KB_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.generate': {
            source: 'cloud',
            connectorId: 'conn-kb-chat',
            model: 'gpt-4.1-mini',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    });

    const snapshot = await recordKnowledgeBaseExecutionSnapshot(runtimeClient, {
      config: getKnowledgeBaseAIConfig(runtimeClient),
      capability: 'text.generate',
      metadata: { source: 'test' },
    });

    expect(runtimeClient.aiSnapshot.record).toHaveBeenCalledTimes(1);
    expect(runtimeClient.aiSnapshot.record).toHaveBeenCalledWith(KB_AI_SCOPE_REF, snapshot);
    expect(runtimeClient.aiSnapshot.getLatest(KB_AI_SCOPE_REF)?.executionId).toBe(snapshot.executionId);
  });

  it('hydrates missing bindings from route options and persists them as live aiConfig truth', () => {
    const runtimeClient = createRuntimeClientStub();
    const routeOptions: RuntimeRouteOptionsSnapshot = {
      capability: 'text.embed',
      selected: {
        source: 'local',
        connectorId: '',
        model: 'nomic-embed-text',
        localModelId: 'nomic-embed-text-q4',
        engine: 'llama',
      },
      resolvedDefault: {
        source: 'local',
        connectorId: '',
        model: 'nomic-embed-text',
        localModelId: 'nomic-embed-text-q4',
        engine: 'llama',
      },
      local: {
        models: [{
          model: 'nomic-embed-text',
          localModelId: 'nomic-embed-text-q4',
          label: 'Nomic Embed Text',
          engine: 'llama',
        }],
      },
      connectors: [],
    };

    const hydrated = hydrateKnowledgeBaseCapabilityBinding(runtimeClient, 'text.embed', routeOptions);

    expect(hydrated).toEqual({
      source: 'local',
      connectorId: '',
      model: 'nomic-embed-text',
      localModelId: 'nomic-embed-text-q4',
      engine: 'llama',
    });
    expect(getKnowledgeBaseCapabilityBinding(
      getKnowledgeBaseAIConfig(runtimeClient),
      'text.embed',
    )).toEqual(hydrated);
  });

  it('kb chat runtime adapter reads the current formal aiConfig binding instead of legacy settings', async () => {
    let currentConfig = createEmptyAIConfig(KB_AI_SCOPE_REF);
    const runtimeClient = createRuntimeClientStub(currentConfig);
    const generate = vi.spyOn(runtimeClient.ai.text, 'generate');
    const recordSnapshot = vi.spyOn(runtimeClient.aiSnapshot, 'record');
    const llmClient = createLlmClientAdapter(runtimeClient, {
      resolveConfig: () => currentConfig,
      resolveRoute: () => resolveKnowledgeBaseRoute(currentConfig, 'text.generate'),
    });

    currentConfig = {
      ...currentConfig,
      capabilities: {
        ...currentConfig.capabilities,
        selectedBindings: {
          ...currentConfig.capabilities.selectedBindings,
          'text.generate': {
            source: 'cloud',
            connectorId: 'conn-kb-runtime',
            model: 'gpt-4.1-mini',
          },
        },
      },
    };

    await llmClient.generateText({
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(recordSnapshot).toHaveBeenCalledTimes(1);
    expect(recordSnapshot.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0] ?? 0);
    expect(recordSnapshot.mock.calls[0]?.[0]).toEqual(KB_AI_SCOPE_REF);
    expect(generate.mock.calls[0]?.[0]?.binding).toEqual({
      source: 'cloud',
      connectorId: 'conn-kb-runtime',
      model: 'gpt-4.1-mini',
    });
    expect(runtimeClient.aiSnapshot.getLatest(KB_AI_SCOPE_REF)?.conversationCapabilitySlice.capability)
      .toBe('text.generate');
  });

  it('kb chat runtime adapter fails closed when no formal aiConfig binding exists', async () => {
    const runtimeClient = createRuntimeClientStub();
    const llmClient = createLlmClientAdapter(runtimeClient, {
      resolveConfig: () => createEmptyAIConfig(KB_AI_SCOPE_REF),
      resolveRoute: () => resolveKnowledgeBaseRoute(createEmptyAIConfig(KB_AI_SCOPE_REF), 'text.generate'),
    });

    await expect(llmClient.generateText({
      systemPrompt: 'system',
      userPrompt: 'user',
    })).rejects.toThrow('KB_AI_CONFIG_BINDING_REQUIRED:text.generate');
  });

  it('kb embedding adapter records snapshot before runtime embedding execution', async () => {
    const currentConfig: AIConfig = {
      ...createEmptyAIConfig(KB_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.embed': {
            source: 'cloud',
            connectorId: 'conn-kb-embed',
            model: 'text-embedding-3-small',
          },
        },
        localProfileRefs: {},
      },
      profileOrigin: null,
    };
    const runtimeClient = createRuntimeClientStub(currentConfig);
    const generateEmbedding = vi.spyOn(runtimeClient.ai.embedding, 'generate');
    const recordSnapshot = vi.spyOn(runtimeClient.aiSnapshot, 'record');
    const embeddingClient = createEmbeddingClientAdapter(runtimeClient, {
      resolveConfig: () => currentConfig,
      resolveRoute: () => resolveKnowledgeBaseRoute(currentConfig, 'text.embed'),
    });

    await embeddingClient.generateEmbedding({
      texts: ['knowledge base'],
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(1);
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    expect(recordSnapshot.mock.invocationCallOrder[0]).toBeLessThan(generateEmbedding.mock.invocationCallOrder[0] ?? 0);
    expect(runtimeClient.aiSnapshot.getLatest(KB_AI_SCOPE_REF)?.conversationCapabilitySlice.capability)
      .toBe('text.embed');
  });

  it('builds runtimeEvidence from submit-target scheduling probe when local embedding target exists', async () => {
    const currentConfig: AIConfig = {
      ...createEmptyAIConfig(KB_AI_SCOPE_REF),
      capabilities: {
        selectedBindings: {
          'text.embed': {
            source: 'local',
            connectorId: '',
            model: 'nomic-embed-text',
            localModelId: 'nomic-embed-text-q4',
            engine: 'llama',
          },
        },
        localProfileRefs: {
          'text.embed': {
            modId: 'core:runtime',
            profileId: 'embed-local',
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

    const runtimeEvidence = await buildKnowledgeBaseRuntimeEvidence(
      runtimeClient,
      currentConfig,
      'text.embed',
    );

    expect(runtimeClient.aiConfig.probeSchedulingTarget).toHaveBeenCalledWith(KB_AI_SCOPE_REF, {
      capability: 'text.embed',
      modId: 'core:runtime',
      profileId: 'embed-local',
      resourceHint: null,
    });
    expect(runtimeEvidence?.schedulingJudgement?.state).toBe('queue_required');
  });
});
