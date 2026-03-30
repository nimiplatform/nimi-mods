import assert from 'node:assert/strict';
import test from 'node:test';

import { createSendFlowHarness, createTestTarget, withLocalChatTestEnv } from './helpers/local-chat-test-harness.ts';

test('send-flow blocks local turn before first beat when runtime route health is unavailable', async () => {
  await withLocalChatTestEnv({}, async () => {
    const harness = createSendFlowHarness({
      target: createTestTarget(),
    });

    let checkRouteHealthCalls = 0;
    let generationCalls = 0;
    const result = await harness.executeTurn({
      userText: '你好',
      aiClient: {
        async resolveRoute() {
          return {
            source: 'local',
            provider: 'llama',
            model: 'llama/local-import/Qwen3-4B-Q4_K_M',
          } as never;
        },
        async checkRouteHealth() {
          checkRouteHealthCalls += 1;
          return {
            status: 'unreachable',
            detail: 'runtime local model unavailable',
            reasonCode: 'AI_LOCAL_MODEL_UNAVAILABLE',
            actionHint: 'inspect_local_runtime_model_health',
          };
        },
        async generateText() {
          generationCalls += 1;
          throw new Error('generateText should not run after failed preflight');
        },
        async generateObject() {
          generationCalls += 1;
          throw new Error('generateObject should not run after failed preflight');
        },
        async *streamText() {
          generationCalls += 1;
          throw new Error('streamText should not run after failed preflight');
        },
        async generateImage() {
          generationCalls += 1;
          throw new Error('generateImage should not run after failed preflight');
        },
        async generateVideo() {
          generationCalls += 1;
          throw new Error('generateVideo should not run after failed preflight');
        },
      },
    });

    assert.equal(checkRouteHealthCalls, 1);
    assert.equal(generationCalls, 0);
    assert.equal(result.messages.length, 1);
    assert.equal(result.statusBanners.length, 1);
    assert.equal(result.statusBanners[0]?.kind, 'error');
    assert.equal(result.statusBanners[0]?.message, 'runtime local model unavailable');
  });
});
