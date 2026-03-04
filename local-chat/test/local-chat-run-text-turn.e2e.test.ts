import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '@nimiplatform/sdk/mod/host';

import { runTextTurn } from '../src/hooks/turn-send/text-turn-runner.ts';

type TestAiClient = {
  generateObject: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
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
    enableVoice: false,
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

test('local-chat runTextTurn e2e: planner object path returns normalized segments', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCalled = 0;
    const aiClient: TestAiClient = {
      generateObject: async () => ({
        object: {
          segments: [
            {
              content: '当然可以，我建议你先把目标拆成今天能完成的一小步。',
              delayMs: 0,
              channel: 'auto',
              intent: 'answer',
              reason: 'object-primary',
            },
          ],
        },
        text: '{"segments":[]}',
        promptTraceId: 'prompt-trace-object-1',
        traceId: 'trace-object-1',
      }),
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

    assert.equal(result.planner, 'object');
    assert.equal(result.retryAttempted, false);
    assert.equal(result.retryImproved, false);
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.includes('建议你先把目标拆成今天能完成的一小步'), true);
    assert.equal(result.traceId, 'trace-object-1');
    assert.equal(generateTextCalled, 0);
  });
});

test('local-chat runTextTurn e2e: fallback path keeps planner reasonCode/trace semantics', async () => {
  await withNoopModSdkHost(async () => {
    const aiClient: TestAiClient = {
      generateObject: async () => {
        throw {
          message: 'planner failed with structured metadata',
          reasonCode: 'AI_PROVIDER_TIMEOUT',
          traceId: 'trace-planner-timeout-1',
        };
      },
      generateText: async () => ({
        text: '我建议你先从最小可执行动作开始，然后观察结果再迭代。',
        promptTraceId: 'prompt-trace-fallback-1',
        traceId: 'trace-fallback-1',
      }),
    };

    const result = await runTextTurn(createBaseInput(aiClient));

    assert.equal(result.planner, 'fallback');
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.length > 0, true);
    assert.equal(result.plannerErrorReasonCode, 'AI_PROVIDER_TIMEOUT');
    assert.equal(result.plannerErrorTraceId, 'trace-planner-timeout-1');
    assert.equal(result.traceId, 'trace-fallback-1');
  });
});

test('local-chat runTextTurn e2e: fallback retries and recovers from prompt-echo first reply', async () => {
  await withNoopModSdkHost(async () => {
    let generateTextCall = 0;
    const aiClient: TestAiClient = {
      generateObject: async () => {
        throw new Error('LOCAL_CHAT_PLAN_INVALID');
      },
      generateText: async () => {
        generateTextCall += 1;
        if (generateTextCall === 1) {
          return {
            text: '1',
            promptTraceId: 'prompt-trace-retry-1',
            traceId: 'trace-retry-1',
          };
        }
        return {
          text: '先做一件你今天就能完成的小事，然后把结果记录下来。',
          promptTraceId: 'prompt-trace-retry-2',
          traceId: 'trace-retry-2',
        };
      },
    };

    const result = await runTextTurn(createBaseInput(aiClient));

    assert.equal(result.planner, 'fallback');
    assert.equal(result.retryAttempted, true);
    assert.equal(result.retryImproved, true);
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.content.includes('先做一件你今天就能完成的小事'), true);
    assert.equal(result.traceId, 'trace-retry-2');
    assert.equal(generateTextCall >= 2, true);
  });
});
