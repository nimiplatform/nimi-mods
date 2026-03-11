import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';

import {
  resetTextTurnStreamHealthForTests,
  runTextTurn,
} from '../src/hooks/turn-send/text-turn-runner.ts';

type StreamEvent = {
  type: 'text_delta' | 'done';
  textDelta?: string;
  traceId?: string;
  route: {
    source: 'local' | 'cloud';
    model: string;
    localModelId?: string;
    connectorId?: string;
  };
};

type TestAiClient = {
  resolveRoute: () => Promise<ReturnType<typeof createRoute>>;
  streamText: (input: Record<string, unknown>) => AsyncIterable<StreamEvent>;
  generateText: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

function createBaseInput(aiClient: TestAiClient) {
  return {
    flowId: 'local-chat-e2e-flow',
    aiClient,
    invokeInput: {
      capability: 'text.generate' as const,
      prompt: '请根据用户输入回答。',
      maxTokens: 1024,
      mode: 'STORY' as const,
      agentId: 'agent.local-chat.e2e',
      worldId: 'world.e2e',
      routeBinding: undefined,
    },
    prompt: '你是一个友善的智能体。',
    userText: '你好，请给我一个简短建议。',
    allowMultiReply: false,
    pacingPlan: {
      mode: 'single' as const,
      maxSegments: 1 as const,
      energy: 'low' as const,
      reason: 'test-default',
    },
  };
}

function createRoute() {
  return {
    source: 'local' as const,
    model: 'kimi-k2-instruct',
    localModelId: 'kimi-k2-instruct',
  };
}

async function* streamFromDeltas(deltas: string[]): AsyncIterable<StreamEvent> {
  for (const delta of deltas) {
    yield {
      type: 'text_delta',
      textDelta: delta,
      route: createRoute(),
    };
  }
  yield {
    type: 'done',
    traceId: 'trace-stream-success',
    route: createRoute(),
  };
}

async function* failingStream(message: string): AsyncIterable<StreamEvent> {
  throw new Error(message);
}

async function* emptyStream(): AsyncIterable<StreamEvent> {
  yield {
    type: 'done',
    route: createRoute(),
  };
}

async function withNoopModSdkHost(run: () => Promise<void>): Promise<void> {
  setModSdkHost({
    logging: {
      emitRuntimeLog: () => {},
      createRendererFlowId: (prefix: string) => `${prefix}-test`,
      logRendererEvent: () => {},
    },
  } as never);
  try {
    await run();
  } finally {
    clearModSdkHost();
  }
}

test('local-chat runTextTurn e2e: stream path returns normalized segments without generateText fallback', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    let generateTextCalled = 0;
    const streamedChunks: string[] = [];
    const streamInputs: Array<Record<string, unknown>> = [];
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: async function* (input) {
        streamInputs.push(input);
        for await (const event of streamFromDeltas([
          '当然可以，',
          '我建议你先把目标拆成今天能完成的一小步。',
        ])) {
          streamedChunks.push(String(event.textDelta || ''));
          yield event;
        }
      },
      generateText: async () => {
        generateTextCalled += 1;
        return {
          text: 'should-not-be-used',
          promptTraceId: 'prompt-trace-fallback-unused',
          traceId: 'trace-fallback-unused',
          route: createRoute(),
        };
      },
    };

    const result = await runTextTurn({
      ...createBaseInput(aiClient),
      onStreamDelta: (delta) => {
        streamedChunks.push(delta);
      },
    });

    assert.equal(result.planner, 'stream');
    assert.equal(result.streamCompleted, true);
    assert.equal(result.streamDeltaCount, 2);
    assert.equal(result.segmentParseMode, 'single-message');
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.includes('建议你先把目标拆成今天能完成的一小步'), true);
    assert.equal(result.firstReply, result.segments[0]?.content);
    assert.equal(generateTextCalled, 0);
    assert.equal(streamedChunks.length >= 2, true);
    assert.equal(typeof streamInputs[0]?.timeoutMs, 'number');
    assert.equal(Number(streamInputs[0]?.timeoutMs) > 0, true);
    assert.equal(result.traceId, 'trace-stream-success');
  });
});

test('local-chat runTextTurn e2e: stream failure falls back to generateText', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    let generateTextCalled = 0;
    const generateInputs: Array<Record<string, unknown>> = [];
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: () => failingStream('AI_PROVIDER_TIMEOUT'),
      generateText: async (input) => {
        generateTextCalled += 1;
        generateInputs.push(input);
        return {
          text: '我建议你先从最小可执行动作开始，然后观察结果再迭代。',
          promptTraceId: 'prompt-trace-fallback-1',
          traceId: 'trace-fallback-1',
          route: createRoute(),
        };
      },
    };

    const result = await runTextTurn(createBaseInput(aiClient));

    assert.equal(result.planner, 'stream');
    assert.equal(result.streamCompleted, false);
    assert.equal(result.streamDeltaCount, 0);
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content, '我建议你先从最小可执行动作开始，然后观察结果再迭代。');
    assert.equal(result.firstReply, '我建议你先从最小可执行动作开始，然后观察结果再迭代。');
    assert.equal(generateTextCalled, 1);
    assert.equal(typeof generateInputs[0]?.timeoutMs, 'number');
    assert.equal(Number(generateInputs[0]?.timeoutMs) > 0, true);
  });
});

