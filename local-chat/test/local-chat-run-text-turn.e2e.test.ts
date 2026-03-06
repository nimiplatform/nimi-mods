import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';

import { runTextTurn } from '../src/hooks/turn-send/text-turn-runner.ts';

type StreamEvent = {
  type: 'text_delta' | 'done';
  textDelta?: string;
  route: {
    source: 'local-runtime' | 'token-api';
    model: string;
    localModelId?: string;
    connectorId?: string;
  };
};

type TestAiClient = {
  streamText: (input: Record<string, unknown>) => AsyncIterable<StreamEvent>;
  generateText: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

function createBaseInput(aiClient: TestAiClient) {
  return {
    flowId: 'local-chat-e2e-flow',
    aiClient,
    invokeInput: {
      routeHint: 'chat/default' as const,
      prompt: '请根据用户输入回答。',
      maxTokens: 1024,
      mode: 'STORY' as const,
      agentId: 'agent.local-chat.e2e',
      worldId: 'world.e2e',
      routeOverride: undefined,
    },
    prompt: '你是一个友善的智能体。',
    userText: '你好，请给我一个简短建议。',
    allowMultiReply: false,
  };
}

function createRoute() {
  return {
    source: 'local-runtime' as const,
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
    let generateTextCalled = 0;
    const streamedChunks: string[] = [];
    const aiClient: TestAiClient = {
      streamText: async function* () {
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
  });
});

test('local-chat runTextTurn e2e: stream failure falls back to generateText', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
      streamText: () => failingStream('AI_PROVIDER_TIMEOUT'),
      generateText: async () => {
        generateTextCalled += 1;
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
  });
});

test('local-chat runTextTurn e2e: empty stream falls back to generateText result', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
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
