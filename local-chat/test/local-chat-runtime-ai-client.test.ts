import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import { createLocalChatAiClient } from '../src/runtime-ai-client.ts';

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
        generate: async (input: { timeoutMs?: number }) => {
          captured.generateTimeoutMs = input.timeoutMs;
          return {
            text: 'ok',
            trace: {
              traceId: 'trace-generate',
            },
          };
        },
        stream: async (input: { timeoutMs?: number }) => {
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
  const streamEvents: Array<{ type: string; traceId?: string }> = [];

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
