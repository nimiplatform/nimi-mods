import test from 'node:test';
import assert from 'node:assert/strict';

import { TEXTPLAY_REASON } from '../src/contracts.ts';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';

function createRenderInput(renderLocale) {
  return {
    renderLocale,
    request: {
      storyId: 'story-1',
      entryEventId: 'entry-1',
      worldId: 'world-1',
      agentId: 'agent-1',
      userId: 'user-1',
      playerName: 'Han Yun',
      playerIdentity: 'Dock courier',
      triggerSource: 'UserTurn',
      userMessage: 'I move toward the signal mast.',
      binding: {
        source: 'cloud',
        connectorId: 'connector-1',
        model: 'fallback-test-model',
        provider: 'test-provider',
        endpoint: 'https://example.invalid',
      },
      runId: 'run-1',
      traceId: 'trace-1',
    },
    deps: {
      hookClient: {
        data: {
          query: async () => ({ ok: true }),
        },
      },
      runtimeClient: {
        listOptions: async () => {
          throw new Error('runtime route lookup should not run when binding is provided');
        },
      },
      aiClient: {
        generateText: async () => {
          throw new Error('model unavailable');
        },
      },
      narrativeEngine: {
        turnResultUpsert: async () => ({
          status: 'APPROVED',
          reasonCode: null,
          actionHint: 'continue',
          traceId: 'trace-1',
          turnId: 'turn-1',
          storyId: 'story-1',
        }),
        turnById: async () => ({
          storyId: 'story-1',
          turnId: 'turn-1',
          triggerSource: 'UserTurn',
          createdAt: '2026-03-13T12:00:00.000Z',
        }),
        projectionRenderInput: async () => ({
          storyId: 'story-1',
          turnId: 'turn-1',
          triggerSource: 'UserTurn',
          player: {
            id: 'user-1',
            name: 'Han Yun',
            identity: 'Dock courier',
          },
          userMessage: 'I move toward the signal mast.',
          scene: {
            summary: 'Rain lashes the docks while the signal mast sways over black water.',
          },
          agent: {
            id: 'agent-1',
            summary: 'The harbor watch tracks every movement through the storm.',
          },
          worldStyle: {
            summary: 'Tense, close, and physical.',
          },
          events: [
            {
              eventId: 'evt-1',
              type: 'scene-beat',
              visibility: 'public',
              content: 'Dock ropes snap under the fresh strain of the weather front.',
              sourceEventIds: ['evt-1'],
            },
          ],
          metrics: {
            tension: 0.84,
          },
        }),
      },
    },
    presenceReports: [],
  };
}

test('render fallback uses english locale-aware copy', async () => {
  const result = await runTextplayRender(createRenderInput('en'));

  assert.equal(result.ok, true);
  assert.equal(result.meta.warnings[0]?.code, TEXTPLAY_REASON.RENDER_FALLBACK_WARN);
  assert.equal(/[一-龥]/u.test(result.text), false);
  assert.match(result.text, /last move|scene|choice/i);
});

test('render fallback preserves chinese copy when locale is zh', async () => {
  const result = await runTextplayRender(createRenderInput('zh'));

  assert.equal(result.ok, true);
  assert.equal(result.meta.warnings[0]?.code, TEXTPLAY_REASON.RENDER_FALLBACK_WARN);
  assert.equal(/[一-龥]/u.test(result.text), true);
});
