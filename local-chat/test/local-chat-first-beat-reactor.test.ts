import test from 'node:test';
import assert from 'node:assert/strict';

import type { LocalChatContextPacket } from '../src/state/index.ts';
import type { LocalChatTurnAiClient } from '../src/hooks/turn-send/types.ts';
import { FIRST_BEAT_END_MARKER, runFirstBeatReactor } from '../src/hooks/turn-send/first-beat-reactor.ts';

function createContextPacket(): LocalChatContextPacket {
  return {
    turnMode: 'emotional',
    voiceConversationMode: 'off',
    target: {
      interactionProfile: {
        expression: {
          firstBeatStyle: 'gentle',
          pacingBias: 'balanced',
        },
      },
    },
  } as LocalChatContextPacket;
}

function createAiClientFromChunks(
  chunks: string[],
  traceId = 'trace-first-beat',
  finishReason: 'stop' | 'length' = 'stop',
): LocalChatTurnAiClient {
  return {
    streamText: async function* () {
      for (const chunk of chunks) {
        yield { type: 'text_delta', textDelta: chunk };
      }
      yield { type: 'done', traceId, finishReason };
    },
    generateText: async () => ({
      text: `我当然知道是你。${FIRST_BEAT_END_MARKER}`,
      traceId: 'trace-fallback-default',
      promptTraceId: 'trace-fallback-default',
      route: {
        capability: 'text.generate',
        source: 'local',
        provider: 'local',
        model: 'model-a',
        connectorId: '',
        endpoint: '',
        localOpenAiEndpoint: '',
        localProviderEndpoint: '',
        localModelId: '',
        adapter: 'test',
      },
    }),
  } as unknown as LocalChatTurnAiClient;
}

test('first-beat reactor seals on the first complete sentence and stops before later tail text', async () => {
  const previews: string[] = [];
  const result = await runFirstBeatReactor({
    aiClient: createAiClientFromChunks([
      '真的辛苦你了，',
      '先让我接住你。',
      FIRST_BEAT_END_MARKER,
      '这句不应该再进入首拍',
    ]),
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '我今天真的有点撑不住了',
    transientMessageId: 'transient-1',
    onPreview: (preview) => {
      previews.push(preview);
    },
  });

  assert.equal(result.text, '真的辛苦你了，先让我接住你。');
  assert.equal(result.transientMessageId, 'transient-1');
  assert.equal(result.traceId, null);
  assert.equal(result.streamDeltaCount, 3);
  assert.ok(previews.includes('真的辛苦你了，先让我接住你。'));
});

