import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalChatAiClient, describeLocalChatGenerateObjectFailure, } from '../src/runtime-ai-client.ts';
import { type RuntimeRouteBinding, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
function createBinding(): RuntimeRouteBinding {
    return {
        source: 'cloud',
        connectorId: 'connector-1',
        model: 'gemini-2.5-flash',
    };
}
function createResolvedRoute() {
    return {
        source: 'cloud' as const,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        connectorId: 'connector-1',
    };
}
test('local-chat runtime ai client: resolveRoute preserves go-runtime metadata', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => ({
                source: 'local' as const,
                provider: 'local',
                model: 'qwen-tts',
                connectorId: '',
                localModelId: 'qwen-tts',
                goRuntimeLocalModelId: 'go-qwen-tts',
                goRuntimeStatus: 'active' as const,
            }),
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const route = await aiClient.resolveRoute({
        capability: 'audio.synthesize',
        routeBinding: {
            source: 'local',
            connectorId: '',
            model: 'qwen-tts',
            localModelId: 'qwen-tts',
        },
    });
    assert.equal(route.localModelId, 'qwen-tts');
    assert.equal(route.goRuntimeLocalModelId, 'go-qwen-tts');
    assert.equal(route.goRuntimeStatus, 'active');
});
test('local-chat runtime ai client: streamText rethrows runtime stream errors', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async () => {
                    throw new Error('generate should not be called');
                },
                stream: async () => ({
                    stream: (async function* () {
                        yield {
                            type: 'error' as const,
                            error: new Error('AI_PROVIDER_TIMEOUT'),
                        };
                    })(),
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    await assert.rejects(async () => {
        for await (const _event of aiClient.streamText({
            prompt: '你好',
            routeBinding: createBinding(),
        })) {
            // no-op
        }
    }, /AI_PROVIDER_TIMEOUT/);
});
test('local-chat runtime ai client: text calls pass timeoutMs through to runtime client', async () => {
    const captured: {
        generateTimeoutMs?: number;
        streamTimeoutMs?: number;
    } = {};
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async (input: {
                    timeoutMs?: number;
                }) => {
                    captured.generateTimeoutMs = input.timeoutMs;
                    return {
                        text: 'ok',
                        trace: {
                            traceId: 'trace-generate',
                        },
                    };
                },
                stream: async (input: {
                    timeoutMs?: number;
                }) => {
                    captured.streamTimeoutMs = input.timeoutMs;
                    return {
                        stream: (async function* () {
                            yield {
                                type: 'finish' as const,
                                finishReason: 'stop',
                                usage: {},
                                trace: {
                                    traceId: 'trace-stream',
                                },
                            };
                        })(),
                    };
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const streamEvents: Array<{
        type: string;
        traceId?: string;
        finishReason?: string;
    }> = [];
    await aiClient.generateText({
        prompt: '你好',
        timeoutMs: 4321,
        routeBinding: createBinding(),
    });
    for await (const event of aiClient.streamText({
        prompt: '你好',
        timeoutMs: 8765,
        routeBinding: createBinding(),
    })) {
        streamEvents.push(event);
    }
    assert.equal(captured.generateTimeoutMs, 4321);
    assert.equal(captured.streamTimeoutMs, 8765);
    assert.equal(streamEvents.at(-1)?.type, 'done');
    assert.equal(streamEvents.at(-1)?.traceId, 'trace-stream');
    assert.equal(streamEvents.at(-1)?.finishReason, 'stop');
});
test('local-chat runtime ai client: generateObject repairs missing closing containers', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async () => ({
                    text: '{"beats":[{"text":"先让我接住你。","intent":"comfort"},{"text":"慢慢说，我听着"}]',
                    trace: {
                        traceId: 'trace-broken-json-1',
                    },
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateObject({
        prompt: 'repair me',
        routeBinding: createBinding(),
    });
    assert.equal(Array.isArray(result.object.beats), true);
    assert.equal((result.object.beats as Array<Record<string, unknown>>).length, 2);
});
test('local-chat runtime ai client: generateObject repairs bare string values', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async () => ({
                    text: '{"turnMode":"emotional","emotionalState":{"detected":疲惫,"cause":"近期压力太大","suggestedApproach":empathize-first},"relevantMemoryIds":[],"conversationDirective":null}',
                    trace: {
                        traceId: 'trace-broken-json-2',
                    },
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateObject({
        prompt: 'repair me too',
        routeBinding: createBinding(),
    });
    assert.deepEqual(result.object.emotionalState, {
        detected: '疲惫',
        cause: '近期压力太大',
        suggestedApproach: 'empathize-first',
    });
});
test('local-chat runtime ai client: generateObject repairs broken strings with raw newline and dangling escape', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async () => ({
                    text: '{"beats":[{"text":"先喝口热水\\\n再慢慢说","intent":"comfort"}]',
                    trace: {
                        traceId: 'trace-broken-json-3',
                    },
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateObject({
        prompt: 'repair strings',
        routeBinding: createBinding(),
    });
    const beats = result.object.beats as Array<Record<string, unknown>>;
  assert.equal(beats.length, 1);
  assert.equal(String(beats[0]?.text || '').includes('再慢慢说'), true);
});
test('local-chat runtime ai client: generateObject repairs missing colon between key and value', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        ai: {
            text: {
                generate: async () => ({
                    text: '{"beats":[{"text":"嗨，我刚随手拍了一张，你瞧瞧。","pauseMs":1200,"assetRequest" "image"}]}',
                    trace: {
                        traceId: 'trace-broken-json-4',
                    },
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateObject({
        prompt: 'repair missing colon',
        routeBinding: createBinding(),
    });
    const beats = result.object.beats as Array<Record<string, unknown>>;
    assert.equal(beats.length, 1);
    assert.equal(beats[0]?.assetRequest, 'image');
});
test('local-chat runtime ai client: generateObject exposes call failure metadata', async () => {
    const runtimeClient = {
        ai: {
            text: {
                generate: async () => {
                    const error = new Error('provider request failed') as Error & Record<string, unknown>;
                    error.reasonCode = 'AI_INPUT_INVALID';
                    error.actionHint = 'check_input_and_extensions';
                    error.traceId = 'trace-call-failed';
                    throw error;
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    let failure: ReturnType<typeof describeLocalChatGenerateObjectFailure> | null = null;
    await assert.rejects(async () => {
        try {
            await aiClient.generateObject({
                prompt: '需要结构化返回',
                routeBinding: createBinding(),
            });
        }
        catch (error) {
            failure = describeLocalChatGenerateObjectFailure(error);
            throw error;
        }
    }, /LOCAL_CHAT_AI_GENERATE_OBJECT_CALL_FAILED/);
    assert.equal(failure?.failureStage, 'call');
    assert.equal(failure?.reasonCode, 'AI_INPUT_INVALID');
    assert.equal(failure?.actionHint, 'check_input_and_extensions');
    assert.equal(failure?.traceId, 'trace-call-failed');
    assert.equal(failure?.finishReason, null);
    assert.equal(failure?.rawTextPreview, null);
    assert.equal(failure?.rawTextChars, 0);
});
test('local-chat runtime ai client: generateObject exposes parse failure metadata and raw text preview', async () => {
    const runtimeClient = {
        ai: {
            text: {
                generate: async () => ({
                    text: '先随便说一句，再给你 JSON',
                    finishReason: 'length',
                    trace: {
                        traceId: 'trace-invalid-json',
                    },
                }),
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    let failure: ReturnType<typeof describeLocalChatGenerateObjectFailure> | null = null;
    await assert.rejects(async () => {
        try {
            await aiClient.generateObject({
                prompt: '需要结构化返回',
                parse: () => {
                    throw new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT');
                },
                routeBinding: createBinding(),
            });
        }
        catch (error) {
            failure = describeLocalChatGenerateObjectFailure(error);
            throw error;
        }
    }, /LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED/);
    assert.equal(failure?.failureStage, 'parse');
    assert.equal(failure?.reasonCode, 'LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT');
    assert.equal(failure?.actionHint, null);
    assert.equal(failure?.traceId, 'trace-invalid-json');
    assert.equal(failure?.finishReason, 'length');
    assert.equal(failure?.rawTextPreview, '先随便说一句，再给你 JSON');
    assert.equal(failure?.rawTextChars, '先随便说一句，再给你 JSON'.length);
});
test('local-chat runtime ai client: synthesizeSpeech prefers stream and falls back to bytes', async () => {
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        media: {
            tts: {
                stream: async () => (async function* () {
                    yield {
                        artifactId: 'artifact-1',
                        mimeType: 'audio/mpeg',
                        sequence: '1',
                        chunk: Uint8Array.from([1, 2]),
                        eof: false,
                        routeDecision: {} as never,
                        modelResolved: 'qwen3-tts',
                        traceId: 'trace-stream',
                    };
                    yield {
                        artifactId: 'artifact-1',
                        mimeType: 'audio/mpeg',
                        sequence: '2',
                        chunk: Uint8Array.from([3, 4]),
                        eof: true,
                        routeDecision: {} as never,
                        modelResolved: 'qwen3-tts',
                        traceId: 'trace-stream',
                    };
                })(),
                synthesize: async () => {
                    throw new Error('fallback should not be used');
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.synthesizeSpeech({
        text: '你好',
        routeBinding: createBinding(),
    });
    assert.equal(result.usedStream, true);
    assert.deepEqual(Array.from(result.audioBytes || []), [1, 2, 3, 4]);
    assert.equal(result.mimeType, 'audio/mpeg');
    assert.equal(result.traceId, 'trace-stream');
});
test('local-chat runtime ai client: synthesizeSpeech falls back to unary tts when stream fails', async () => {
    let synthesizeCalled = false;
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        media: {
            tts: {
                stream: async () => {
                    throw new Error('stream unavailable');
                },
                synthesize: async () => {
                    synthesizeCalled = true;
                    return {
                        artifacts: [{
                                uri: '',
                                bytes: Uint8Array.from([9, 8, 7]),
                                mimeType: 'audio/wav',
                            }],
                        trace: {
                            traceId: 'trace-unary',
                        },
                    };
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.synthesizeSpeech({
        text: '你好',
        routeBinding: createBinding(),
    });
    assert.equal(synthesizeCalled, true);
    assert.equal(result.usedStream, false);
    assert.deepEqual(Array.from(result.audioBytes || []), [9, 8, 7]);
    assert.equal(result.mimeType, 'audio/wav');
    assert.equal(result.traceId, 'trace-unary');
});
test('local-chat runtime ai client: local z-image route injects companions and fixed local overrides', async () => {
    const captured: {
        model?: string;
        extensions?: Record<string, unknown>;
        timeoutMs?: number;
    } = {};
    let listedArtifactsCount = 0;
    const runtimeClient = {
        route: {
            resolve: async () => ({
                source: 'local' as const,
                provider: 'localai',
                engine: 'localai',
                model: 'localai/z_image_turbo',
                localModelId: '01-model',
                connectorId: '',
            }),
        },
        local: {
            listArtifacts: async () => {
                listedArtifactsCount += 1;
                return [
                    {
                        localArtifactId: 'vae-1',
                        artifactId: 'z_image_ae',
                        kind: 'vae',
                        engine: 'localai',
                        entry: 'vae/diffusion_pytorch_model.safetensors',
                        files: ['vae/diffusion_pytorch_model.safetensors'],
                        license: 'apache-2.0',
                        source: { repo: 'repo', revision: 'main' },
                        hashes: {},
                        status: 'installed',
                        installedAt: '2026-03-12T00:00:00Z',
                        updatedAt: '2026-03-12T00:00:00Z',
                        metadata: { family: 'z-image' },
                    },
                    {
                        localArtifactId: 'llm-1',
                        artifactId: 'qwen3_4b_companion',
                        kind: 'llm',
                        engine: 'localai',
                        entry: 'Qwen3-4B-Q4_K_M.gguf',
                        files: ['Qwen3-4B-Q4_K_M.gguf'],
                        license: 'apache-2.0',
                        source: { repo: 'repo', revision: 'main' },
                        hashes: {},
                        status: 'installed',
                        installedAt: '2026-03-12T00:00:00Z',
                        updatedAt: '2026-03-12T00:00:00Z',
                        metadata: { family: 'z-image' },
                    },
                ];
            },
        },
        media: {
            image: {
                generate: async (input: {
                    model?: string;
                    extensions?: Record<string, unknown>;
                    timeoutMs?: number;
                }) => {
                    captured.model = input.model;
                    captured.extensions = input.extensions;
                    captured.timeoutMs = input.timeoutMs;
                    return {
                        artifacts: [{
                                bytes: Uint8Array.from([1, 2, 3]),
                                mimeType: 'image/png',
                            }],
                        trace: {
                            traceId: 'trace-local-image',
                        },
                    };
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateImage({
        prompt: '生成一张图',
        routeBinding: {
            source: 'local',
            connectorId: '',
            model: 'z_image_turbo',
            localModelId: 'z_image_turbo',
        },
        extensions: {
            style: 'photorealistic',
            aspectRatio: '9:16',
        },
    });
    assert.equal(listedArtifactsCount, 1);
    assert.equal(captured.model, 'localai/z_image_turbo');
    assert.equal(captured.extensions?.size, '512x512');
    assert.equal('aspectRatio' in (captured.extensions || {}), false);
    assert.equal(captured.extensions?.style, 'photorealistic');
    assert.deepEqual(captured.extensions?.profile_overrides, { step: 8 });
    assert.deepEqual(captured.extensions?.components, [
        { slot: 'vae_path', localArtifactId: 'vae-1' },
        { slot: 'llm_path', localArtifactId: 'llm-1' },
    ]);
    assert.equal(captured.timeoutMs, 600000);
    assert.equal(result.traceId, 'trace-local-image');
    assert.equal(result.images.length, 1);
});
test('local-chat runtime ai client: cloud image route keeps original request payload', async () => {
    const captured: {
        model?: string;
        extensions?: Record<string, unknown>;
        timeoutMs?: number;
    } = {};
    let listedArtifactsCount = 0;
    const runtimeClient = {
        route: {
            resolve: async () => createResolvedRoute(),
        },
        local: {
            listArtifacts: async () => {
                listedArtifactsCount += 1;
                return [];
            },
        },
        media: {
            image: {
                generate: async (input: {
                    model?: string;
                    extensions?: Record<string, unknown>;
                    timeoutMs?: number;
                }) => {
                    captured.model = input.model;
                    captured.extensions = input.extensions;
                    captured.timeoutMs = input.timeoutMs;
                    return {
                        artifacts: [{
                                uri: 'https://example.com/image.png',
                                mimeType: 'image/png',
                            }],
                        trace: {
                            traceId: 'trace-cloud-image',
                        },
                    };
                },
            },
        },
    } as unknown as ModRuntimeClient;
    const aiClient = createLocalChatAiClient(runtimeClient);
    const result = await aiClient.generateImage({
        prompt: '生成一张云端图',
        routeBinding: createBinding(),
        extensions: {
            size: '1536x1024',
            style: 'cinematic',
        },
    });
    assert.equal(listedArtifactsCount, 0);
    assert.equal(captured.model, 'gemini-2.5-flash');
    assert.deepEqual(captured.extensions, {
        size: '1536x1024',
        style: 'cinematic',
    });
    assert.equal(captured.timeoutMs, undefined);
    assert.equal(result.traceId, 'trace-cloud-image');
    assert.equal(result.images[0]?.uri, 'https://example.com/image.png');
});
