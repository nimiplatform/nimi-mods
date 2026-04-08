import assert from 'node:assert/strict';
import test from 'node:test';

import { createSendFlowHarness, createTestTarget, withLocalChatTestEnv } from './helpers/local-chat-test-harness.ts';

test('send-flow skips local route preflight and lets the first runtime call surface route failures', async () => {
  await withLocalChatTestEnv({}, async () => {
    const harness = createSendFlowHarness({
      target: createTestTarget(),
    });

    let checkRouteHealthCalls = 0;
    let streamTextCalls = 0;
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
          };
        },
        async generateText() {
          throw new Error('runtime local model unavailable');
        },
        async generateObject() {
          throw new Error('generateObject should not run after failed first beat');
        },
        async *streamText() {
          streamTextCalls += 1;
          throw new Error('runtime local model unavailable');
        },
        async generateImage() {
          throw new Error('generateImage should not run after failed first beat');
        },
        async generateVideo() {
          throw new Error('generateVideo should not run after failed first beat');
        },
      },
    });

    assert.equal(checkRouteHealthCalls, 0);
    assert.equal(streamTextCalls, 1);
    assert.equal(result.messages.length, 1);
    assert.equal(result.statusBanners.length, 1);
    assert.equal(result.statusBanners[0]?.kind, 'error');
    assert.match(String(result.statusBanners[0]?.message || ''), /runtime local model unavailable/);
  });
});