test('local-chat runTextTurn e2e: empty stream falls back to generateText result', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: () => emptyStream(),
      generateText: async () => {
        generateTextCalled += 1;
        return {
          text: '先做一件你今天就能完成的小事，然后把结果记录下来。',
          promptTraceId: 'prompt-trace-fallback-2',
          traceId: 'trace-fallback-2',
          route: createRoute(),
        };
      },
    };

    const result = await runTextTurn(createBaseInput(aiClient));

    assert.equal(result.planner, 'stream');
    assert.equal(result.streamCompleted, false);
    assert.equal(result.streamDeltaCount, 0);
    assert.equal(result.segmentParseMode, 'single-message');
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.includes('先做一件你今天就能完成的小事'), true);
    assert.equal(result.firstReply, result.segments[0]?.content);
    assert.equal(generateTextCalled, 1);
  });
});

test('local-chat runTextTurn e2e: stream health degradation skips stream after AI_INPUT_INVALID', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    let streamTextCalled = 0;
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: async function* () {
        streamTextCalled += 1;
        throw Object.assign(new Error('retry stream request'), {
          reasonCode: 'AI_INPUT_INVALID',
        });
      },
      generateText: async () => {
        generateTextCalled += 1;
        return {
          text: '我会先用普通生成兜底，避免你每次都撞到坏 stream。',
          promptTraceId: `prompt-trace-fallback-${generateTextCalled}`,
          traceId: `trace-fallback-${generateTextCalled}`,
          route: createRoute(),
        };
      },
    };

    const firstResult = await runTextTurn(createBaseInput(aiClient));
    const secondResult = await runTextTurn(createBaseInput(aiClient));

    assert.equal(firstResult.segments[0]?.content, '我会先用普通生成兜底，避免你每次都撞到坏 stream。');
    assert.equal(secondResult.segments[0]?.content, '我会先用普通生成兜底，避免你每次都撞到坏 stream。');
    assert.equal(streamTextCalled, 1);
    assert.equal(generateTextCalled, 2);
  });
});

test('local-chat runTextTurn e2e: pacing plan can split single-message fallback into answer + followup', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: () => emptyStream(),
      generateText: async () => ({
        text: '可以。你先把今天最重要的一步做完。做完再回来告诉我，我帮你继续拆。',
        promptTraceId: 'prompt-trace-pacing-plan',
        traceId: 'trace-pacing-plan',
        route: createRoute(),
      }),
    };

    const result = await runTextTurn({
      ...createBaseInput(aiClient),
      allowMultiReply: true,
      pacingPlan: {
        mode: 'answer-followup',
        maxSegments: 2,
        energy: 'medium',
        reason: 'test-answer-followup',
      },
    });

    assert.equal(result.segments.length, 2);
    assert.equal(result.segmentParseMode, 'double-newline');
    assert.match(result.segments[0]?.content || '', /你先把今天最重要的一步做完/);
    assert.match(result.segments[1]?.content || '', /我帮你继续拆/);
  });
});

test('local-chat runTextTurn e2e: pacing plan can split streamed single-message output into multiple replies', async () => {
  await withNoopModSdkHost(async () => {
    resetTextTurnStreamHealthForTests();
    const aiClient: TestAiClient = {
      resolveRoute: async () => createRoute(),
      streamText: () => streamFromDeltas([
        '可以。你先把今天最重要的一步做完。做完再回来告诉我，我帮你继续拆。',
      ]),
      generateText: async () => ({
        text: 'should-not-be-used',
        promptTraceId: 'prompt-trace-unused-stream-pacing',
        traceId: 'trace-unused-stream-pacing',
        route: createRoute(),
      }),
    };

    const result = await runTextTurn({
      ...createBaseInput(aiClient),
      allowMultiReply: true,
      pacingPlan: {
        mode: 'answer-followup',
        maxSegments: 2,
        energy: 'medium',
        reason: 'test-stream-answer-followup',
      },
    });

    assert.equal(result.streamCompleted, true);
    assert.equal(result.segments.length, 2);
    assert.equal(result.segmentParseMode, 'double-newline');
    assert.match(result.segments[0]?.content || '', /你先把今天最重要的一步做完/);
    assert.match(result.segments[1]?.content || '', /我帮你继续拆/);
  });
});