test('first-beat reactor repairs incomplete stream output instead of returning a broken half sentence', async () => {
  let fallbackCalls = 0;
  const previews: string[] = [];
  const result = await runFirstBeatReactor({
    aiClient: {
      ...createAiClientFromChunks([
        '瞧你问的，难道换',
      ], 'trace-long', 'length'),
      generateText: async () => {
        fallbackCalls += 1;
        return {
          text: `瞧你问的，难道换个壳我就认不出你了？${FIRST_BEAT_END_MARKER}`,
          traceId: 'trace-fallback-repair',
          promptTraceId: 'trace-fallback-repair',
          route: {
            capability: 'text.generate',
            source: 'local',
            provider: 'local',
            model: 'model-a',
            connectorId: '',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
      userText: '紫灵，我们来聊聊吧，你知道我是谁吗？',
      transientMessageId: 'transient-long',
      onPreview: (preview) => {
        previews.push(preview);
      },
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(result.text, '瞧你问的，难道换个壳我就认不出你了？');
  assert.equal(result.traceId, 'trace-fallback-repair');
  assert.equal(result.streamDeltaCount, 1);
  assert.deepEqual(previews, []);
});

test('first-beat reactor regenerates a fresh first beat before failing the turn', async () => {
  let generateCalls = 0;
  const previews: string[] = [];
  const result = await runFirstBeatReactor({
    aiClient: {
      ...createAiClientFromChunks([
        '没有灵力...',
      ], 'trace-incomplete', 'length'),
      generateText: async () => {
        generateCalls += 1;
        if (generateCalls === 1) {
          return {
            text: '没有灵力...',
            traceId: 'trace-repair-incomplete',
            promptTraceId: 'trace-repair-incomplete',
            route: {
              capability: 'text.generate',
              source: 'local',
              provider: 'local',
              model: 'model-a',
              connectorId: '',
              endpoint: '',
              localOpenAiEndpoint: '',
              localProviderEndpoint: '',
              localModelId: '',
              adapter: 'test',
            },
          };
        }
        return {
          text: `那你们平时出门更依赖什么交通工具？${FIRST_BEAT_END_MARKER}`,
          traceId: 'trace-regenerated',
          promptTraceId: 'trace-regenerated',
          route: {
            capability: 'text.generate',
            source: 'local',
            provider: 'local',
            model: 'model-a',
            connectorId: '',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '我们出门也有对应的交通工具，但是不是消耗灵力驱动的那种',
    transientMessageId: 'transient-regenerated',
    onPreview: (preview) => {
      previews.push(preview);
    },
  });

  assert.equal(generateCalls, 2);
  assert.equal(result.text, '那你们平时出门更依赖什么交通工具？');
  assert.equal(result.traceId, 'trace-regenerated');
  assert.deepEqual(previews, []);
});

test('first-beat reactor accepts a complete first sentence even when the provider reports finishReason=length', async () => {
  let fallbackCalls = 0;
  const result = await runFirstBeatReactor({
    aiClient: {
      ...createAiClientFromChunks([
        `看来我这点小伎俩还是瞒不过你。${FIRST_BEAT_END_MARKER}`,
      ], 'trace-length-complete', 'length'),
      generateText: async () => {
        fallbackCalls += 1;
        return {
          text: '不该走到这里。',
          traceId: 'trace-should-not-run',
          promptTraceId: 'trace-should-not-run',
          route: {
            capability: 'text.generate',
            source: 'local',
            provider: 'local',
            model: 'model-a',
            connectorId: '',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '你是不是认出我了',
    transientMessageId: 'transient-complete-length',
  });

  assert.equal(fallbackCalls, 0);
  assert.equal(result.text, '看来我这点小伎俩还是瞒不过你。');
  assert.equal(result.traceId, null);
});

test('first-beat reactor accepts short standalone chat replies without terminal punctuation', async () => {
  let fallbackCalls = 0;
  const previews: string[] = [];
  const result = await runFirstBeatReactor({
    aiClient: {
      ...createAiClientFromChunks([
        `我还在听${FIRST_BEAT_END_MARKER}`,
      ], 'trace-short-chat', 'stop'),
      generateText: async () => {
        fallbackCalls += 1;
        return {
          text: `不该走到这里。${FIRST_BEAT_END_MARKER}`,
          traceId: 'trace-should-not-run-short-chat',
          promptTraceId: 'trace-should-not-run-short-chat',
          route: {
            capability: 'text.generate',
            source: 'local',
            provider: 'local',
            model: 'model-a',
            connectorId: '',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '你还在听吗',
    transientMessageId: 'transient-short-chat',
    onPreview: (preview) => {
      previews.push(preview);
    },
  });

  assert.equal(fallbackCalls, 0);
  assert.equal(result.text, '我还在听');
  assert.deepEqual(previews, ['我还在听']);
});

test('first-beat reactor fails instead of inventing a hardcoded reply when all recovery attempts stay incomplete', async () => {
  await assert.rejects(async () => runFirstBeatReactor({
    aiClient: {
      ...createAiClientFromChunks([
        '没有灵力...',
      ], 'trace-emergency', 'length'),
      generateText: async () => ({
        text: '但是，',
        traceId: 'trace-emergency-generate',
        promptTraceId: 'trace-emergency-generate',
        route: {
          capability: 'text.generate',
          source: 'local',
          provider: 'local',
          model: 'model-a',
          connectorId: '',
          endpoint: '',
          localOpenAiEndpoint: '',
          localProviderEndpoint: '',
          localModelId: '',
          adapter: 'test',
        },
      }),
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: {
      ...createContextPacket(),
      turnMode: 'information',
    } as LocalChatContextPacket,
    userText: '我们出门也有对应的交通工具，但是不是消耗灵力驱动的那种',
    transientMessageId: 'transient-emergency',
  }), /LOCAL_CHAT_FIRST_BEAT_UNAVAILABLE/);
});
