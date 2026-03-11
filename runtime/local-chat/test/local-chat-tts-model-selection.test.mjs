import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEffectiveModelForScenario } from '../src/services/route/connector-model-capabilities.ts';

test('resolveEffectiveModelForScenario keeps configured model when it is still supported', () => {
  const model = resolveEffectiveModelForScenario({
    configuredModel: 'qwen3-tts-instruct-flash-2026-01-26',
    routeSelectedModel: 'qwen-tts',
    models: [
      'qwen3-tts-instruct-flash-2026-01-26',
      'qwen3-tts-vc',
      'qwen-tts',
    ],
    scenario: 'audio.synthesize',
  });
  assert.equal(model, 'qwen3-tts-instruct-flash-2026-01-26');
});

test('resolveEffectiveModelForScenario falls back to route selected model when configured model is stale', () => {
  const model = resolveEffectiveModelForScenario({
    configuredModel: 'deprecated-tts-model',
    routeSelectedModel: 'qwen-tts',
    models: [
      'qwen3-tts-instruct-flash-2026-01-26',
      'qwen3-tts-vc',
      'qwen-tts',
    ],
    scenario: 'audio.synthesize',
  });
  assert.equal(model, 'qwen-tts');
});

test('resolveEffectiveModelForScenario falls back to first supported candidate when route selected model is unavailable', () => {
  const model = resolveEffectiveModelForScenario({
    configuredModel: '',
    routeSelectedModel: 'legacy-route-model',
    models: [
      'qwen3-tts-instruct-flash-2026-01-26',
      'qwen3-tts-vc',
    ],
    scenario: 'audio.synthesize',
  });
  assert.equal(model, 'qwen3-tts-instruct-flash-2026-01-26');
});
