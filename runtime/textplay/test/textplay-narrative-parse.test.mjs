import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNarrativeProjectionRenderInputResponse,
} from '../src/data/narrative.ts';
import { TextplayPipelineError } from '../src/pipeline/error.ts';

test('projection response tolerant parse records strict shadow warnings', () => {
  const warnings = [];
  const parsed = parseNarrativeProjectionRenderInputResponse({
    request: {
      storyId: 'story-1',
      turnId: 'turn-1',
      traceId: 'trace-1',
    },
    payload: {
      storyId: 'story-1',
      turnId: 'turn-1',
      triggerSource: 'UserTurn',
      player: 'broken-player',
      userMessage: 'Advance.',
      scene: null,
      agent: 7,
      worldStyle: ['invalid'],
      events: 'not-an-array',
      metrics: 'not-an-object',
    },
    onShadowWarning: (warning) => {
      warnings.push(warning);
    },
  });

  assert.equal(parsed.storyId, 'story-1');
  assert.deepEqual(parsed.player, {});
  assert.deepEqual(parsed.scene, {});
  assert.deepEqual(parsed.agent, {});
  assert.deepEqual(parsed.worldStyle, {});
  assert.deepEqual(parsed.events, []);
  assert.deepEqual(parsed.metrics, {});
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].storyId, 'story-1');
  assert.equal(warnings[0].turnId, 'turn-1');
  assert.ok(warnings[0].issueCount >= 1);
  assert.ok(warnings[0].issues.length >= 1);
});

test('projection response still fails closed when tolerant parse cannot recover', () => {
  assert.throws(
    () => {
      parseNarrativeProjectionRenderInputResponse({
        request: {
          storyId: 'story-1',
          turnId: 'turn-1',
          traceId: 'trace-1',
        },
        payload: {
          triggerSource: 'UserTurn',
        },
      });
    },
    (error) => error instanceof TextplayPipelineError && error.reasonCode === 'TEXTPLAY_INPUT_INVALID',
  );
});
