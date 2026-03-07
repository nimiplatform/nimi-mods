import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';

import { runTextTurn } from '../src/hooks/turn-send/text-turn-runner.ts';

type TestAiClient = {
  streamText: (input: Record<string, unknown>) => AsyncGenerator<Record<string, unknown>, void, void>;
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
    allowMultiReply: false,
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

test('local-chat runTextTurn e2e: stream path returns normalized segments', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
      streamText: async function* () {
        yield {
          type: 'text_delta',
          textDelta: '当然可以，我建议你先把目标拆成今天能完成的一小步。',
        };
        yield { type: 'done' };
      },
      generateText: async () => {
        generateTextCalled += 1;
        return {
          text: 'should-not-be-used',
          promptTraceId: 'prompt-trace-fallback-unused',
          traceId: 'trace-fallback-unused',
        };
      },
    };

    const result = await runTextTurn(createBaseInput(aiClient));

    assert.equal(result.planner, 'stream');
    assert.equal(result.streamCompleted, true);
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.includes('建议你先把目标拆成今天能完成的一小步'), true);
    assert.equal(result.firstReply.includes('建议你先把目标拆成今天能完成的一小步'), true);
    assert.equal(generateTextCalled, 0);
  });
});

test('local-chat runTextTurn e2e: stream failure is surfaced without generate fallback', async () => {
  await withNoopModSdkHost(async () => {
    const aiClient: TestAiClient = {
      streamText: async function* () {
        throw new Error('stream failed with structured metadata');
      },
      generateText: async () => ({
        text: '我建议你先从最小可执行动作开始，然后观察结果再迭代。',
        promptTraceId: 'prompt-trace-fallback-1',
        traceId: 'trace-fallback-1',
      }),
    };

    await assert.rejects(
      () => runTextTurn(createBaseInput(aiClient)),
      /stream failed with structured metadata/,
    );
  });
});

test('local-chat runTextTurn e2e: empty stream fails close', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCall = 0;
    const aiClient: TestAiClient = {
      streamText: async function* () {
        yield { type: 'done' };
      },
      generateText: async () => {
        generateTextCall += 1;
        return {
          text: '先做一件你今天就能完成的小事，然后把结果记录下来。',
          promptTraceId: 'prompt-trace-fallback-2',
          traceId: 'trace-fallback-2',
        };
      },
    };

    await assert.rejects(
      () => runTextTurn(createBaseInput(aiClient)),
      /LOCAL_CHAT_AI_STREAM_EMPTY/,
    );
    assert.equal(generateTextCall, 0);
  });
});
